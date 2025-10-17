# PyPay Contracts: Conceptual Guide (How They Connect and Flow)

This document explains how all PyPay smart contracts fit together and what the canonical, real-world flow looks like. It avoids internal code details and focuses on how each piece behaves and interacts.

## Overview: Actors and Components

- Buyer: pays PYUSD from their smart account (ERC‑4337).
- Merchant: creates invoices and receives PYUSD to a payout address.
- Guardian (server): attests/controls session keys; cannot move user funds.
- Relayer: coordinates gasless flows and the bridge.
- Indexer: listens to events across chains and powers the dashboard.
- Cost Engine: provides Cheapest‑Chain quotes.

On-chain contracts per chain:
- `MerchantRegistry`: Merchant directory (active/payout/fee).
- `Invoice`: Creates invoice IDs with metadata; light registry for existence/validity.
- `Checkout`: Settles the invoice by moving PYUSD to merchant payout; emits `Settled`.
- `BridgeEscrow`: Holds inventory for fast cross-chain “lock on source → release on dest”.
- `TapKitAccount`: User’s ERC‑4337 smart account with session key support (ERC‑1271).
- `TapKitAccountFactory`: Deterministic creation of `TapKitAccount`.
- `TapKitPaymaster`: Sponsors gas if policy checks pass (merchant active, invoice valid, PYUSD path, amount).

Off-chain services:
- Indexer, Relayer (guardian key inside), Cost Engine.

PYUSD token:
- Standard ERC‑20 on each chain (testnet addresses via config).

Permit2 (Uniswap’s):
- Optional one-shot approvals during settlement to avoid a separate approve transaction.

EntryPoint and Bundler:
- Standard ERC‑4337 stack; bundler submits UserOps; EntryPoint executes them.

## Canonical Lifecycle and Flows

### 1) Merchant Onboarding and Configuration
- Merchant’s address is registered in `MerchantRegistry` with:
  - `active = true`
  - `payout` address (where PYUSD lands)
  - `feeBps` (if used; platform or merchant fee policy)
- This is controlled by an owner/operator (platform) to ensure merchant vetting.
- The Indexer watches registry events to show merchant status in the portal.

Why: The Paymaster later uses `MerchantRegistry` to decide whether to sponsor gas for invoices payable to this merchant.

---

### 2) Invoice Creation (On-chain anchor + off-chain display)
- In the merchant portal, the merchant chooses:
  - Amount (in PYUSD), memo, expiry, target chain.
- `Invoice.createInvoice(...)` computes an `invoiceId` (deterministic hash) and records a minimal tuple: merchant, amount, expiry, memoHash, chainId.
- The app generates a **QR code** and optional **NFC** payload encoding the checkout URL:
  - `https://app/checkout/[invoiceId]?chainId=<targetChain>`

Why: The invoice is verifiable and immutable enough for validation, but minimal to keep gas and complexity low.

---

### 3) Buyer Authentication and Smart Account
- Buyer opens the checkout link (QR/NFC).
- Buyer logs in using **passkey** (WebAuthn).
- Client generates an **ephemeral session key** (secp256k1), and requests a **guardian attestation** from the relayer service.
- Buyer’s `TapKitAccount` enables that session key (ERC‑1271) for a short TTL and policy.
- If account not deployed yet, it’s deployed deterministically via `TapKitAccountFactory`; future sessions map to the same address.

Why: Walletless UX; no seed phrase. Session key is scoped and temporary; safe to use for signing UserOps.

---

### 4) Cheapest‑Chain Toggle and Balance Check
- Frontend fetches quotes from the **Cost Engine** (gas cost + possible bridge cost + latency).
- Frontend reads buyer’s PYUSD balance on each chain.
- If buyer lacks PYUSD on the chosen chain, the UI offers **Inventory Bridge**:
  - “Lock on source → Release on destination”.

Why: Costs and balances vary by chain. We recommend the cheapest total (gas sponsorship + bridge), but buyer can choose.

---

### 5) Settlement (Checkout) – Two Token Paths
Buyer clicks “Pay Now”. The app constructs an ERC‑4337 UserOperation that calls `Checkout.settle(invoice, payer, permit2Data)`.

- `TapKitPaymaster` validates before sponsoring gas:
  - `target == Checkout`
  - function == `settle`
  - `merchant` is active in `MerchantRegistry`
  - `expiry > now`, `amount > 0`, `chainId == block.chainid`
  - Token path is PYUSD (either via Permit2 or standard allowance)
- If valid, Paymaster sponsors gas; EntryPoint executes the call.

Payment path inside `Checkout`:
- If `permit2Data` provided, the contract leverages Permit2 to pull PYUSD from the buyer in the same transaction (no prior approve).
- If not provided, it uses `transferFrom`, requiring a prior approval (classic ERC‑20 allowance).
- After transfer, `Checkout` marks the invoice as paid and emits `Settled(invoiceId, payer, merchant, amount, txMetadata...)`.

Why: Unified settlement logic with robust policy enforcement and optimal UX (Permit2 avoids a separate approval step).

---

### 6) Inventory‑Based Bridging (When Funds Are on the “Wrong” Chain)
If the buyer needs to pay on Chain B but holds PYUSD on Chain A:

- Step A: Source chain “lock”
  - Buyer calls `BridgeEscrow.lock(ref, amount)` on Chain A.
  - This moves PYUSD from buyer to the escrow contract on Chain A and emits `Locked(ref, payer, amount)`.
- Relayer detects `Locked` (Indexer/Relayer watchers).
- Step B: Destination chain “release”
  - Relayer (as owner of the destination `BridgeEscrow`) calls `release(ref, to=buyer, amount)` on Chain B.
  - Escrow inventory decreases, buyer receives PYUSD on Chain B, `Released(ref, to, amount)` is emitted.
- The UI polls the bridge status (via Indexer/Relayer API) and, when `released`, enables “Continue to Pay”.
- The buyer then pays using the normal `Checkout.settle` path on Chain B.

Why: This avoids external bridges and provides fast UX when the relayer has inventory on the destination chain. Accounting is captured via `ref`-linked events.

---

### 7) After Settlement: Receipts and Dashboard
- `Settled` events are picked up by **Indexer**, which persists “receipts”.
- Merchant dashboard shows real-time updates:
  - Invoice status changes from “Unpaid” → “Paid”.
  - Running totals per chain, downloadable **CSV** (for accounting).
- Diagnostics and health views show chain connectivity, contract addresses, paymaster stake, quotes, and inventory balances.

Why: Merchants need immediate confirmation and easy reconciliation.

---

## Contract-by-Contract Roles (Conceptual)

### `MerchantRegistry`
- Single source of truth for merchant state and payout data.
- Owner (platform admin) controls registration, activation, and fee parameters.
- Read by `Checkout`/`Paymaster` to enforce that the merchant is allowed to receive settlements.

### `Invoice`
- Creates canonical invoice IDs and stores minimal fields (merchant, amount, expiry, memoHash, chainId).
- Used by the UI to generate QR/NFC.
- Used by `Paymaster`/`Checkout` to validate settlement parameters (valid, not canceled, not expired, intended chain).

### `Checkout`
- The only settlement entry point.
- Receives `InvoiceTuple`, validates against registry/invoice conditions.
- Pulls PYUSD using either Permit2 (in-tx permit) or prior allowance, then transfers to merchant payout.
- Emits `Settled` and records `paid[invoiceId] = true` to prevent double-spend.

### `BridgeEscrow`
- Holds PYUSD inventory and lock records.
- Source chain: buyer “locks” PYUSD into escrow (funds remain there).
- Destination chain: relayer releases from its inventory to the buyer.
- Ensures each `ref` is processed once (“idempotent” lock/release flags).
- Owner-only release and inventory management (deposit/withdraw) to protect funds.

### `TapKitAccount` (ERC‑4337 smart account)
- Contract account owned by the user; supports:
  - Long-term owner (user)
  - Guardian (server) that attests session keys
  - Short-lived session keys (enabled/disabled, expiry-bound)
- Validates UserOps via ERC‑1271 and internal policy, allowing frictionless UX after passkey login.

### `TapKitAccountFactory`
- Deterministic deployment of user accounts (CREATE2).
- `getAddress(owner, guardian, salt)` lets UIs resolve counterfactual addresses before deployment (for funding/QRs).

### `TapKitPaymaster`
- Policy gatekeeper and gas sponsor.
- Validates target == `Checkout`, function == `settle`, invoice correctness, merchant active, amount bounds, and token path.
- If checks pass, it sponsors gas via the EntryPoint/bundler flow.

---

## Canonical Flow (Step-by-Step Recap)

1. Platform admin registers and activates merchant in `MerchantRegistry`.
2. Merchant creates invoice via `Invoice`, shares QR/NFC.
3. Buyer opens checkout URL, logs in with passkey; client enables a session key on `TapKitAccount`.
4. UI shows Cheapest‑Chain options using Cost Engine data; buyer selects a chain.
   - If needed, run BridgeEscrow: lock on source → release on destination.
5. Buyer clicks Pay; the UserOp calls `Checkout.settle`, Paymaster sponsors gas.
6. `Checkout` transfers PYUSD to merchant payout and marks invoice paid; emits `Settled`.
7. Indexer records events; dashboard updates in real time; merchant can export CSV.

---

## Error Handling and Policy Guards

- Inactive merchant: `Paymaster`/`Checkout` rejects settlement.
- Expired invoice: `Checkout` rejects; UI shows “Invoice expired”.
- Wrong chain: chain mismatch rejected.
- Zero/invalid amounts: rejected.
- Duplicate payment: `Checkout` tracks `paid[invoiceId]`.
- Session key expired: UI prompts passkey re-login and re-enable.
- Bridge double-processing: `BridgeEscrow` prevents replay by `ref`.

---

## Security Model (At a Glance)

- User is the owner of `TapKitAccount`.
- Guardian (server) only attests/controls session keys; cannot spend funds.
- Paymaster enforces strict invoice/merchant/PYUSD policy.
- `BridgeEscrow` release is owner-only; inventory tracked.
- Indexer provides auditable event trails; dashboard reflects on-chain truth.

---

## Multi-Chain and Runtime Config

- All addresses are loaded from runtime (`chains.config.json` + `.env`) per chain:
  - `MerchantRegistry`, `Invoice`, `Checkout`, `BridgeEscrow`, `Paymaster`, `TapKitAccountFactory`, `PYUSD`, `Permit2`, `EntryPoint`, bundler RPC.
- No hardcoded constants; diagnostics page shows current runtime configuration.

---

## Practical Notes

- First-time buyer payments can use Permit2 to avoid a separate approval.
- The smart account address can be “watch‑only” in wallets, but control flows via session keys and the account’s role model (not a single EOA private key).
- Inventory bridge is an MVP approach for quick UX; can be swapped for external bridges later without changing the checkout surface.

---

If you need a printable PDF summary diagram or want this embedded into the app’s `/diagnostics` page, I can provide a compact diagram-only version.


1) Buyer opens checkout URL and taps “Login with Passkey”; the device verifies identity via WebAuthn (biometrics/PIN).
2) The client generates an ephemeral session key (secp256k1) for this session.
3) The client requests a guardian attestation; the server (guardian key) signs “this session key is allowed for this smart account until time T under policy P”.
4) The client submits a UserOperation to enable the session key on the user’s smart account; the session key becomes valid (time‑boxed, policy‑gated).
5) The client fetches Cheapest‑Chain quotes and checks balances; the buyer selects a chain (or the recommended cheapest option).
6) If funds are on another chain, the buyer first locks PYUSD on the source chain (BridgeEscrow.lock); the relayer observes the lock and releases PYUSD to the buyer on the destination chain (BridgeEscrow.release). The buyer now has PYUSD on the selected chain.
7) The client builds the pay UserOperation calling Checkout.settle(invoice, payer=smart account, permit2Data?); if Permit2 data is provided, it allows one‑shot token “pull” without prior approve.
8) The session key signs the UserOperation; the client sends it to the bundler (with Paymaster sponsorship data).
9) The bundler simulates and forwards the UserOperation to EntryPoint; EntryPoint executes Checkout.settle. Checkout validates the invoice/merchant and pulls PYUSD from the smart account, transferring directly to the merchant payout address.
10) A Settled event is emitted; the buyer sees the receipt (tx hash, amount), and the merchant dashboard updates to “Paid” in real time; CSV export reflects the new receipt.
