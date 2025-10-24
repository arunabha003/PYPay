# 📚 PyPay Technical Reference

Complete technical deep-dive for developers implementing, extending, or integrating with PyPay. This guide explains the architecture, implementation details, and design decisions behind the passwordless PYUSD payment gateway.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Smart Contract Architecture](#2-smart-contract-architecture)
3. [ERC-4337 Account Abstraction](#3-erc-4337-account-abstraction)
4. [Authentication System](#4-authentication-system)
5. [Payment Processing](#5-payment-processing)
6. [Backend Services](#6-backend-services)
7. [Frontend Architecture](#7-frontend-architecture)

---

## 1. System Overview

PyPay is a production-ready PYUSD payment gateway built on ERC-4337 account abstraction. The system eliminates traditional crypto payment barriers through passwordless authentication, automatic gas sponsorship, and intelligent cross-chain routing. The architecture consists of three primary layers: smart contracts deployed on Ethereum Sepolia and Arbitrum Sepolia, off-chain backend services managing authentication and coordination, and frontend applications for merchants and customers.

The payment flow operates as follows. Merchants create invoices through the merchant dashboard which generates QR codes containing invoice identifiers. Customers scan these codes and authenticate using device biometrics via WebAuthn. The system creates counterfactual smart accounts without requiring deployment transactions. Session keys enable gasless payments by eliminating repeated signature prompts. A cost engine analyzes gas prices across both chains every fifteen seconds, automatically selecting the cheapest execution path. When customers hold PYUSD on a different chain than the invoice requirement, the bridge coordinator automatically transfers funds using a lock-release mechanism. Paymasters sponsor all gas costs making transactions completely free for end users.

The codebase follows a turborepo monorepo structure located in `/Users/arunabha003/Documents/Projects/PYPay`. Smart contracts reside in `packages/contracts` using Foundry for compilation and deployment. Backend services are split into three applications: `apps/indexer` for blockchain event monitoring, `apps/relayer` for transaction submission and authentication, and `apps/cost-engine` for real-time gas price tracking. The frontend lives in `apps/web` built with Next.js 15. Shared TypeScript types and configuration are centralized in `packages/common`.

---

## 2. Smart Contract Architecture

The smart contract layer implements all on-chain logic for merchant registration, invoice management, payment settlement, account abstraction, and cross-chain bridging. All contracts are written in Solidity 0.8.27 and deployed using Foundry with 9,999,999 optimization runs for maximum gas efficiency.

### MerchantRegistry Contract

The MerchantRegistry contract (`packages/contracts/src/MerchantRegistry.sol`) maintains the canonical list of registered merchants across both chains. Each merchant entry contains three critical fields: a payout address where PYUSD settlements are sent, a fee basis point value representing platform commission (stored as 0-1000 for 0-10%), and an active boolean flag controlling whether the merchant can create new invoices.

Registration occurs through the `registerMerchant` function restricted to contract owners via OpenZeppelin's Ownable pattern. The function accepts a merchant address, payout address, and fee basis points, storing these in a mapping keyed by merchant address. This design allows merchants to separate their authentication wallet from their settlement wallet, enabling custody solutions where merchants authenticate with hot wallets but receive payments to cold storage.

The contract exposes three view functions used throughout the system. `isActive(address merchant)` returns whether a merchant can currently create invoices, called by both the Invoice contract during creation and the TapKitPaymaster during payment validation. `getMerchant(address merchant)` returns the complete Merchant struct containing all registration details. `payoutOf(address merchant)` specifically returns just the payout address, used by the Checkout contract when transferring PYUSD after settlement.

Deployment scripts are located in `packages/contracts/script/Deploy.s.sol` which deploys identical registry contracts to both Ethereum Sepolia (address: `0xa47749699925e9187906f5a0361d5073397279b3`) and Arbitrum Sepolia (address: `0xb65901d4d41d6389827b2c23d6c92b29991865d9`). The `SeedMerchant.s.sol` script demonstrates registering test merchants post-deployment.

### Invoice Contract

The Invoice contract (`packages/contracts/src/Invoice.sol`) creates unique invoice identifiers on-chain without storing full invoice data. This design minimizes storage costs since invoice details are maintained off-chain in the indexer database with only existence and cancellation state persisted on-chain.

Invoice creation follows a deterministic pattern. The `createInvoice` function accepts six parameters: merchant address, PYUSD amount in 6-decimal format, expiration timestamp, memo hash for reference, destination chain ID, and a salt for uniqueness. These values are ABI-encoded and hashed using keccak256 to produce a unique invoice ID. The function verifies the merchant is active via a staticcall to MerchantRegistry, marks the invoice ID as existing in the `exists` mapping, and emits an `InvoiceCreated` event containing all invoice parameters.

The deterministic ID generation enables counterfactual invoice creation where the frontend can calculate invoice IDs client-side before transactions confirm. This allows merchants to display QR codes immediately while the creation transaction processes asynchronously. The on-chain contract merely validates these IDs match the expected parameters during payment settlement.

Cancellation functionality exists through `cancelInvoice(bytes32 invoiceId)` which sets the `cancelled` mapping to true. The Checkout contract checks this flag before processing payments, preventing settlement of cancelled invoices. The `isValid` view function combines existence, cancellation, and expiration checks returning true only if an invoice exists, isn't cancelled, and hasn't expired.

Event emission is critical for off-chain indexing. The `InvoiceCreated` event contains all invoice parameters allowing the indexer to persist full invoice details in PostgreSQL. The indexer (`apps/indexer/src/watchers/invoice.ts`) watches these events on both chains, decodes the parameters, and stores them for frontend retrieval via REST APIs.

### Checkout Contract

The Checkout contract (`packages/contracts/src/Checkout.sol`) handles the final payment settlement and PYUSD transfer from customers to merchants. This is the contract that TapKitPaymaster validates and that customer smart accounts call when executing payments.

The core function is `settle` which accepts an InvoiceTuple struct containing invoice parameters, the payer address, and optional Permit2 calldata for gasless approvals. Settlement begins with invoice validation reconstructing the invoice ID from tuple parameters and verifying it matches the expected hash. The contract queries MerchantRegistry to confirm the merchant is active and retrieves their payout address. It checks the invoice hasn't been paid via the `paid` mapping, confirms expiration hasn't passed, and validates the chain ID matches the current chain.

PYUSD transfer logic uses SafeTransferLib from Solady providing protection against non-standard ERC20 implementations. The contract attempts to use Permit2 if calldata is provided, falling back to standard `transferFrom` if Permit2 data is empty. This dual-path approach enables gasless approvals when users sign permits but maintains compatibility with pre-approved balances. The transfer amount comes directly from the invoice tuple, and the destination is the merchant's payout address from the registry.

Receipt generation occurs through event emission and return value. After successful transfer, the contract marks the invoice as paid in the `paid` mapping preventing double-payment attacks. It calculates a receipt ID by hashing the invoice ID with block timestamp and transaction hash creating a unique settlement proof. The `Settled` event emits with invoice ID, payer address, merchant address, amount, and receipt ID. This event is watched by the indexer which marks invoices as paid and stores settlement details.

The contract's integration with TapKitPaymaster is critical. The paymaster's `validatePaymasterUserOp` function decodes UserOperation calldata extracting the target address and function selector. It verifies the target equals the Checkout contract address and the selector matches `settle`. This ensures sponsored gas only applies to legitimate payment transactions rather than arbitrary smart account operations.

### TapKitAccount Contract

The TapKitAccount contract (`packages/contracts/src/TapKitAccount.sol`) implements the customer's smart account with ERC-4337 compatibility and session key support. This contract extends Solady's ERC4337 base providing gas-optimized UserOperation handling and execution methods.

Account initialization occurs in the constructor accepting three parameters: the ERC-4337 EntryPoint address, an owner address derived from the passkey public key, and a guardian address controlled by the relayer service. The owner represents the user's permanent credential while the guardian has limited authority to enable session keys. Storage uses immutable variables for gas efficiency since these values never change after deployment.

Session key management implements a mapping from public key hashes to SessionKey structs. Each struct contains a validUntil timestamp, a policyId for future permission expansion, and an active boolean. The `enableSessionKey` function accepts a public key hash, expiration timestamp, policy ID, and guardian signature. It validates the guardian signature using SignatureCheckerLib from Solady which supports both EOA signers via ecrecover and contract signers via ERC-1271. The signature proves guardian authorization without giving guardians direct spending power.

Signature validation in `_validateUserOpSignature` follows ERC-4337 patterns. The function receives a PackedUserOperation containing sender, nonce, calldata, gas limits, fees, paymaster data, and signature bytes. It extracts the signature mode from the first byte: 0x00 indicates passkey owner signature, 0x01 indicates session key signature. For passkey mode, it uses WebAuthn's P-256 signature verification following the FCL (Fresh Crypto Lib) implementation pattern. For session key mode, it extracts the 64-byte ECDSA public key from signature bytes 1-65, hashes it with keccak256 to get the public key hash, loads the corresponding SessionKey struct, validates it's active and not expired, then recovers the signer using ecrecover and verifies it matches the public key's derived address.

The execute function implements Solady's ERC4337 execute pattern restricted to EntryPoint via `onlyEntryPoint` modifier. It accepts a target address, ETH value, and calldata bytes, performs a low-level call with specified parameters, and returns success status and return data. This generic execution pattern allows smart accounts to interact with any contract while maintaining EntryPoint access control. The Checkout settlement flow uses this: UserOperations specify the account as sender, Checkout as target, zero value, and settle function calldata.

Account deployment follows CREATE2 determinism through AccountFactory. The factory predicts addresses using the factory address, salt derived from owner/guardian/nonce, and initialization code hash. Accounts exist counterfactually until their first UserOperation triggers deployment via the EntryPoint. This enables receiving funds before deployment since the address is known deterministically.

### TapKitAccountFactory Contract

The AccountFactory contract (`packages/contracts/src/TapKitAccountFactory.sol`) deploys TapKitAccount instances using CREATE2 for deterministic addresses. The factory maintains a reference to the ERC-4337 EntryPoint and the TapKitAccount implementation address.

The `createAccount` function accepts owner address, guardian address, and salt value. It calculates the deployment salt by hashing these three parameters together creating uniqueness per owner-guardian combination. The function then uses Solady's LibClone.cloneDeterministic to deploy an ERC1967 proxy pointing to the TapKitAccount implementation. This proxy pattern reduces deployment costs from ~180,000 gas to ~45,000 gas per account since only the lightweight proxy deploys rather than the full implementation bytecode.

Address prediction through `getAddress` enables counterfactual account usage. The function performs the same salt calculation and clone prediction as deployment without executing the creation. This allows clients to know account addresses before deployment, send funds to them, and have deployment occur automatically during the first UserOperation when the EntryPoint's `createSender` function executes if initCode is non-empty.

The deployment script `packages/contracts/script/Deploy.s.sol` first deploys the TapKitAccount implementation, then deploys the factory with the implementation address. The implementation is never called directly - all interactions go through factory-created proxies. This upgradeable pattern theoretically allows implementation swaps, though in production accounts would require explicit migration since they reference specific implementations.

### TapKitPaymaster Contract

The TapKitPaymaster contract (`packages/contracts/src/TapKitPaymaster.sol`) implements ERC-4337's IPaymaster interface providing gas sponsorship for valid PYUSD payment transactions. This contract is critical for the gasless user experience - it validates that UserOperations represent legitimate payments and agrees to pay gas costs on behalf of users.

The paymaster's state includes immutable references to the Checkout contract, MerchantRegistry contract, and PYUSD token address. These are set during construction and define the only payment flow the paymaster will sponsor. Additionally, it stores a `maxAmountPerTx` value limiting the maximum invoice amount eligible for sponsorship, preventing abuse scenarios where attackers create enormous invoices to drain paymaster deposits.

The core validation logic resides in `validatePaymasterUserOp` which the EntryPoint calls during UserOperation validation. This function receives the full PackedUserOperation struct, the UserOperation hash, and the maximum cost in wei for sponsorship. It must return validation data (0 for success, 1 for failure) and context bytes passed to the postOp hook.

Validation begins with calldata analysis. The function extracts the target address from the first 20 bytes of UserOperation calldata and the function selector from bytes 20-24. It verifies the target equals the Checkout contract address ensuring the UserOperation will call settle. Next, it decodes the complete InvoiceTuple from calldata bytes 24 onward using abi.decode with the settle function signature. This extracts merchant address, amount, expiry, chain ID, memo hash, and invoice ID from the nested calldata structure.

Invoice validation checks multiple conditions. The paymaster queries MerchantRegistry.isActive(merchant) confirming the merchant can accept payments. It verifies the invoice amount is non-zero and below maxAmountPerTx preventing zero-value transactions and excessive amounts. It checks the expiry timestamp exceeds block.timestamp ensuring the invoice hasn't expired. It validates chainId matches block.chainid preventing cross-chain invoice usage. Finally, it queries Checkout.paid(invoiceId) ensuring the invoice hasn't already been settled preventing double-payment attacks.

Gas deposit management occurs through the EntryPoint's deposit system. The paymaster must maintain sufficient ETH deposits in the EntryPoint contract to cover sponsored transactions. The deployment script `StakePaymaster.s.sol` deposits 0.02 ETH per paymaster during initialization. The `postOp` hook allows the paymaster to perform cleanup after UserOperation execution, though the current implementation is empty since PYUSD transfers don't require refunds.

The paymaster's security model relies on strict validation. By only sponsoring Checkout.settle calls with validated invoices, it prevents attackers from using sponsored gas for arbitrary transactions. The merchant verification ensures only legitimate businesses receive payments. The amount limit caps potential losses from compromised or malicious merchants. The expiration check prevents replay attacks using old invoices. This multi-layer validation creates a secure sponsorship boundary.

### BridgeEscrow Contract

The BridgeEscrow contract (`packages/contracts/src/BridgeEscrow.sol`) implements cross-chain PYUSD transfers using a lock-and-release inventory model. Unlike traditional bridges that mint/burn tokens, this escrow maintains PYUSD inventory on both chains enabling instant releases without waiting for cross-chain message passing.

Contract initialization sets the PYUSD token address and owner address (the relayer wallet). The owner has exclusive permission to call the release function preventing unauthorized inventory withdrawals. The contract maintains three key mappings: `lockProcessed` tracking which locks have been acknowledged, `releaseProcessed` preventing duplicate releases, and `lockedAmounts` storing how much PYUSD each lock contains.

The lock function `lockForBridge` accepts a bridge reference ID and PYUSD amount. It uses SafeTransferLib to pull PYUSD from the caller into the escrow contract. It marks the bridge reference as processed in the lockProcessed mapping preventing double-processing. It stores the locked amount in the lockedAmounts mapping for accounting. Finally, it emits a BridgeLocked event containing the bridge reference, user address, amount, destination chain ID, and recipient address. This event is critical - the relayer watches for BridgeLocked events to initiate the release process on the destination chain.

Bridge reference calculation uses deterministic hashing. The reference is generated as `keccak256(abi.encode(sourceChainId, destChainId, user, amount, nonce))` where nonce increments per user preventing reference collisions. This deterministic pattern enables the relayer to independently calculate references on both chains ensuring lock-release matching.

The release function `releaseForBridge` transfers PYUSD from escrow inventory to recipients on the destination chain. It accepts a bridge reference and recipient address. First, it verifies the caller is the contract owner through the onlyOwner modifier. It checks the reference hasn't been released via the releaseProcessed mapping preventing double-releases and replay attacks. It queries the contract's PYUSD balance ensuring sufficient inventory exists for the release. It marks the reference as released, transfers PYUSD to the recipient, and emits a BridgeReleased event.

Inventory management happens through owner-controlled functions. `depositInventory` allows the owner to add PYUSD to the escrow increasing available inventory. `withdrawInventory` allows removing excess PYUSD reducing inventory. The relayer monitors inventory levels across both chains and rebalances when one chain runs low. For example, if Arbitrum inventory drops below 10,000 PYUSD while Ethereum holds 40,000 PYUSD, the relayer initiates a bridge transfer from Ethereum to Arbitrum replenishing the inventory.

Security considerations include the inventory availability check preventing releases that would overdraw the escrow. The reference-based replay protection ensures each bridge operation processes exactly once on each chain. The owner-only release restriction prevents unauthorized withdrawals. The event emissions enable off-chain monitoring and alerting if inventory depletes or suspicious activity occurs.

Deployment scripts in `packages/contracts/script/Deploy.s.sol` deploy identical BridgeEscrow contracts to both chains. The `FundBridgeInventory.s.sol` script seeds initial inventory on both chains. The `ApproveBridge.s.sol` script approves the BridgeEscrow contracts to spend test accounts' PYUSD enabling lock operations during testing.

---

## 3. ERC-4337 Account Abstraction

PyPay's account abstraction implementation enables passwordless authentication and gasless transactions through the ERC-4337 standard. This section explains how UserOperations, EntryPoint interaction, signature validation, and session keys work together to create the seamless payment experience.

### UserOperation Structure

UserOperations are pseudo-transaction objects representing user intentions that bundlers submit to the EntryPoint for execution. Each UserOperation contains sender (smart account address), nonce (anti-replay counter), initCode (deployment code for counterfactual accounts), callData (execution instructions), callGasLimit (gas for main execution), verificationGasLimit (gas for validation), preVerificationGas (gas for bundler overhead), maxFeePerGas and maxPriorityFeePerGas (EIP-1559 gas pricing), paymasterAndData (paymaster address plus validation data), and signature (authorization proof).

The UserOperation lifecycle begins with construction in the frontend (`apps/web/lib/userOp.ts`). The buildUserOp function accepts target contract, calldata, account address, chain ID, and optional paymaster data. It queries the account's nonce from the EntryPoint contract by calling getNonce(sender, 0) where 0 is the nonce key for standard operations. For counterfactual accounts not yet deployed, it constructs initCode by concatenating the AccountFactory address and the encoded createAccount function call. For deployed accounts, initCode is empty (0x).

CallData encoding follows the account's execute function signature. For Checkout settlements, callData is `encodeFunctionData(accountAbi.execute, [checkoutAddress, 0, settleFunctionData])` where settleFunctionData contains the encoded settle call with InvoiceTuple parameters. This nested encoding allows smart accounts to call any contract while maintaining the execute abstraction layer.

Gas limit estimation uses static values based on operation type. Direct payments typically require 174,000 gas total split as 120,000 callGasLimit, 40,000 verificationGasLimit, and 14,000 preVerificationGas. Bridge operations need higher limits around 145,000 callGasLimit for the lock transaction. These estimates come from gas profiling during development and include safety margins.

Gas pricing uses chain-specific values fetched from providers. The frontend calls `provider.getFeeData()` obtaining maxFeePerGas and maxPriorityFeePerGas. For Arbitrum Sepolia, typical values are 0.1 gwei maxFee and 0.1 gwei priority. For Ethereum Sepolia, they're higher around 2.5 gwei. These prices are multiplied by total gas limits to calculate maximum ETH costs which paymasters must deposit to cover.

Paymaster data integration occurs after initial UserOperation construction. The frontend sends the unsigned UserOperation to the relayer's `/paymaster/sponsor` endpoint. The relayer validates the operation, queries the paymaster contract for willingness to sponsor, and returns paymasterAndData bytes. This data contains the paymaster address (20 bytes), validUntil timestamp (6 bytes), validAfter timestamp (6 bytes), and paymaster signature (65 bytes) totaling 97 bytes. The frontend updates the UserOperation's paymasterAndData field with these bytes.

Signature generation differs for passkey vs session key modes. For passkey signatures (mode 0x00), the frontend initiates WebAuthn authentication via `navigator.credentials.get()` receiving an assertion containing a P-256 signature over the UserOperation hash. This signature is formatted as `0x00 + authenticatorData + clientDataJSON + signature` following WebAuthn standards. For session key signatures (mode 0x01), the frontend uses the ephemeral private key stored in sessionStorage to sign the UserOperation hash via ECDSA producing a 65-byte signature. The final signature is `0x01 + sessionPublicKey (64 bytes) + ecdsaSignature (65 bytes)` totaling 130 bytes.

UserOperation hashing follows ERC-4337 specification. The hash is `keccak256(packUserOp(userOp), entryPointAddress, chainId)` where packUserOp encodes all UserOperation fields except signature into a single bytes array. This hash is what signatures must validate against. The frontend calculates this hash using `getUserOpHash` from the UserOperation utility library, passing it to signature functions.

### EntryPoint Interaction

The EntryPoint contract (deployed at `0x0000000071727De22E5E9d8BAf0edAc6f37da032` on all chains) serves as the central coordinator for ERC-4337 operations. Bundlers submit UserOperations to the EntryPoint's `handleOps` function which executes a two-phase process: validation then execution.

During the validation phase, the EntryPoint first calls the smart account's `validateUserOp` function. This function must verify the signature corresponds to an authorized signer (owner or valid session key), check the nonce is correct preventing replays, and pay the EntryPoint for gas costs if the account lacks paymaster sponsorship. The validation function returns a validationData integer where 0 indicates success and any other value indicates failure.

If a paymaster is specified via non-empty paymasterAndData, the EntryPoint next calls the paymaster's `validatePaymasterUserOp` function. This validates the paymaster is willing to sponsor gas for this specific UserOperation by checking operation parameters against sponsorship policies. The paymaster returns context bytes and validationData. Context bytes pass information from validation to the postOp hook after execution. ValidationData indicates success or failure along with optional time bounds.

The execution phase begins only if both account and paymaster validations succeed. The EntryPoint calls the account's `execute` function with the callData from the UserOperation. The account performs the requested operation, such as calling Checkout.settle with invoice parameters. If execution reverts, the EntryPoint catches the revert and continues processing other UserOperations in the batch. If execution succeeds, the EntryPoint calls the paymaster's `postOp` hook allowing cleanup or refund logic.

Gas accounting happens throughout this process. The EntryPoint tracks actual gas consumed during validation and execution. It bills gas costs to the paymaster's deposit (if using paymaster) or to the account's ETH balance (if self-paying). Maximum gas costs are capped by the UserOperation's gas limit fields preventing infinite gas attacks. Unused gas refunds to the bundler as compensation for transaction submission.

The bundler's role is submitting UserOperations to the EntryPoint. Bundlers are off-chain actors running nodes that collect UserOperations from users, simulate them to ensure profitability, batch multiple operations into a single Ethereum transaction calling `handleOps`, and submit this transaction on-chain. In PyPay's testnet deployment, the relayer acts as its own bundler by submitting operations directly via ethers.js wallet transactions. In production, this would use specialized bundler infrastructure like Alchemy's UserOperation APIs or Pimlico's bundler network.

### Session Key Implementation

Session keys enable gasless sequential payments without repeated passkey authentication. They are ephemeral ECDSA keypairs generated client-side and authorized through guardian attestation. The implementation spans smart contract storage, relayer attestation, and frontend key management.

Session key generation occurs in `apps/web/lib/sessionKey.ts`. The generateSessionKey function uses viem's `generatePrivateKey()` creating a random 32-byte ECDSA private key. It derives the public key using `privateKeyToAccount(privateKey).publicKey` obtaining the uncompressed 65-byte public key starting with 0x04. It removes the 0x04 prefix leaving 64 bytes of pure coordinate data (32-byte X, 32-byte Y). It hashes these 64 bytes with keccak256 producing the public key hash that will be stored on-chain. Finally, it stores the private key, public key, and hash in sessionStorage with a validUntil timestamp (typically 30 minutes from generation).

Guardian attestation provides authorization without giving guardians spending power. The frontend sends the session public key, validUntil timestamp, and policy ID to the relayer's `/session/attest` endpoint. The relayer verifies the request comes from an authenticated user by checking the JWT session token. It reconstructs the attestation message as `keccak256(abi.encodePacked(accountAddress, pubKeyHash, validUntil, policyId))`. It signs this message using the guardian private key producing a 65-byte ECDSA signature. It returns the signature to the frontend which includes it in the enableSessionKey call.

On-chain enablement occurs through the TapKitAccount's `enableSessionKey` function. The frontend constructs a UserOperation calling this function with the public key hash, validUntil, policyId, and guardian signature. The contract verifies the guardian signature using SignatureCheckerLib which supports both EOA signatures via ecrecover and ERC-1271 contract signatures via interface calls. If the signature is valid, it stores the SessionKey struct in the sessionKeys mapping indexed by public key hash. The struct contains validUntil for time-based expiration, policyId for future permission expansion, and active set to true.

Session key validation happens during UserOperation signature checks. When `_validateUserOpSignature` receives a signature starting with 0x01 (session key mode), it extracts the 64-byte public key from bytes 1-65. It hashes this key producing the public key hash that indexes the sessionKeys mapping. It loads the corresponding SessionKey struct and validates three conditions: active must be true, block.timestamp must be less than or equal to validUntil, and policyId must allow the requested operation (currently unused but reserved for future per-key spending limits). If these checks pass, it extracts the ECDSA signature from bytes 65-130 and validates it against the UserOperation hash using ecrecover.

The signature validation uses standard ECDSA recovery. The contract calls `ecrecover(messageHash, v, r, s)` where messageHash is the EIP-191 wrapped UserOperation hash (`keccak256("\x19Ethereum Signed Message:\n32", userOpHash)`), v is the recovery identifier from signature byte 64, r is the signature bytes 0-32, and s is bytes 32-64. The ecrecover precompile returns the signing address. The contract derives the expected address from the session public key by hashing the 64 bytes and taking the last 20 bytes. If recovered address equals expected address, the signature is valid and authorization succeeds.

Session key revocation uses the `disableSessionKey` function restricted to the account owner or guardian. It accepts a public key hash and sets the corresponding SessionKey's active field to false. This immediately invalidates all UserOperations signed with that session key since validation checks active status. The frontend should clear sessionStorage when keys are revoked, though the on-chain check provides definitive security.

Policy system design reserves the policyId field for future expansion. Currently all session keys use policyId 0 with no special restrictions. Future implementations could define policies like: policy 1 = spending limit of 100 PYUSD per day, policy 2 = only Checkout.settle calls, policy 3 = only specific merchant addresses. The account would store policy definitions and validate requested operations against policy constraints during signature validation.

---


## 4. Authentication System

Authentication in PyPay is split between two user types: merchants and customers, each optimized for their needs. Merchants authenticate using standard EVM wallets, while customers use passkey-based, passwordless authentication for frictionless onboarding and payments.

### Merchant Wallet Authentication

Merchant authentication leverages the wagmi and RainbowKit libraries, implemented in `apps/web/app/merchant/page.tsx` and `apps/web/lib/wagmi.ts`. The wagmi config defines supported chains (Arbitrum Sepolia, Ethereum Sepolia) and connectors (MetaMask, Coinbase Wallet, WalletConnect). RainbowKit provides a polished UI for wallet connection, with `<ConnectButton />` handling connection state and user actions. When a merchant connects, wagmi stores the address and chainId, accessible via the `useAccount()` hook. This enables merchants to manage invoices and receive settlements to their payout addresses securely.

### Customer Passkey Authentication

Customer authentication is built on WebAuthn, providing passwordless, biometric login. The frontend (see `apps/web/lib/passkey.ts`) uses the browser’s `navigator.credentials.get()` API to prompt for biometric authentication. Upon successful assertion, the frontend sends the result to the relayer (`apps/relayer`) for verification. The relayer validates the signature and issues a JWT session token, which the frontend stores for subsequent authenticated requests. This flow ensures that only the device owner can initiate payments, and no passwords or seed phrases are ever exposed.

### Session Key Flow

To enable seamless, gasless payments, PyPay uses ephemeral session keys. After passkey authentication, the frontend generates a secp256k1 session keypair (`apps/web/lib/sessionKey.ts`). The public key is sent to the relayer’s `/session/attest` endpoint, which verifies the user’s session and signs an attestation with the guardian key. The frontend then submits a UserOperation to the smart account’s `enableSessionKey` function, storing the session key hash and attestation on-chain. This allows the customer to sign multiple payments within a 30-minute window without repeated biometric prompts, while the guardian attestation ensures only authorized keys are enabled.


## 5. Payment Processing

The payment flow in PyPay is designed for security, speed, and user experience. It spans invoice creation, UserOperation construction, paymaster validation, and settlement on the Checkout contract.

### Invoice Creation

Merchants create invoices via the dashboard (`apps/web/app/merchant/invoices/new/page.tsx`). The frontend deterministically computes the invoice ID using the same hashing logic as the Invoice contract, allowing QR codes to be generated instantly. Invoice details are stored off-chain in the indexer database (`apps/indexer/prisma/schema.prisma`), while the on-chain contract only tracks existence and cancellation.

### UserOperation Construction

When a customer scans an invoice QR code, the frontend (`apps/web/lib/userOp.ts`) builds a UserOperation targeting the Checkout contract’s `settle` function. It encodes the invoice tuple, payer address, and optional Permit2 data for gasless approvals. The UserOperation includes gas limits, fee data, and is signed with either the passkey or session key, depending on the authentication mode.

### Paymaster Sponsorship

The unsigned UserOperation is sent to the relayer’s `/paymaster/sponsor` endpoint. The relayer validates the operation, queries the paymaster contract for sponsorship, and returns the paymasterAndData bytes. This enables the paymaster to cover all gas costs, making the transaction free for the customer.

### Settlement and Receipt

The signed UserOperation is submitted to the EntryPoint contract, which validates signatures, paymaster data, and executes the Checkout contract’s `settle` function. Upon success, the contract transfers PYUSD to the merchant’s payout address and emits a Settled event. The indexer watches for this event, marks the invoice as paid, and generates a receipt for the customer (`apps/indexer/src/watchers/invoice.ts`).


## 6. Backend Services

PyPay’s backend is composed of three main services, each with a focused responsibility and clear code separation:

### Indexer (`apps/indexer`)

The indexer ingests blockchain events (InvoiceCreated, Settled, BridgeLocked, BridgeReleased) and persists them in a PostgreSQL database using Prisma (`apps/indexer/prisma/schema.prisma`). It exposes REST APIs for invoice lookup, merchant dashboards, and cost quotes. The indexer also tracks bridge inventory and status, enabling real-time UI updates for cross-chain payments.

### Relayer (`apps/relayer`)

The relayer handles UserOperation submission, session key attestation, and bridge coordination. It exposes endpoints for session attestation (`/session/attest`), paymaster sponsorship (`/paymaster/sponsor`), and fallback settlement relay (`/relay/settle`). The relayer uses Fastify for HTTP, Viem for blockchain interaction, and HMAC or JWT for authentication. It also acts as a bridge coordinator, monitoring BridgeEscrow events and triggering releases on the destination chain.

### Cost Engine (`apps/cost-engine`)

The cost engine periodically fetches gas prices, estimates settlement gas, and calculates USD costs for each supported chain. It stores quotes in the database and exposes them via the indexer’s `/costs/quotes` API. This enables the frontend to recommend the cheapest chain for each payment, factoring in both gas and bridge costs.



## 7. Frontend Architecture

### Technology Stack

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS + shadcn/ui
- **State:** React hooks + Context
- **Blockchain:** Viem + Wagmi
- **Auth:** WebAuthn (native API)

### Key Libraries

```typescript
// lib/passkey.ts - WebAuthn implementation
// lib/sessionKey.ts - Ephemeral key generation
// lib/smartAccount.ts - Account derivation
// lib/bundler.ts - UserOp submission
```

### Page Structure

```
app/
├── layout.tsx              # Root layout
├── page.tsx                # Landing page
├── merchant/
│   ├── page.tsx            # Dashboard
│   ├── invoices/
│   │   └── new/
│   │       └── page.tsx    # Create invoice
│   └── onboard/
│       └── page.tsx        # Merchant onboarding
├── checkout/
│   └── [invoiceId]/
│       └── page.tsx        # Buyer checkout flow
├── receipt/
│   └── [receiptId]/
│       └── page.tsx        # Receipt display
├── bridge/
│   └── [ref]/
│       └── page.tsx        # Bridge status
└── diagnostics/
    └── page.tsx            # System diagnostics
```

---



