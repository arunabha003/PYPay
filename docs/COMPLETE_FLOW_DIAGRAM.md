# PYPay - Complete System Flow Diagram

**From User Tap to Transaction Execution**

---

## 1. Initial Setup Phase (One-Time)

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT & SETUP                            │
└─────────────────────────────────────────────────────────────────┘

Step 1: Deploy Contracts
├─> EntryPoint (canonical 0x0000...032)
├─> AccountFactory
├─> Paymaster
├─> Checkout
├─> PYUSD Token
└─> MerchantRegistry

Step 2: Create Smart Account
AccountFactory.createAccount(
  owner: 0xf39F... (passkey public key),
  guardian: 0x7099... (guardian address),
  salt: <unique>
)
  └─> Deploys TapKitAccount proxy
      ├─> Sets owner = 0xf39F...
      ├─> Sets guardian = 0x7099...
      └─> Returns account address: 0xdd0A...

Step 3: Fund Paymaster
Owner sends 3 ETH to Paymaster contract (0x9a81...)
  │
  ├─> Paymaster.addStake{value: 1 ETH}(unstakeDelay: 86400)
  │     └─> Calls EntryPoint.addStake() 
  │         └─> EntryPoint stakes[0x9a81...] += 1 ETH (LOCKED)
  │
  └─> Owner calls EntryPoint.depositTo{value: 2 ETH}(0x9a81...)
        └─> EntryPoint deposits[0x9a81...] += 2 ETH (OPERATIONAL)

EntryPoint Accounting for Paymaster:
├─> deposits[0x9a81...] = 2 ETH      ← Used for gas payments
└─> stakes[0x9a81...] = 1 ETH        ← Locked for reputation

Step 4: Fund Smart Account
├─> Send 1 ETH to 0xdd0A... (for direct txs if needed)
└─> Mint 5000 PYUSD to 0xdd0A...
```

---

## 2. Session Key Enablement Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    SESSION KEY CREATION                          │
└─────────────────────────────────────────────────────────────────┘

User Action: Click "Enable Payments" in browser
  │
  ▼
Frontend (apps/web/lib/sessionKey.ts)
├─> Generate ephemeral keypair
│     const sessionKeyPair = privateKeyToAccount(generatePrivateKey())
│     
├─> Extract 64-byte ECDSA public key
│     const ecdsaPublicKey = sessionKeyPair.publicKey.slice(4) // Remove 0x04 prefix
│     Returns: 0xc908625ced...1e49e (128 hex chars = 64 bytes)
│
├─> Store in sessionStorage
│     {
│       publicKey: "0xc908..." (address, 20 bytes),
│       ecdsaPublicKey: "0xc908625ced..." (64 bytes),
│       privateKey: "0x..." (for signing later)
│     }
│
└─> Send to relayer
      POST /session/enable
      {
        account: "0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896",
        sessionPubKey: "0xc908625ced01d678...361e49e", ← 64-byte ECDSA key
        validUntil: 1749553800,
        policyId: 0
      }

┌─────────────────────────────────────────────────────────────────┐
│                    RELAYER PROCESSING                            │
└─────────────────────────────────────────────────────────────────┘

Relayer (apps/relayer/src/routes/index.ts)

1. Validate Input
   ├─> Check sessionPubKey is 0x-prefixed hex
   ├─> Check length = 66 + 128 = 194 chars (0x + 64 bytes)
   └─> If invalid, return 400 error

2. Hash the Session Public Key
   const pubKeyHash = keccak256(sessionPubKey)
   Returns: 0xeb84ab74414b738839e2c2a1962f4f441725f342a837737b8a9ef7cf1e70cde4

3. Read Guardian from Contract
   const onChainGuardian = await TapKitAccount.guardian()
   Returns: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
   
   If mismatch with env GUARDIAN_PRIVATE_KEY:
     └─> Log warning (but continue)

4. Create Message Digest
   const message = keccak256(abi.encode([
     account,      // 0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896
     pubKeyHash,   // 0xeb84ab74414b738839e2c2a1962f4f441725f342a837737b8a9ef7cf1e70cde4
     validUntil,   // 1749553800
     policyId      // 0
   ]))
   Returns: 0x<32-byte hash>

5. Guardian Signs (EIP-191)
   const digest = keccak256(
     "\x19Ethereum Signed Message:\n32" + message
   )
   
   const signature = guardianPrivateKey.sign(digest)
   Returns: {
     r: 0x...,
     s: 0x...,
     v: 27 or 28
   }
   Encoded as: 0x<r><s><v> (65 bytes)

6. Send Transaction to Smart Account
   TapKitAccount.enableSessionKey(
     pubKeyHash,   // 0xeb84ab74414b738839e2c2a1962f4f441725f342a837737b8a9ef7cf1e70cde4
     validUntil,   // 1749553800
     policyId,     // 0
     signature     // 0x<65 bytes>
   ) {from: guardian, gasLimit: 200000}

┌─────────────────────────────────────────────────────────────────┐
│              SMART ACCOUNT CONTRACT VALIDATION                   │
└─────────────────────────────────────────────────────────────────┘

TapKitAccount.enableSessionKey(
  bytes32 pubKeyHash,
  uint48 validUntil,
  uint8 policyId,
  bytes calldata guardianSignature
)

1. Verify Caller or Signature
   ├─> If msg.sender == guardian → OK
   └─> Else, verify signature:
         const message = keccak256(abi.encode(
           address(this),  // 0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896
           pubKeyHash,     // 0xeb84ab74414b738839e2c2a1962f4f441725f342a837737b8a9ef7cf1e70cde4
           validUntil,     // 1749553800
           policyId        // 0
         ))
         
         // Use Solady's SignatureCheckerLib (supports EIP-191)
         bool valid = SignatureCheckerLib.isValidSignatureNowCalldata(
           guardian,           // 0x7099...
           message,            // The hash we created
           guardianSignature   // 65-byte signature
         )
         
         if (!valid) revert InvalidGuardian();

2. Store Session Key
   sessionKeys[pubKeyHash] = SessionKey({
     isActive: true,
     validUntil: 1749553800,
     policyId: 0
   })

3. Emit Event
   emit SessionKeyEnabled(
     pubKeyHash,   // 0xeb84ab74414b738839e2c2a1962f4f441725f342a837737b8a9ef7cf1e70cde4
     validUntil,   // 1749553800
     policyId      // 0
   )

✅ Session Key Now Enabled!
```

---

## 3. Payment Flow (Session Key in Action)

```
┌─────────────────────────────────────────────────────────────────┐
│                      USER INITIATES PAYMENT                      │
└─────────────────────────────────────────────────────────────────┘

User Action: Click "Pay $100" on checkout page
  │
  ▼
Frontend (apps/web/app/checkout/[invoiceId]/page.tsx)

1. Fetch Invoice Details
   const invoice = await fetch('/api/invoice/' + invoiceId)
   {
     id: "0xabc...",
     merchant: "0x3524...",
     amount: 100000000, // 100 PYUSD (6 decimals)
     expiry: 1749600000,
     chainId: 421614
   }

2. Create UserOp for Settlement
   (apps/web/lib/payment.ts - settlePayment function)
   
   const callData = encodeFunctionData({
     abi: CheckoutABI,
     functionName: "settle",
     args: [
       invoice,        // InvoiceTuple
       merchantAddr,   // 0x3524...
       signature       // Invoice signature
     ]
   })
   
   const userOp = {
     sender: smartAccount,              // 0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896
     nonce: await getNonce(),           // e.g., 5
     initCode: "0x",                    // Account already exists
     callData: callData,                // Call Checkout.settle(...)
     accountGasLimits: pack(150000, 50000), // verificationGas, callGas
     preVerificationGas: 21000,
     gasFees: pack(maxPriorityFee, maxFee),
     paymasterAndData: "0x",            // Will be filled by relayer
     signature: "0x"                    // Will be signed next
   }

3. Sign UserOp with Session Key
   const sessionKey = getSessionKey() // From sessionStorage
   const ecdsaPublicKey = sessionKey.ecdsaPublicKey
   
   // UserOp hash (EIP-4337 standard)
   const userOpHash = keccak256(abi.encode(
     userOp (excluding signature),
     entryPoint,
     chainId
   ))
   
   // Sign with session key private key
   const sessionSignature = sessionKey.privateKey.sign(userOpHash)
   
   // Encode signature with session pubkey
   userOp.signature = abi.encode([
     ecdsaPublicKey,    // 64 bytes - tells contract which session key
     sessionSignature   // 65 bytes - proves we have private key
   ])

4. Send to Relayer
   POST /session/attest
   {
     userOp: { ...userOp },
     chainId: 421614
   }

┌─────────────────────────────────────────────────────────────────┐
│              RELAYER ADDS PAYMASTER DATA                         │
└─────────────────────────────────────────────────────────────────┘

Relayer (apps/relayer/src/routes/index.ts)

1. Validate UserOp
   ├─> Check sender exists
   ├─> Check nonce is valid
   └─> Check signature format

2. Add Paymaster Data
   const validUntil = Math.floor(Date.now() / 1000) + 3600 // 1 hour
   const validAfter = 0
   
   paymasterAndData = abi.encode([
     paymasterAddress,  // 0x9a81C9fAddbcBfB565cccdc47A04013aD55695b9
     validUntil,        // uint48
     validAfter,        // uint48
     paymasterSignature // Will be filled after signing
   ])
   
3. Paymaster Signs UserOp
   const paymasterHash = keccak256(abi.encode(
     userOp (with paymasterAndData but no paymaster signature),
     entryPoint,
     chainId
   ))
   
   const paymasterSignature = paymasterPrivateKey.sign(paymasterHash)
   
   // Update paymasterAndData with signature
   paymasterAndData = abi.encode([
     paymasterAddress,
     validUntil,
     validAfter,
     paymasterSignature  // 65 bytes
   ])
   
   userOp.paymasterAndData = paymasterAndData

4. Submit to EntryPoint
   EntryPoint.handleOps([userOp], beneficiary: relayer)
     └─> Transaction sent to blockchain

┌─────────────────────────────────────────────────────────────────┐
│              ENTRYPOINT VALIDATION & EXECUTION                   │
└─────────────────────────────────────────────────────────────────┘

EntryPoint.handleOps(PackedUserOperation[] ops, address beneficiary)

For each UserOp:

╔═══════════════════════════════════════════════════════════════╗
║                    VALIDATION PHASE                            ║
╚═══════════════════════════════════════════════════════════════╝

1. Account Validation
   EntryPoint calls: TapKitAccount.validateUserOp(userOp, userOpHash, missingAccountFunds)
   
   TapKitAccount.validateUserOp():
   ├─> Check nonce is correct
   ├─> Decode signature:
   │     (bytes memory sessionPubKey, bytes memory sessionSig) = abi.decode(
   │       userOp.signature,
   │       (bytes, bytes)
   │     )
   │     
   │     sessionPubKey = 0xc908625ced... (64 bytes)
   │     sessionSig = 0x<r><s><v> (65 bytes)
   │
   ├─> Hash session public key:
   │     pubKeyHash = keccak256(sessionPubKey)
   │     = 0xeb84ab74414b738839e2c2a1962f4f441725f342a837737b8a9ef7cf1e70cde4
   │
   ├─> Check session key is enabled:
   │     SessionKey memory sk = sessionKeys[pubKeyHash]
   │     require(sk.isActive, "Session key not enabled")
   │     require(block.timestamp < sk.validUntil, "Session key expired")
   │
   ├─> Recover signer from signature:
   │     address signer = ecrecover(userOpHash, sessionSig.v, sessionSig.r, sessionSig.s)
   │     
   ├─> Verify signer matches session pubkey:
   │     address expectedSigner = address(keccak256(sessionPubKey)[12:32])
   │     require(signer == expectedSigner, "Invalid session signature")
   │
   ├─> Check gas limits are reasonable
   │
   └─> Return validationData = 0 (success)

2. Paymaster Validation
   EntryPoint calls: Paymaster.validatePaymasterUserOp(userOp, userOpHash, maxCost)
   
   Paymaster.validatePaymasterUserOp():
   ├─> Verify caller is EntryPoint
   ├─> Decode paymasterAndData:
   │     (address paymaster, uint48 validUntil, uint48 validAfter, bytes sig) = decode(
   │       userOp.paymasterAndData
   │     )
   │
   ├─> Check time bounds:
   │     require(block.timestamp >= validAfter && block.timestamp < validUntil)
   │
   ├─> Decode callData to extract target contract:
   │     if (callData starts with execute(address,uint256,bytes)):
   │       (address target, , bytes innerCallData) = decode(callData)
   │     else:
   │       target = userOp.sender
   │       innerCallData = callData
   │
   ├─> Verify target is Checkout contract:
   │     require(target == checkoutContract, "Invalid target")
   │
   ├─> Verify function is settle():
   │     bytes4 selector = bytes4(innerCallData[0:4])
   │     require(selector == SETTLE_SELECTOR, "Only settle allowed")
   │
   ├─> Decode invoice from callData:
   │     InvoiceTuple invoice = decode(innerCallData[4:])
   │
   ├─> Verify merchant is active:
   │     bool isActive = MerchantRegistry.isMerchantActive(invoice.merchant)
   │     require(isActive, "Inactive merchant")
   │
   ├─> Verify invoice not already paid:
   │     bool isPaid = Checkout.isInvoicePaid(invoice.id)
   │     require(!isPaid, "Already paid")
   │
   ├─> Verify invoice not expired:
   │     require(block.timestamp < invoice.expiry, "Expired")
   │
   ├─> Verify amount within limits:
   │     require(invoice.amount <= maxAmountPerTx, "Amount too high")
   │
   ├─> Verify token is PYUSD:
   │     require(invoice.token == pyusdToken, "Invalid token")
   │
   └─> Return (context, validationData) = ("", 0)

3. Check Paymaster Has Funds
   uint256 paymasterDeposit = deposits[paymaster]
   require(paymasterDeposit >= maxCost, "Insufficient paymaster deposit")

✅ All Validations Passed!

╔═══════════════════════════════════════════════════════════════╗
║                    EXECUTION PHASE                             ║
╚═══════════════════════════════════════════════════════════════╝

4. Execute UserOp
   EntryPoint calls: TapKitAccount.execute(target, value, data)
   
   Which calls: Checkout.settle(invoice, merchant, signature)
   
   Checkout.settle():
   ├─> Verify invoice signature
   ├─> Mark invoice as paid
   ├─> Transfer PYUSD:
   │     PYUSD.transferFrom(
   │       userAccount,      // 0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896
   │       merchant,         // 0x3524E03B46e05Df7c6ba9836D04DBFAB409c03d1
   │       100000000         // 100 PYUSD
   │     )
   │
   └─> Emit PaymentComplete(invoiceId, merchant, amount)

5. Calculate Gas Used
   uint256 gasUsed = startGas - gasleft()
   uint256 gasCost = gasUsed * tx.gasprice

6. Deduct from Paymaster Deposit
   deposits[paymaster] -= gasCost
   
   EntryPoint Accounting After Transaction:
   ├─> deposits[0x9a81...] = 2 ETH - gasCost (e.g., 1.997 ETH)
   └─> stakes[0x9a81...] = 1 ETH (unchanged)

7. Compensate Relayer
   (bool success,) = beneficiary.call{value: gasCost}("")
   
   └─> Relayer gets reimbursed for gas spent

8. Emit UserOpEvent
   emit UserOperationEvent(
     userOpHash,
     sender,
     paymaster,
     nonce,
     success,
     actualGasCost,
     actualGasUsed
   )

✅ Transaction Complete!

┌─────────────────────────────────────────────────────────────────┐
│                    EVENT INDEXING                                │
└─────────────────────────────────────────────────────────────────┘

Indexer (apps/indexer/src/watchers/)

1. Listen for PaymentComplete Event
   Checkout.on("PaymentComplete", (invoiceId, merchant, amount) => {
     // Store in database
   })

2. Update Database
   await prisma.payment.create({
     invoiceId: invoiceId,
     merchant: merchant,
     amount: amount,
     status: "COMPLETED",
     txHash: event.transactionHash,
     timestamp: block.timestamp
   })

3. Update Invoice Status
   await prisma.invoice.update({
     where: { id: invoiceId },
     data: { status: "PAID" }
   })

4. Frontend Polls/WebSocket
   ├─> GET /api/payment/status?invoiceId=...
   └─> Returns: { status: "COMPLETED", txHash: "0x..." }

5. User Sees Success ✅
   "Payment successful! View on Arbiscan"
```

---

## 4. Gas Payment Flow Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                  GAS PAYMENT BREAKDOWN                           │
└─────────────────────────────────────────────────────────────────┘

WHO PAYS FOR GAS?

1. User initiates transaction (pays $0 in ETH)
2. Relayer submits transaction (pays ETH upfront)
3. EntryPoint validates and executes
4. EntryPoint deducts gas from Paymaster's deposit
5. EntryPoint reimburses Relayer with ETH

FLOW DIAGRAM:

User (0 ETH spent)
  │
  ├─> Creates UserOp with session key signature
  │
  ▼
Relayer (pays ETH temporarily)
  │
  ├─> Adds paymaster data
  ├─> Submits to EntryPoint (pays gas: 0.003 ETH)
  │
  ▼
EntryPoint (manages accounting)
  │
  ├─> Validates UserOp
  ├─> Executes UserOp
  ├─> Calculates gas used: 0.003 ETH
  ├─> Deducts from Paymaster deposit:
  │     deposits[Paymaster] -= 0.003 ETH
  ├─> Reimburses Relayer:
  │     Relayer.transfer(0.003 ETH)
  │
  ▼
Final State:
├─> User: Paid 100 PYUSD, spent 0 ETH ✅
├─> Merchant: Received 100 PYUSD ✅
├─> Paymaster: Deposit reduced by 0.003 ETH (1.997 ETH remaining)
├─> Relayer: Net 0 ETH (paid 0.003, got 0.003 back)
└─> EntryPoint: Stake unchanged (1 ETH still locked)

PAYMASTER PURPOSE:
├─> Acts as "gas sponsor" account
├─> EntryPoint holds paymaster's funds
├─> Paymaster decides which UserOps to sponsor (policy)
├─> EntryPoint enforces the payment from paymaster's balance
└─> Without paymaster: User would need ETH to pay gas
```

---

## 5. Complete Data Flow (All Fields)

```
┌─────────────────────────────────────────────────────────────────┐
│            COMPLETE FIELD-LEVEL DATA FLOW                        │
└─────────────────────────────────────────────────────────────────┘

SESSION KEY ENABLEMENT:

Frontend → Relayer:
{
  account: "0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896",
  sessionPubKey: "0xc908625ced01d678...361e49e" (64 bytes),
  validUntil: 1749553800,
  policyId: 0
}

Relayer → Contract:
TapKitAccount.enableSessionKey(
  pubKeyHash: keccak256(sessionPubKey),
  validUntil: 1749553800,
  policyId: 0,
  guardianSignature: sign(keccak256(abi.encode(account, pubKeyHash, validUntil, policyId)))
)

Contract Storage:
sessionKeys[0xeb84ab74...] = {
  isActive: true,
  validUntil: 1749553800,
  policyId: 0
}

─────────────────────────────────────────────────────────────────

PAYMENT EXECUTION:

Frontend → Relayer:
{
  userOp: {
    sender: "0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896",
    nonce: 5,
    initCode: "0x",
    callData: encodeFunctionData({
      abi: CheckoutABI,
      functionName: "settle",
      args: [
        {
          invoiceId: "0xabc...",
          merchant: "0x3524...",
          amount: 100000000,
          expiry: 1749600000,
          chainId: 421614,
          memoHash: "0xdef..."
        },
        merchantSignature
      ]
    }),
    accountGasLimits: pack(150000, 50000),
    preVerificationGas: 21000,
    gasFees: pack(1000000000, 2000000000),
    paymasterAndData: "0x",
    signature: abi.encode([
      sessionPubKey (64 bytes),
      sessionSignature (65 bytes)
    ])
  },
  chainId: 421614
}

Relayer → EntryPoint:
{
  ...userOp,
  paymasterAndData: abi.encode([
    paymasterAddress: "0x9a81C9fAddbcBfB565cccdc47A04013aD55695b9",
    validUntil: <timestamp + 1h>,
    validAfter: 0,
    paymasterSignature: sign(userOpHash) (65 bytes)
  ])
}

EntryPoint → TapKitAccount.validateUserOp():
├─> Decodes signature → (sessionPubKey, sessionSig)
├─> Hashes sessionPubKey → pubKeyHash
├─> Loads sessionKeys[pubKeyHash]
├─> Recovers signer from sessionSig
└─> Returns validationData = 0

EntryPoint → Paymaster.validatePaymasterUserOp():
├─> Decodes paymasterAndData
├─> Verifies paymaster signature
├─> Decodes callData → settle(invoice, ...)
├─> Validates invoice (merchant active, not paid, not expired)
└─> Returns (context="", validationData=0)

EntryPoint → TapKitAccount.execute():
├─> target: Checkout contract
├─> value: 0
├─> data: settle(invoice, merchant, sig)

Checkout.settle():
├─> Validates invoice signature
├─> PYUSD.transferFrom(account, merchant, 100 PYUSD)
├─> Marks invoice as paid
└─> Emits PaymentComplete(invoiceId, merchant, amount)

EntryPoint Gas Accounting:
├─> gasUsed = 150,000
├─> gasCost = 150,000 * 2 gwei = 0.0003 ETH
├─> deposits[paymaster] -= 0.0003 ETH
├─> relayer.transfer(0.0003 ETH)
└─> Emit UserOperationEvent(...)

Indexer:
├─> Listens to PaymentComplete
├─> Stores in database
└─> Frontend polls → Shows success
```

---

## 6. Key Addresses & Their Roles

```
┌──────────────────────────────────────────────────────────────────┐
│                    ADDRESS DIRECTORY                              │
└──────────────────────────────────────────────────────────────────┘

EntryPoint: 0x0000000071727De22E5E9d8BAf0edAc6f37da032
├─> Role: Central coordinator for all UserOps
├─> Holds: deposits[paymaster] = 2 ETH, stakes[paymaster] = 1 ETH
├─> Functions:
│   ├─> handleOps(userOps[]) - Process user operations
│   ├─> depositTo(address) - Add operational funds
│   ├─> addStake(uint32) - Add locked stake
│   └─> balanceOf(address) - Check deposit balance
└─> Called by: Relayer (handleOps), Paymaster (addStake), Anyone (depositTo)

Smart Account: 0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896
├─> Role: User's smart contract wallet
├─> Holds: 1 ETH, 5000 PYUSD
├─> Storage:
│   ├─> owner = 0xf39F... (passkey pubkey)
│   ├─> guardian = 0x7099... (recovery guardian)
│   └─> sessionKeys[hash] = {isActive, validUntil, policyId}
├─> Functions:
│   ├─> validateUserOp() - Validate session key signature
│   ├─> execute() - Execute arbitrary calls
│   ├─> enableSessionKey() - Add new session key
│   └─> recover() - Guardian recovery
└─> Called by: EntryPoint (validateUserOp, execute)

Paymaster: 0x9a81C9fAddbcBfB565cccdc47A04013aD55695b9
├─> Role: Sponsors gas for valid payment transactions
├─> Holds: 0 ETH directly (funds are in EntryPoint)
├─> EntryPoint holds for it:
│   ├─> deposits[0x9a81...] = 2 ETH (pays for gas)
│   └─> stakes[0x9a81...] = 1 ETH (reputation, locked)
├─> Functions:
│   ├─> validatePaymasterUserOp() - Approve sponsorship
│   ├─> addStake() - Forward ETH to EntryPoint stake
│   └─> receive() - Accept ETH deposits
└─> Called by: EntryPoint (validatePaymasterUserOp)

Checkout: 0xf588f57BE135813d305815Dc3E71960c97987b19
├─> Role: Process PYUSD payments
├─> Functions:
│   ├─> settle(invoice, merchant, sig) - Execute payment
│   └─> isInvoicePaid(id) - Check payment status
└─> Called by: Smart Account via EntryPoint

Guardian: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
├─> Role: Trusted recovery agent
├─> Holds: 100 ETH (for gas when enabling session keys)
├─> Signs: Session key enablement messages
└─> Private key: Used by relayer to sign session key approvals

Session Key: 0xc908625ced01d678d1f12c95d2442425384a0e1c... (64 bytes)
├─> Role: Ephemeral key for gasless payments
├─> Stored: Frontend sessionStorage
├─> Hash: 0xeb84ab74414b738839e2c2a1962f4f441725f342a837737b8a9ef7cf1e70cde4
├─> Used for: Signing UserOps in frontend
└─> Validated by: Smart account during UserOp execution
```

---

## 7. Why Paymaster Doesn't Hold ETH Directly

```
┌──────────────────────────────────────────────────────────────────┐
│             PAYMASTER DESIGN RATIONALE                            │
└──────────────────────────────────────────────────────────────────┘

QUESTION: Why not just keep ETH in the Paymaster contract?

ANSWER: ERC-4337 EntryPoint Security Model

The EntryPoint acts as a TRUSTED ESCROW:

1. ATOMIC OPERATIONS
   ├─> EntryPoint locks paymaster funds BEFORE execution
   ├─> If UserOp fails, funds aren't spent
   └─> Prevents paymaster from being drained by failed ops

2. REPUTATION SYSTEM
   ├─> Stake proves paymaster is legitimate
   ├─> Bundlers prioritize staked paymasters
   └─> Unstaking requires 24h delay (prevents exit scams)

3. UNIFIED ACCOUNTING
   ├─> All ERC-4337 paymasters use same EntryPoint
   ├─> Standardized deposit/withdrawal interface
   └─> Easier for bundlers/relayers to track balances

4. GAS LIMIT ENFORCEMENT
   ├─> EntryPoint checks paymaster has funds BEFORE execution
   ├─> Prevents DoS from paymasters without funds
   └─> Protects bundlers from unpaid gas

ANALOGY:
Paymaster = Restaurant owner
EntryPoint = Credit card processor
Stake = Security deposit with processor
Deposit = Restaurant's account balance

When customer pays:
├─> Restaurant approves transaction (validatePaymasterUserOp)
├─> Processor deducts from restaurant's account (deposits[paymaster])
├─> Processor pays server (reimburse relayer)
└─> Restaurant stake stays locked (reputation)
```

---

## Summary

**Gas is paid from:**
- Paymaster's **deposit balance in EntryPoint**
- NOT from paymaster contract directly
- NOT from stake (stake is locked for reputation)

**Paymaster's role:**
- Acts as policy enforcer ("I approve sponsoring this UserOp")
- EntryPoint enforces the payment from paymaster's balance
- Enables gasless UX for end users

**Complete flow:** User signs → Relayer bundles → EntryPoint validates → Paymaster approves → EntryPoint executes → Paymaster pays (via deposit) → Relayer reimbursed

