# PYPay Flow Diagrams

## Table of Contents
1. [System Architecture](#system-architecture)
2. [Payment Flow](#payment-flow)
3. [Session Key Lifecycle](#session-key-lifecycle)
4. [UserOp Validation Flow](#userop-validation-flow)
5. [Error States](#error-states)
6. [Data Flow](#data-flow)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                   │
│                           FRONTEND (Next.js + Viem)                              │
│                           http://localhost:3000                                  │
│                                                                                   │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────────────────┐   │
│  │  Merchant Page  │  │  Checkout Page   │  │  Diagnostics Page           │   │
│  │  /merchant/*    │  │  /checkout?id=*  │  │  /diagnostics               │   │
│  │                 │  │                  │  │                             │   │
│  │ - Create        │  │ - WebAuthn Auth  │  │ - Test nonce fetch          │   │
│  │   invoice       │  │ - Session key    │  │ - Test signature            │   │
│  │ - View QR       │  │ - Sign payment   │  │ - Test UserOp               │   │
│  │ - Payment       │  │ - Submit UserOp  │  │ - Debug tools               │   │
│  │   history       │  │                  │  │                             │   │
│  └────────┬────────┘  └─────────┬────────┘  └──────────────┬──────────────┘   │
│           │                     │                           │                   │
└───────────┼─────────────────────┼───────────────────────────┼───────────────────┘
            │                     │                           │
            │                     │                           │
  ┌─────────▼─────────┐  ┌────────▼────────┐  ┌──────────────▼──────────────┐
  │                   │  │                 │  │                             │
  │   Indexer API     │  │   Relayer API   │  │   Cost Engine API           │
  │   Port 3001       │  │   Port 3002     │  │   Port 3003                 │
  │                   │  │                 │  │                             │
  │ POST /invoice     │  │ POST /session/  │  │ GET /gas-price/:chain       │
  │ GET  /invoice/:id │  │      enable     │  │ GET /estimate               │
  │ GET  /merchant/*  │  │ POST /userop/   │  │                             │
  │                   │  │      send       │  │                             │
  └─────────┬─────────┘  └────────┬────────┘  └─────────────────────────────┘
            │                     │
            │                     │
  ┌─────────▼─────────────────────▼──────────────────────────────────────────┐
  │                                                                            │
  │                      PostgreSQL Database                                   │
  │                                                                            │
  │  Tables:                                                                   │
  │  - invoices        (id, merchant_id, amount, status, tx_hash)            │
  │  - merchants       (id, name, address, chain_id)                         │
  │  - transactions    (id, invoice_id, user_op_hash, status)                │
  │  - session_keys    (id, account, pub_key_hash, valid_until)              │
  │                                                                            │
  └────────────────────────────────────────────────────────────────────────────┘
            │
            │
  ┌─────────▼───────────────────────────────────────────────────────────────────┐
  │                                                                              │
  │                        BLOCKCHAIN LAYER                                      │
  │                                                                              │
  │  ┌──────────────────────────────┐     ┌──────────────────────────────┐    │
  │  │  Anvil Fork: Arbitrum Sepolia│     │ Anvil Fork: Ethereum Sepolia │    │
  │  │  127.0.0.1:8545              │     │ 127.0.0.1:8546               │    │
  │  │  Chain ID: 421614            │     │ Chain ID: 11155111           │    │
  │  └──────────────────────────────┘     └──────────────────────────────┘    │
  │                                                                              │
  │  Smart Contracts (Deployed on both chains):                                 │
  │                                                                              │
  │  ┌────────────────────────────────────────────────────────────────────┐   │
  │  │ EntryPoint (ERC-4337 v0.7)                                          │   │
  │  │ 0x0000000071727De22E5E9d8BAf0edAc6f37da032                         │   │
  │  │                                                                      │   │
  │  │ Functions:                                                           │   │
  │  │ - handleOps(UserOperation[])        // Process batch of UserOps     │   │
  │  │ - getNonce(address)                 // Get account nonce            │   │
  │  │ - balanceOf(address)                // Check paymaster balance      │   │
  │  │ - depositTo(address)                // Deposit for paymaster        │   │
  │  │ - addStake(uint32)                  // Stake for paymaster          │   │
  │  └────────────────────────────────────────────────────────────────────┘   │
  │                                                                              │
  │  ┌────────────────────────────────────────────────────────────────────┐   │
  │  │ TapKitAccountFactory                                                │   │
  │  │ 0x8A791620dd6260079BF849Dc5567aDC3F2FdC318                         │   │
  │  │                                                                      │   │
  │  │ Functions:                                                           │   │
  │  │ - createAccount(address owner, uint256 salt)                        │   │
  │  │ - getAddress(address owner, uint256 salt)                           │   │
  │  └────────────────────────────────────────────────────────────────────┘   │
  │                                                                              │
  │  ┌────────────────────────────────────────────────────────────────────┐   │
  │  │ TapKitAccount (ERC-4337 Account)                                    │   │
  │  │ 0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896                         │   │
  │  │                                                                      │   │
  │  │ State:                                                               │   │
  │  │ - owner: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266                │   │
  │  │ - guardian: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8             │   │
  │  │ - sessionKeys: mapping(bytes32 => SessionKeyData)                   │   │
  │  │                                                                      │   │
  │  │ Functions:                                                           │   │
  │  │ - validateUserOp(UserOp, bytes32, uint256)  // Validate signature   │   │
  │  │ - enableSessionKey(bytes32, uint48, uint8, bytes)  // Add session   │   │
  │  │ - execute(address, uint256, bytes)  // Execute transaction          │   │
  │  └────────────────────────────────────────────────────────────────────┘   │
  │                                                                              │
  │  ┌────────────────────────────────────────────────────────────────────┐   │
  │  │ TapKitPaymaster                                                     │   │
  │  │ 0x3F2e0D3e17Fab0C61f2944CE35b07F7CFA684419                         │   │
  │  │                                                                      │   │
  │  │ State:                                                               │   │
  │  │ - checkoutContract: 0xf588f57BE135813d305815Dc3E71960c97987b19     │   │
  │  │ - deposit: 1 ETH                                                    │   │
  │  │ - stake: 1 ETH                                                      │   │
  │  │                                                                      │   │
  │  │ Functions:                                                           │   │
  │  │ - validatePaymasterUserOp(UserOp, bytes32, uint256)                 │   │
  │  │   // Validates target is checkoutContract                           │   │
  │  └────────────────────────────────────────────────────────────────────┘   │
  │                                                                              │
  │  ┌────────────────────────────────────────────────────────────────────┐   │
  │  │ Checkout                                                            │   │
  │  │ 0xf588f57BE135813d305815Dc3E71960c97987b19                         │   │
  │  │                                                                      │   │
  │  │ Functions:                                                           │   │
  │  │ - settle(bytes32 invoiceId, uint256 amount)                         │   │
  │  │   // Transfer PYUSD from payer to merchant                          │   │
  │  └────────────────────────────────────────────────────────────────────┘   │
  │                                                                              │
  │  ┌────────────────────────────────────────────────────────────────────┐   │
  │  │ Mock PYUSD (ERC20)                                                  │   │
  │  │ 0x2ec6622F4Ea3315DB6045d7C4947F63581090568                         │   │
  │  │                                                                      │   │
  │  │ Balances:                                                            │   │
  │  │ - Smart Account: 5000 PYUSD                                         │   │
  │  │ - Allowance to Checkout: MAX (115792...639935)                      │   │
  │  └────────────────────────────────────────────────────────────────────┘   │
  │                                                                              │
  │  ┌────────────────────────────────────────────────────────────────────┐   │
  │  │ MerchantRegistry                                                    │   │
  │  │ 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65                         │   │
  │  │                                                                      │   │
  │  │ Merchants:                                                           │   │
  │  │ - coffee_shop: Test Cafe (0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65)│   │
  │  └────────────────────────────────────────────────────────────────────┘   │
  │                                                                              │
  └──────────────────────────────────────────────────────────────────────────────┘
```

---

## Payment Flow

### Complete End-to-End Payment Sequence

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  User    │     │ Frontend │     │ Relayer  │     │EntryPoint│     │ Checkout │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                 │                │                │
     │ 1. Visit Invoice Page            │                │                │
     ├───────────────>│                 │                │                │
     │                │                 │                │                │
     │                │ 2. Fetch Invoice Data            │                │
     │                ├─────────────────┼────────────────┼───────────────>│
     │                │<────────────────┼────────────────┼────────────────┤
     │                │                 │                │                │
     │ 3. Display Invoice               │                │                │
     │<───────────────┤                 │                │                │
     │                │                 │                │                │
     │ 4. Click "Pay"│                 │                │                │
     ├───────────────>│                 │                │                │
     │                │                 │                │                │
     │                │ 5. Check Session Key in Storage  │                │
     │                │    (sessionStorage)              │                │
     │                │                 │                │                │
     │                ├─ If no session key ─────────────────────────────┐ │
     │                │                 │                │              │ │
     │ 6. WebAuthn Prompt               │                │              │ │
     │<───────────────┤                 │                │              │ │
     │                │                 │                │              │ │
     │ 7. Biometric   │                 │                │              │ │
     │    Auth (Touch │                 │                │              │ │
     │    ID/Face ID) │                 │                │              │ │
     ├───────────────>│                 │                │              │ │
     │                │                 │                │              │ │
     │                │ 8. Generate Session Key          │              │ │
     │                │    (secp256r1, 30min TTL)        │              │ │
     │                │                 │                │              │ │
     │                │ 9. POST /session/enable          │              │ │
     │                ├────────────────>│                │              │ │
     │                │                 │                │              │ │
     │                │                 │ 10. Generate Guardian Sig     │ │
     │                │                 │     keccak256(concat([        │ │
     │                │                 │       "\x19Eth...\n32",       │ │
     │                │                 │       innerHash               │ │
     │                │                 │     ]))                       │ │
     │                │                 │                │              │ │
     │                │                 │ 11. Call enableSessionKey     │ │
     │                │                 ├───────────────>│              │ │
     │                │                 │                │              │ │
     │                │                 │                │ 12. Verify   │ │
     │                │                 │                │     Guardian │ │
     │                │                 │                │     Signature│ │
     │                │                 │                │              │ │
     │                │                 │                │ 13. Store    │ │
     │                │                 │                │     Session  │ │
     │                │                 │                │     Key      │ │
     │                │                 │                │              │ │
     │                │                 │<───────────────┤              │ │
     │                │                 │                │              │ │
     │                │ 14. Success     │                │              │ │
     │                │<────────────────┤                │              │ │
     │                │                 │                │              │ │
     │                │ 15. Save to sessionStorage       │              │ │
     │                │<────────────────────────────────────────────────┘ │
     │                │                 │                │                │
     │                │ 16. Fetch Nonce │                │                │
     │                ├─────────────────┼───────────────>│                │
     │                │                 │                │                │
     │                │                 │ getNonce(      │                │
     │                │                 │   account,     │                │
     │                │                 │   key=0        │                │
     │                │                 │ )              │                │
     │                │                 │                │                │
     │                │<────────────────┼────────────────┤                │
     │                │ nonce: 0x0      │                │                │
     │                │                 │                │                │
     │                │ 17. Build UserOp│                │                │
     │                │     {           │                │                │
     │                │       sender,   │                │                │
     │                │       nonce,    │                │                │
     │                │       callData: execute(         │                │
     │                │         checkout,│                │                │
     │                │         0,      │                │                │
     │                │         settle(invoiceId, amount)│                │
     │                │       ),        │                │                │
     │                │       paymaster,│                │                │
     │                │       ...       │                │                │
     │                │     }           │                │                │
     │                │                 │                │                │
     │                │ 18. Sign UserOp with Session Key │                │
     │                │     (141 bytes: │                │                │
     │                │      - 32 bytes pubKeyHash       │                │
     │                │      - 1  byte  v                │                │
     │                │      - 32 bytes r                │                │
     │                │      - 32 bytes s                │                │
     │                │      - 20 bytes passkey X        │                │
     │                │      - 20 bytes passkey Y        │                │
     │                │      - 4  bytes auth flags)      │                │
     │                │                 │                │                │
     │                │ 19. POST /userop/send            │                │
     │                ├────────────────>│                │                │
     │                │                 │                │                │
     │                │                 │ 20. Validate UserOp             │
     │                │                 │                │                │
     │                │                 │ 21. handleOps([userOp])         │
     │                │                 ├───────────────>│                │
     │                │                 │                │                │
     │                │                 │                │ 22. Loop UserOps
     │                │                 │                │                │
     │                │                 │                │ 23. Get account code
     │                │                 │                │     (verify deployed)
     │                │                 │                │                │
     │                │                 │                │ 24. Call validateUserOp
     │                │                 │                │     on account │
     │                │                 │                ├───────────────>│
     │                │                 │                │                │
     │                │                 │                │    Verify:     │
     │                │                 │                │    - Session   │
     │                │                 │                │      key       │
     │                │                 │                │      exists    │
     │                │                 │                │    - Not       │
     │                │                 │                │      expired   │
     │                │                 │                │    - Signature │
     │                │                 │                │      valid     │
     │                │                 │                │                │
     │                │                 │                │<───────────────┤
     │                │                 │                │ validationData=0x0
     │                │                 │                │ (VALID)        │
     │                │                 │                │                │
     │                │                 │                │ 25. Call validatePaymasterUserOp
     │                │                 │                │     on paymaster
     │                │                 │                ├───────────────>│
     │                │                 │                │                │
     │                │                 │                │    Verify:     │
     │                │                 │                │    - callData  │
     │                │                 │                │      targets   │
     │                │                 │                │      Checkout  │
     │                │                 │                │    - Has       │
     │                │                 │                │      deposit   │
     │                │                 │                │                │
     │                │                 │                │<───────────────┤
     │                │                 │                │ validationData=0x0
     │                │                 │                │ (VALID)        │
     │                │                 │                │                │
     │                │                 │                │ 26. Execute callData
     │                │                 │                │                │
     │                │                 │                │ 27. account.execute(
     │                │                 │                │       checkout,
     │                │                 │                │       0,       │
     │                │                 │                │       settle(...)
     │                │                 │                │     )          │
     │                │                 │                ├───────────────>│
     │                │                 │                │                │
     │                │                 │                │                │ 28. Checkout.settle()
     │                │                 │                │                ├────────┐
     │                │                 │                │                │        │
     │                │                 │                │                │ 29. PYUSD.transferFrom(
     │                │                 │                │                │       smartAccount,
     │                │                 │                │                │       merchant,
     │                │                 │                │                │       amount
     │                │                 │                │                │     )  │
     │                │                 │                │                │        │
     │                │                 │                │                │ 30. Emit PaymentReceived
     │                │                 │                │                │<───────┘
     │                │                 │                │<───────────────┤
     │                │                 │                │ Success        │
     │                │                 │                │                │
     │                │                 │                │ 31. Compensate paymaster
     │                │                 │                │     (deduct gas from deposit)
     │                │                 │                │                │
     │                │                 │                │ 32. Emit UserOperationEvent
     │                │                 │                │                │
     │                │                 │<───────────────┤                │
     │                │                 │ tx hash        │                │
     │                │                 │                │                │
     │                │ 33. UserOpHash  │                │                │
     │                │<────────────────┤                │                │
     │                │                 │                │                │
     │ 34. Success!   │                 │                │                │
     │<───────────────┤                 │                │                │
     │                │                 │                │                │
```

---

## Session Key Lifecycle

### Session Key States and Transitions

```
┌────────────────────────────────────────────────────────────────────────┐
│                    SESSION KEY LIFECYCLE                                │
└────────────────────────────────────────────────────────────────────────┘

State 1: NOT GENERATED
┌─────────────────────┐
│  No Session Key     │
│  in Storage         │
│                     │
│  sessionStorage =   │
│  null               │
└──────────┬──────────┘
           │
           │ User clicks "Pay"
           │ WebAuthn prompt shown
           │
           ▼
State 2: GENERATED (Frontend)
┌─────────────────────┐
│  Session Key        │
│  Generated          │
│                     │
│  - pubKey (secp256r1)
│  - privKey (stored) │
│  - validUntil (30m) │
│                     │
│  sessionStorage =   │
│  { sessionKey }     │
└──────────┬──────────┘
           │
           │ POST /session/enable
           │ Guardian signs
           │
           ▼
State 3: ENABLED (Blockchain)
┌─────────────────────┐
│  Session Key        │
│  Enabled on Chain   │
│                     │
│  Smart Account:     │
│  sessionKeys[hash] =│
│  {                  │
│    enabled: true,   │
│    validUntil: t,   │
│    policyId: 0      │
│  }                  │
└──────────┬──────────┘
           │
           │ User signs transactions
           │ Session key validates
           │
           ▼
State 4: IN USE
┌─────────────────────┐
│  Active Session     │
│                     │
│  - Signs UserOps    │
│  - Validates in     │
│    validateUserOp() │
│  - No guardian      │
│    needed for txs   │
└──────────┬──────────┘
           │
           │ Time expires OR
           │ Page refresh OR
           │ Manual disable
           │
           ▼
State 5: EXPIRED/DISABLED
┌─────────────────────┐
│  Session Key        │
│  No Longer Valid    │
│                     │
│  - validUntil < now │
│  - Storage cleared  │
│  - Need new session │
└─────────────────────┘

SECURITY MODEL:
═══════════════

┌──────────────────────────────────────────────────────────────────┐
│ Guardian Signature Required:                                      │
│ - Enabling session key (one-time)                                │
│ - Disabling session key                                          │
│ - Owner operations (transfer ownership, etc.)                    │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ Session Key Signature Required:                                  │
│ - Payment transactions (while enabled & not expired)             │
│ - Any execute() call (restricted by policyId)                    │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ Policy ID Restrictions:                                          │
│ - 0: Can call any target (full permissions)                      │
│ - 1+: Restricted to specific contracts/functions                 │
└──────────────────────────────────────────────────────────────────┘
```

### Session Key Data Structure

```
Frontend (sessionStorage):
{
  "sessionKey": {
    "privateKey": "0x...",           // secp256r1 private key
    "publicKey": {
      "x": "0x...",                  // 32 bytes
      "y": "0x..."                   // 32 bytes
    },
    "pubKeyHash": "0x...",           // keccak256(abi.encode(x, y))
    "validUntil": 1749553800,        // Unix timestamp
    "policyId": 0,                   // Permission level
    "chainId": 421614                // Arbitrum Sepolia
  }
}

Smart Contract (TapKitAccount):
mapping(bytes32 => SessionKeyData) public sessionKeys;

struct SessionKeyData {
    bool enabled;          // Is this session key active?
    uint48 validUntil;     // Expiration timestamp
    uint8 policyId;        // Permission policy (0 = all access)
}

Blockchain State:
sessionKeys[0xeb84ab74414b738839e2c2a1962f4f441725f342a837737b8a9ef7cf1e70cde4] = {
  enabled: false,           // ❌ NOT ENABLED (Current Issue)
  validUntil: 0,
  policyId: 0
}
```

---

## UserOp Validation Flow

### Detailed Signature Validation

```
┌────────────────────────────────────────────────────────────────────────┐
│                    USEROP VALIDATION FLOW                               │
└────────────────────────────────────────────────────────────────────────┘

Step 1: EntryPoint.handleOps([userOp])
┌─────────────────────────────────────────────────────────────────────┐
│ EntryPoint receives UserOp:                                          │
│                                                                       │
│ UserOperation {                                                       │
│   sender: 0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896 (smart account)│
│   nonce: 0x0                                                         │
│   initCode: 0x                                                       │
│   callData: 0x...  (execute wrapped settle)                          │
│   accountGasLimits: packed(verificationGas, callGas)                │
│   preVerificationGas: 21000                                          │
│   gasFees: packed(maxPriorityFee, maxFeePerGas)                     │
│   paymasterAndData: packed(                                          │
│     paymaster: 0x3F2e0D3e17Fab0C61f2944CE35b07F7CFA684419,          │
│     verificationGas: uint128,                                        │
│     postOpGas: uint128,                                              │
│     paymasterData: 0x                                                │
│   )                                                                  │
│   signature: 0x... (141 bytes)                                       │
│ }                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
Step 2: Validate Account is Deployed
┌─────────────────────────────────────────────────────────────────────┐
│ code = eth_getCode(sender)                                           │
│                                                                       │
│ if (code.length == 0) {                                              │
│   revert AA20("account not deployed")                               │
│ }                                                                     │
│                                                                       │
│ ✅ Smart account has code: 0x6080604052...                           │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
Step 3: Call account.validateUserOp()
┌─────────────────────────────────────────────────────────────────────┐
│ TapKitAccount.validateUserOp(userOp, userOpHash, missingFunds)      │
│                                                                       │
│ Signature format (141 bytes):                                        │
│ ┌────────────────────────────────────────────────────────────────┐ │
│ │ Offset │ Length │ Field                                        │ │
│ ├────────┼────────┼──────────────────────────────────────────────┤ │
│ │ 0      │ 32     │ pubKeyHash (session key identifier)         │ │
│ │ 32     │ 1      │ v (recovery id: 27 or 28)                   │ │
│ │ 33     │ 32     │ r (signature component)                     │ │
│ │ 65     │ 32     │ s (signature component)                     │ │
│ │ 97     │ 20     │ passKeyX (truncated X coordinate)           │ │
│ │ 117    │ 20     │ passKeyY (truncated Y coordinate)           │ │
│ │ 137    │ 4      │ authFlags (WebAuthn flags)                  │ │
│ └────────┴────────┴──────────────────────────────────────────────┘ │
│                                                                       │
│ Parse signature:                                                     │
│   bytes32 pubKeyHash = bytes32(signature[0:32])                     │
│   uint8 v = uint8(signature[32])                                    │
│   bytes32 r = bytes32(signature[33:65])                             │
│   bytes32 s = bytes32(signature[65:97])                             │
│   bytes20 passKeyX = bytes20(signature[97:117])                     │
│   bytes20 passKeyY = bytes20(signature[117:137])                    │
│   bytes4 authFlags = bytes4(signature[137:141])                     │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
Step 4: Check Session Key Enabled
┌─────────────────────────────────────────────────────────────────────┐
│ SessionKeyData memory sessionKey = sessionKeys[pubKeyHash];          │
│                                                                       │
│ if (!sessionKey.enabled) {                                           │
│   return 0x01;  // ❌ INVALID SIGNATURE (Current Issue)             │
│ }                                                                     │
│                                                                       │
│ ❌ sessionKeys[0xeb84ab...] = { enabled: false, ... }               │
│                                                                       │
│ This is why payment fails!                                           │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ (if enabled)
Step 5: Check Expiration
┌─────────────────────────────────────────────────────────────────────┐
│ if (block.timestamp > sessionKey.validUntil) {                       │
│   return pack(validUntil, 0, 0x01);  // SIG_VALIDATION_FAILED       │
│ }                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
Step 6: Verify Signature
┌─────────────────────────────────────────────────────────────────────┐
│ // Reconstruct message hash                                          │
│ bytes32 messageHash = keccak256(abi.encodePacked(                    │
│   "\x19Ethereum Signed Message:\n32",                               │
│   userOpHash                                                         │
│ ));                                                                   │
│                                                                       │
│ // Recover signer                                                    │
│ address recovered = ecrecover(messageHash, v, r, s);                │
│                                                                       │
│ // Reconstruct expected session key pubKey                           │
│ bytes32 expectedPubKeyHash = keccak256(abi.encode(                  │
│   bytes32(bytes20(passKeyX)),                                       │
│   bytes32(bytes20(passKeyY))                                        │
│ ));                                                                   │
│                                                                       │
│ if (expectedPubKeyHash != pubKeyHash) {                             │
│   return 0x01;  // INVALID                                          │
│ }                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
Step 7: Return Validation Data
┌─────────────────────────────────────────────────────────────────────┐
│ // Pack validation data:                                             │
│ // - validUntil: uint48 (when signature expires)                    │
│ // - validAfter: uint48 (when signature becomes valid)              │
│ // - authorizer: address (0x00 = valid, 0x01 = invalid)             │
│                                                                       │
│ return pack(                                                         │
│   sessionKey.validUntil,  // e.g., 0x000068f23b06                  │
│   0,                       // validAfter: 0 (valid immediately)      │
│   0                        // authorizer: 0 (VALID)                  │
│ );                                                                    │
│                                                                       │
│ Result: 0x000068f23b060000000000000000000000000000000000000000      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
Step 8: Check Paymaster (if present)
┌─────────────────────────────────────────────────────────────────────┐
│ TapKitPaymaster.validatePaymasterUserOp(userOp, userOpHash, max)    │
│                                                                       │
│ // Extract target from callData                                      │
│ bytes4 selector = bytes4(callData[0:4]);                            │
│                                                                       │
│ if (selector == execute.selector) {                                 │
│   address target = address(bytes20(callData[16:36]));               │
│                                                                       │
│   if (target != checkoutContract) {                                 │
│     revert InvalidTarget();  // AA33                                │
│   }                                                                   │
│ }                                                                     │
│                                                                       │
│ // Check deposit                                                     │
│ uint256 deposit = entryPoint.balanceOf(address(this));              │
│ if (deposit < maxCost) {                                            │
│   revert("AA31 paymaster deposit too low");                         │
│ }                                                                     │
│                                                                       │
│ return (0, 0);  // VALID                                            │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
Step 9: Execute Transaction
┌─────────────────────────────────────────────────────────────────────┐
│ // All validations passed, execute callData                          │
│                                                                       │
│ (bool success, ) = sender.call{gas: callGasLimit}(                  │
│   callData                                                           │
│ );                                                                    │
│                                                                       │
│ if (!success) {                                                      │
│   revert ExecutionFailed();                                         │
│ }                                                                     │
│                                                                       │
│ // Compensate paymaster                                              │
│ uint256 actualGasCost = gasUsed * tx.gasprice;                      │
│ entryPoint.balanceOf[paymaster] -= actualGasCost;                  │
│                                                                       │
│ // Emit event                                                        │
│ emit UserOperationEvent(                                             │
│   userOpHash,                                                        │
│   sender,                                                            │
│   paymaster,                                                         │
│   nonce,                                                             │
│   success,                                                           │
│   actualGasCost,                                                     │
│   actualGas                                                          │
│ );                                                                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Error States

### Common Error Codes and Resolution

```
┌────────────────────────────────────────────────────────────────────────┐
│                         ERROR STATE DIAGRAM                             │
└────────────────────────────────────────────────────────────────────────┘

AA20: Account Not Deployed
═══════════════════════════
┌─────────────────────┐
│ UserOp submitted    │
│ sender: 0xdd0Aab... │
└──────────┬──────────┘
           │
           ▼
     ┌─────────────┐
     │ eth_getCode │
     │ (sender)    │
     └──────┬──────┘
            │
            ├─── code.length == 0? ───┐
            │                          │
            │ YES                      │ NO
            ▼                          ▼
     ┌──────────────┐          ┌──────────────┐
     │ ❌ AA20      │          │ ✅ Continue  │
     │              │          │   validation │
     │ Revert:      │          └──────────────┘
     │ "account not │
     │  deployed"   │
     └──────┬───────┘
            │
            │ SOLUTION:
            ▼
     Deploy account via AccountFactory:
     cast send 0x8A791620... "createAccount(address,uint256)" owner 0


AA31: Paymaster Deposit Too Low
════════════════════════════════
┌─────────────────────┐
│ Paymaster checks    │
│ deposit             │
└──────────┬──────────┘
           │
           ▼
     ┌─────────────────────┐
     │ entryPoint.balanceOf│
     │ (paymaster)         │
     └──────┬──────────────┘
            │
            ├─── deposit < maxCost? ───┐
            │                           │
            │ YES                       │ NO
            ▼                           ▼
     ┌──────────────┐           ┌──────────────┐
     │ ❌ AA31      │           │ ✅ Continue  │
     │              │           │   validation │
     │ Revert:      │           └──────────────┘
     │ "paymaster   │
     │  deposit     │
     │  too low"    │
     └──────┬───────┘
            │
            │ SOLUTION:
            ▼
     Deposit ETH to paymaster:
     cast send 0x000000007172... "depositTo(address)" paymaster --value 1ether


AA33: Reverted (InvalidTarget)
═══════════════════════════════
┌─────────────────────┐
│ Paymaster validates │
│ target              │
└──────────┬──────────┘
           │
           ▼
     ┌─────────────────────┐
     │ Extract target from │
     │ execute(addr, ...)  │
     └──────┬──────────────┘
            │
            ├─── target != checkoutContract? ───┐
            │                                    │
            │ YES                                │ NO
            ▼                                    ▼
     ┌──────────────┐                    ┌──────────────┐
     │ ❌ AA33      │                    │ ✅ Continue  │
     │              │                    │   validation │
     │ Revert:      │                    └──────────────┘
     │ "InvalidTarget"│
     └──────┬───────┘
            │
            │ SOLUTION:
            ▼
     Wrap settle in execute:
     callData = execute(
       checkoutAddress,
       0,
       settle(invoiceId, amount)
     )


validateUserOp returns 0x01 (Invalid Signature)
═══════════════════════════════════════════════
┌─────────────────────┐
│ Account validates   │
│ signature           │
└──────────┬──────────┘
           │
           ▼
     ┌─────────────────────┐
     │ sessionKeys[hash]   │
     │ .enabled?           │
     └──────┬──────────────┘
            │
            ├─── !enabled? ───┐
            │                  │
            │ YES              │ NO
            ▼                  ▼
     ┌──────────────┐    ┌──────────────┐
     │ ❌ Invalid   │    │ Check        │
     │              │    │ expiration   │
     │ Return:      │    └──────┬───────┘
     │ 0x...01      │           │
     └──────┬───────┘           ├─── expired? ───┐
            │                   │                  │
            │                   │ YES              │ NO
            │                   ▼                  ▼
            │            ┌──────────────┐   ┌──────────────┐
            │            │ ❌ Invalid   │   │ Verify       │
            │            │              │   │ signature    │
            │            │ Return:      │   └──────┬───────┘
            │            │ 0x...01      │          │
            │            └──────────────┘          │
            │                                      ▼
            │                               ┌──────────────┐
            │                               │ ✅ Valid     │
            │                               │              │
            │                               │ Return: 0x00 │
            │                               └──────────────┘
            │
            │ SOLUTION:
            ▼
     Enable session key:
     POST /session/enable with guardian signature


InvalidGuardian (Session Key Enablement)
═════════════════════════════════════════
┌─────────────────────┐
│ enableSessionKey    │
│ called              │
└──────────┬──────────┘
           │
           ▼
     ┌─────────────────────┐
     │ Reconstruct message │
     │ hash                │
     └──────┬──────────────┘
            │
            │ digest = keccak256(abi.encodePacked(
            │   "\x19Ethereum Signed Message:\n32",
            │   keccak256(abi.encode(account, hash, validUntil, policyId))
            │ ))
            │
            ▼
     ┌─────────────────────┐
     │ ecrecover(digest,   │
     │   v, r, s)          │
     └──────┬──────────────┘
            │
            ├─── recovered != guardian? ───┐
            │                               │
            │ YES                           │ NO
            ▼                               ▼
     ┌──────────────┐              ┌──────────────┐
     │ ❌ Revert    │              │ ✅ Enable    │
     │              │              │   session    │
     │ "InvalidGuardian"│          │   key        │
     └──────┬───────┘              └──────────────┘
            │
            │ SOLUTION:
            ▼
     Fix guardian signature generation:
     - Don't use signMessage() (adds prefix twice)
     - Use sign({ hash: digest }) instead
     - Manually add EIP-191 prefix to hash
```

---

## Data Flow

### Contract Interaction Map

```
┌────────────────────────────────────────────────────────────────────────┐
│                      CONTRACT INTERACTION MAP                           │
└────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│                           EntryPoint (Hub)                               │
│                  0x0000000071727De22E5E9d8BAf0edAc6f37da032             │
│                                                                          │
│  State:                                                                  │
│  - deposits: mapping(address => uint256)                                │
│  - nonceSequenceNumber: mapping(address => mapping(uint192 => uint256)) │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                    │                                    │
                    │                                    │
      ┌─────────────┴──────────┐              ┌─────────┴─────────────┐
      │                        │              │                        │
      ▼                        ▼              ▼                        ▼
┌──────────────┐      ┌──────────────┐  ┌──────────────┐    ┌──────────────┐
│ TapKitAccount│      │TapKitPaymaster│  │AccountFactory│    │ Other Accounts│
│ (Smart       │      │ (Paymaster)   │  │              │    │              │
│  Account)    │      │               │  │              │    │              │
└──────┬───────┘      └──────┬────────┘  └──────────────┘    └──────────────┘
       │                     │
       │ execute()           │ validatePaymasterUserOp()
       │                     │ - checks target == checkout
       │                     │ - checks deposit >= cost
       │                     │
       ▼                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Target Contracts                                   │
├──────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌─────────────────┐       ┌─────────────────┐                      │
│  │   Checkout      │       │   Mock PYUSD    │                      │
│  │                 │       │   (ERC20)       │                      │
│  │ settle()        │◄──────┤                 │                      │
│  │ - transferFrom()├──────►│ transferFrom()  │                      │
│  │                 │       │ - smart account │                      │
│  │                 │       │   → merchant    │                      │
│  └─────────────────┘       └─────────────────┘                      │
│                                                                        │
│  ┌─────────────────┐                                                  │
│  │ MerchantRegistry│                                                  │
│  │                 │                                                  │
│  │ - getMerchant() │                                                  │
│  │ - register()    │                                                  │
│  └─────────────────┘                                                  │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘

DATA FLOWS:
═══════════

1. Session Key Enablement:
   Frontend → Relayer → Smart Account.enableSessionKey()
   
2. Payment Transaction:
   Frontend → Relayer → EntryPoint.handleOps() →
   → Smart Account.validateUserOp() (check session key) →
   → Paymaster.validatePaymasterUserOp() (check target) →
   → Smart Account.execute() →
   → Checkout.settle() →
   → PYUSD.transferFrom()

3. Gas Compensation:
   EntryPoint deducts gas from paymaster deposit
   
4. Event Emission:
   EntryPoint → UserOperationEvent
   Checkout → PaymentReceived
   PYUSD → Transfer

5. Indexing:
   Events → Indexer service → PostgreSQL
```

### State Changes During Payment

```
BEFORE PAYMENT:
═══════════════

Smart Account (0xdd0Aab09...):
├─ ETH Balance: 1 ETH
├─ PYUSD Balance: 5000 PYUSD
├─ PYUSD Allowance to Checkout: MAX
├─ Session Key enabled: false  ❌
└─ Nonce: 0

Paymaster (0x3F2e0D3e...):
├─ Deposit in EntryPoint: 1 ETH
├─ Stake in EntryPoint: 1 ETH
└─ Allowed Target: 0xf588f57BE135813d305815Dc3E71960c97987b19 (Checkout)

Merchant (0x15d34AAf...):
└─ PYUSD Balance: 0 PYUSD

Checkout (0xf588f57BE...):
└─ No state (stateless settlement contract)


DURING PAYMENT (Transaction Execution):
════════════════════════════════════════

Step 1: EntryPoint.handleOps()
   ├─ Validate account deployed ✅
   ├─ Call Smart Account.validateUserOp()
   │  ├─ Check session key enabled ❌ (CURRENT ISSUE)
   │  ├─ Check signature valid
   │  └─ Return validationData
   │
   ├─ Call Paymaster.validatePaymasterUserOp()
   │  ├─ Check target == Checkout ✅
   │  ├─ Check deposit >= cost ✅
   │  └─ Return (0, 0)
   │
   └─ Execute callData

Step 2: Smart Account.execute(checkout, 0, settle(...))
   └─ Call Checkout.settle(invoiceId, amount)

Step 3: Checkout.settle(invoiceId, 5 PYUSD)
   ├─ Verify invoice exists
   ├─ Verify amount matches
   ├─ Call PYUSD.transferFrom(smartAccount, merchant, 5 PYUSD)
   └─ Emit PaymentReceived(invoiceId, 5 PYUSD)

Step 4: EntryPoint compensates paymaster
   └─ paymaster.deposit -= gasUsed * gasPrice


AFTER PAYMENT:
══════════════

Smart Account (0xdd0Aab09...):
├─ ETH Balance: 1 ETH (unchanged, paymaster paid)
├─ PYUSD Balance: 4995 PYUSD (-5)
├─ PYUSD Allowance to Checkout: MAX (unchanged)
└─ Nonce: 1 (+1)

Paymaster (0x3F2e0D3e...):
├─ Deposit in EntryPoint: ~0.9999 ETH (-0.0001 for gas)
└─ Stake in EntryPoint: 1 ETH (unchanged)

Merchant (0x15d34AAf...):
└─ PYUSD Balance: 5 PYUSD (+5)

Events Emitted:
├─ PYUSD.Transfer(smartAccount, merchant, 5 PYUSD)
├─ Checkout.PaymentReceived(invoiceId, 5 PYUSD)
└─ EntryPoint.UserOperationEvent(userOpHash, ...)
```

---

## Summary

This document provides complete flow diagrams for:

1. **System Architecture**: How all components connect
2. **Payment Flow**: Step-by-step transaction execution
3. **Session Key Lifecycle**: From generation to expiration
4. **UserOp Validation**: Detailed signature validation process
5. **Error States**: Common issues and their resolutions
6. **Data Flow**: Contract interactions and state changes

**Critical Blocker**: Session key must be enabled on smart account before any payments can succeed. Once enabled, the full payment flow will work as diagrammed above.
