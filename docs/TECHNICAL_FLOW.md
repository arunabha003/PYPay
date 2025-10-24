# PyPay System Flow - Diagram 2: Payment Execution

## Complete Payment Flow (Single-Chain & Cross-Chain)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                              INVOICE CREATION (MERCHANT SIDE)                                │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│   Merchant   │
│  Dashboard   │
└──────┬───────┘
       │
       │ 1. Fill invoice form
       │    - Amount: 100 PYUSD
       │    - Description: "Coffee order #123"
       │    - Network: "auto" (or specific chain)
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          Merchant Frontend (Next.js)                                      │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  const invoice = {                                                                 │  │
│  │    merchant: "0x99d44c22fbff9fb4c8bd69378b860b6d9ce3f3b7",                       │  │
│  │    amount: parseUnits("100", 6),  // 100000000 (6 decimals)                      │  │
│  │    description: "Coffee order #123",                                              │  │
│  │    preferredChain: "auto"  // or 421614 / 11155111                              │  │
│  │  }                                                                                │  │
│  │                                                                                    │  │
│  │  POST /api/invoices/create                                                        │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                     │
                                     │ 2. Send to indexer
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          Indexer Service (Fastify)                                        │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  POST /invoices                                                                    │  │
│  │  ─────────────────────────────────────────────────────────────────────────────    │  │
│  │  Processing:                                                                       │  │
│  │  1. Validate merchant (check MerchantRegistry)                                    │  │
│  │  2. Generate invoice ID: uuid.v4()                                                │  │
│  │     → "550e8400-e29b-41d4-a716-446655440000"                                     │  │
│  │  3. Calculate optimal chain based on:                                             │  │
│  │     - Gas costs (fetch from cost-engine)                                          │  │
│  │     - Bridge inventory                                                            │  │
│  │     - Customer location (if available)                                            │  │
│  │  ─────────────────────────────────────────────────────────────────────────────    │  │
│  │  Result:                                                                           │  │
│  │  - preferredChain: 421614 (Arbitrum Sepolia)                                     │  │
│  │  - estimatedGas: 174000                                                           │  │
│  │  - gasCostUSD: 0.15                                                              │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                     │
                                     │ 3. Store in database
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          Indexer Database (PostgreSQL)                                    │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  INSERT INTO invoices:                                                             │  │
│  │  - id: "550e8400-e29b-41d4-a716-446655440000"                                    │  │
│  │  - merchant_address: "0x99d44c22..."                                              │  │
│  │  - amount: 100000000  // 100 PYUSD                                               │  │
│  │  - description: "Coffee order #123"                                               │  │
│  │  - preferred_chain_id: 421614                                                     │  │
│  │  - status: "PENDING"                                                              │  │
│  │  - created_at: now()                                                              │  │
│  │  - expires_at: now() + 15 minutes                                                │  │
│  │  - qr_code_url: "https://pypay.app/checkout/550e8400..."                        │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                     │
                                     │ 4. Return invoice details + QR code
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          Merchant Dashboard (Display)                                     │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  ┌────────────────────────────────────────────────────────┐                      │  │
│  │  │  ██████████████  Invoice #550e8400                      │                      │  │
│  │  │  ██          ██  Amount: 100 PYUSD                      │                      │  │
│  │  │  ██  QR CODE ██  Description: Coffee order #123          │                      │  │
│  │  │  ██          ██  Network: Arbitrum Sepolia              │                      │  │
│  │  │  ██████████████  Status: PENDING                         │                      │  │
│  │  │                                                          │                      │  │
│  │  │  Customer scans this QR to pay                          │                      │  │
│  │  └────────────────────────────────────────────────────────┘                      │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                              PAYMENT EXECUTION (CUSTOMER SIDE)                               │
└─────────────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│   Customer   │
│   Mobile     │
└──────┬───────┘
       │
       │ 1. Scan QR code
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          Checkout Page (/checkout/{invoiceId})                            │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  Fetch invoice details from indexer                                               │  │
│  │  GET /invoices/550e8400-e29b-41d4-a716-446655440000                             │  │
│  │  ─────────────────────────────────────────────────────────────────────────────    │  │
│  │  Display:                                                                          │  │
│  │  - Merchant: Coffee Shop (0x99d4...3f3b7)                                        │  │
│  │  - Amount: 100 PYUSD                                                              │  │
│  │  - Description: Coffee order #123                                                 │  │
│  │  - Network: Arbitrum Sepolia (cheaper gas)                                       │  │
│  │  - Your Account: 0xdd0A...b896 (loaded from localStorage)                       │  │
│  │  - Your Balance: 150 PYUSD on Ethereum Sepolia                                  │  │
│  │  ─────────────────────────────────────────────────────────────────────────────    │  │
│  │  ⚠️ CROSS-CHAIN DETECTED: Need to bridge from Ethereum → Arbitrum               │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                     │
                                     │ 2. Customer clicks "Pay 100 PYUSD"
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          Frontend (Cost Engine Check)                                     │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  GET /api/cost-engine/calculate                                                    │  │
│  │  Query: {                                                                          │  │
│  │    from: 11155111,      // Ethereum Sepolia                                      │  │
│  │    to: 421614,          // Arbitrum Sepolia                                      │  │
│  │    amount: 100000000,   // 100 PYUSD                                             │  │
│  │    account: "0xdd0A..." // Customer account                                      │  │
│  │  }                                                                                 │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                     │
                                     │ 3. Fetch gas costs & bridge fees
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          Cost Engine Service (Node.js)                                    │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  GET /calculate                                                                    │  │
│  │  ─────────────────────────────────────────────────────────────────────────────    │  │
│  │  Calculation:                                                                      │  │
│  │                                                                                     │  │
│  │  Option A: Direct payment (Ethereum Sepolia)                                      │  │
│  │    - Gas: 174,000 * 2.5 gwei * 3500 USD/ETH = $1.52                             │  │
│  │    - Total: $101.52                                                               │  │
│  │                                                                                     │  │
│  │  Option B: Bridge + Pay (Ethereum → Arbitrum)                                    │  │
│  │    - Bridge gas (Ethereum): 145,000 * 2.5 gwei * 3500 = $1.27                   │  │
│  │    - Payment gas (Arbitrum): 174,000 * 0.1 gwei * 3500 = $0.06                  │  │
│  │    - Bridge fee: 0.1% = 0.1 PYUSD                                                │  │
│  │    - Total: $101.43 (CHEAPER!)                                                    │  │
│  │  ─────────────────────────────────────────────────────────────────────────────    │  │
│  │  Returns: {                                                                        │  │
│  │    recommendedPath: "BRIDGE",                                                     │  │
│  │    fromChain: 11155111,                                                           │  │
│  │    toChain: 421614,                                                               │  │
│  │    estimatedSavings: 0.09  // $0.09 USD                                          │  │
│  │  }                                                                                 │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                     │
                                     │ 4. Show recommendation to user
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          Checkout Page (Confirmation)                                     │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  💰 Smart Routing Enabled                                                         │  │
│  │  ─────────────────────────────────────────────────────────────────────────────    │  │
│  │  Your PYUSD is on Ethereum, but invoice is on Arbitrum                           │  │
│  │  We'll automatically bridge for you (saves $0.09 in gas)                         │  │
│  │                                                                                    │  │
│  │  Payment breakdown:                                                                │  │
│  │  - Amount: 100 PYUSD                                                              │  │
│  │  - Bridge fee: 0.1 PYUSD                                                          │  │
│  │  - Gas: FREE (sponsored by paymaster)                                            │  │
│  │  - Total: 100.1 PYUSD                                                             │  │
│  │                                                                                    │  │
│  │  [Confirm Payment]                                                                │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬─────────────────────────────────────────────────────┘

                                     │
                                     │ 5. User confirms (triggers session key signature)
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                       Session Key Enablement (Frontend → Relayer)                         │
└──────────────────────────────────────────────────────────────────────────────────────────┘

│  Frontend (apps/web/lib/sessionKey.ts)
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  1. Generate ephemeral keypair                                                       │  │
│  │     const sessionKeyPair = privateKeyToAccount(generatePrivateKey())               │  │
│  │                                                                                    │  │
│  │  2. Extract 64-byte ECDSA public key                                               │  │
│  │     const ecdsaPublicKey = sessionKeyPair.publicKey.slice(4) // Remove 0x04 prefix│  │
│  │     Returns: 0xc908625ced...1e49e (64 bytes)                                      │  │
│  │                                                                                    │  │
│  │  3. Store in sessionStorage                                                        │  │
│  │     {                                                                              │  │
│  │       publicKey: "0xc908...",                                                   │  │
│  │       ecdsaPublicKey: "0xc908625ced...",                                        │  │
│  │       privateKey: "0x..."                                                        │  │
│  │     }                                                                              │  │
│  │                                                                                    │  │
│  │  4. Send to relayer                                                                │  │
│  │     POST /session/enable                                                           │  │
│  │     {                                                                              │  │
│  │       account: "0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896",                     │  │
│  │       sessionPubKey: "0xc908625ced01d678...361e49e",                           │  │
│  │       validUntil: 1749553800,                                                     │  │
│  │       policyId: 0                                                                 │  │
│  │     }                                                                              │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │

┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                               Relayer: attest & enable session key                        │
└──────────────────────────────────────────────────────────────────────────────────────────┘

│  Relayer (apps/relayer/src/routes/index.ts)
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  1. Validate input                                                                 │  │
│  │     - Check sessionPubKey is 0x-prefixed hex                                      │  │
│  │     - Check length = 66 + 128 = 194 chars (0x + 64 bytes)                         │  │
│  │                                                                                    │  │
│  │  2. Hash the session public key                                                    │  │
│  │     const pubKeyHash = keccak256(sessionPubKey)                                   │  │
│  │                                                                                    │  │
│  │  3. Create message digest and sign with guardian (EIP-191)                        │  │
│  │     const message = keccak256(abi.encodePacked(account, pubKeyHash, validUntil, policyId))
│  │     const signature = guardianWallet.signMessage(message)                        │  │
│  │                                                                                    │  │
│  │  4. Send enableSessionKey txn from guardian to TapKitAccount                       │  │
│  │     TapKitAccount.enableSessionKey(pubKeyHash, validUntil, policyId, signature)   │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │

✅ Session Key enabled on-chain (event emitted)

┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          Frontend (Construct UserOperation)                               │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  const sessionKey = JSON.parse(sessionStorage.getItem("sessionKey"))             │  │
│  │  const account = JSON.parse(localStorage.getItem("account"))                     │  │
│  │                                                                                    │  │
│  │  // Step 1: Encode bridge call                                                    │  │
│  │  const bridgeCalldata = encodeFunctionData({                                      │  │
│  │    abi: bridgeAbi,                                                                │  │
│  │    functionName: "lockAndBridge",                                                 │  │
│  │    args: [                                                                        │  │
│  │      PYUSD_ETHEREUM,           // token                                          │  │
│  │      100100000,                // 100.1 PYUSD (amount + fee)                    │  │
│  │      421614,                   // destination chain                             │  │
│  │      account.address,          // recipient                                      │  │
│  │      nonce++                   // bridge nonce                                   │  │
│  │    ]                                                                              │  │
│  │  })                                                                               │  │
│  │                                                                                    │  │
│  │  // Step 2: Construct UserOperation                                              │  │
│  │  const userOp = {                                                                 │  │
│  │    sender: "0xdd0Aab09D56ebB88F32caeFF3b06c52F9991b896",                       │  │
│  │    nonce: "0x5",  // From account state                                         │  │
│  │    initCode: "0x",  // Already deployed                                         │  │
│  │    callData: encodeFunctionData({                                                │  │
│  │      abi: accountAbi,                                                            │  │
│  │      functionName: "execute",                                                    │  │
│  │      args: [BRIDGE_ADDRESS, 0, bridgeCalldata]                                  │  │
│  │    }),                                                                            │  │
│  │    callGasLimit: "0x23280",      // 145,000                                     │  │
│  │    verificationGasLimit: "0xF424", // 62,500                                    │  │
│  │    preVerificationGas: "0xAE60",  // 44,640                                     │  │
│  │    maxFeePerGas: "0x59682F00",    // 1.5 gwei                                   │  │
│  │    maxPriorityFeePerGas: "0x59682F00",                                          │  │
│  │    paymasterAndData: "0x",        // Will be filled by relayer                  │  │
│  │    signature: "0x"                // Will be filled next                        │  │
│  │  }                                                                                │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                     │
                                     │ 6. Sign UserOperation with session key
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          Frontend (Session Key Signature)                                 │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  // Get UserOperation hash (EIP-4337)                                             │  │
│  │  const chainId = 11155111  // Ethereum Sepolia                                   │  │
│  │  const userOpHash = keccak256(                                                    │  │
│  │    abi.encode(                                                                    │  │
│  │      ["bytes32", "address", "uint256"],                                          │  │
│  │      [                                                                            │  │
│  │        keccak256(packUserOp(userOp)),  // Hash of UserOp fields                │  │
│  │        ENTRYPOINT_ADDRESS,             // 0x5FF1...                             │  │
│  │        chainId                                                                   │  │
│  │      ]                                                                            │  │
│  │    )                                                                              │  │
│  │  )                                                                                │  │
│  │  // Result: 0xabcd1234567890abcdef...                                           │  │
│  │                                                                                    │  │
│  │  // Sign with session key private key                                            │  │
│  │  const sessionAccount = privateKeyToAccount(sessionKey.privateKey)               │  │
│  │  const signature = await sessionAccount.signMessage({                            │  │
│  │    message: { raw: userOpHash }                                                  │  │
│  │  })                                                                               │  │
│  │  // Result: 0x<r:32><s:32><v:1> (65 bytes)                                      │  │
│  │                                                                                    │  │
│  │  // Format signature with session key metadata                                   │  │
│  │  const finalSignature = concat([                                                 │  │
│  │    "0x01",                        // Session key mode flag                       │  │
│  │    sessionKey.ecdsaPublicKey,    // 64 bytes                                    │  │
│  │    signature                      // 65 bytes                                    │  │
│  │  ])                                                                               │  │
│  │  // Total: 1 + 64 + 65 = 130 bytes                                              │  │
│  │                                                                                    │  │
│  │  userOp.signature = finalSignature                                               │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                     │
                                     │ 7. Send to relayer
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          Relayer Service (UserOp Processing)                              │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  POST /userop/submit                                                               │  │
│  │  ─────────────────────────────────────────────────────────────────────────────    │  │
│  │  Step 1: Get paymaster signature                                                  │  │
│  │  POST http://localhost:3002/paymaster/sponsor                                     │  │
│  │  Body: { userOp, entryPoint, chainId: 11155111 }                                 │  │
│  │  ─────────────────────────────────────────────────────────────────────────────    │  │
│  │  Paymaster validates:                                                             │  │
│  │  1. Account is registered                                                         │  │
│  │  2. Bridge operation is whitelisted                                              │  │
│  │  3. Gas limits are reasonable                                                     │  │
│  │  4. Sufficient paymaster deposit                                                  │  │
│  │  ─────────────────────────────────────────────────────────────────────────────    │  │
│  │  Returns: {                                                                        │  │
│  │    paymasterAndData: concat([                                                     │  │
│  │      PAYMASTER_ADDRESS,          // 20 bytes                                     │  │
│  │      validUntil,                 // 6 bytes                                      │  │
│  │      validAfter,                 // 6 bytes                                      │  │
│  │      paymasterSignature          // 65 bytes                                     │  │
│  │    ])                            // Total: 97 bytes                              │  │
│  │  }                                                                                 │  │
│  │  ─────────────────────────────────────────────────────────────────────────────    │  │
│  │  Step 2: Update UserOp with paymaster data                                       │  │
│  │  userOp.paymasterAndData = response.paymasterAndData                             │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                     │
                                     │ 8. Submit to EntryPoint
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          EntryPoint Contract (ERC-4337)                                   │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  Call: handleOps([userOp], relayerAddress)                                        │  │
│  │  ─────────────────────────────────────────────────────────────────────────────    │  │
│  │  VALIDATION PHASE:                                                                 │  │
│  │  ─────────────────────────────────────────────────────────────────────────────    │  │
│  │  1. Call account.validateUserOp(userOp, userOpHash, missingFunds)                │  │
│  └────────────────────────────────────┬───────────────────────────────────────────────┘  │
└────────────────────────────────────┬──┴──────────────────────────────────────────────────┘
                                     │
                                     │ 9. Validate signature
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          Smart Account Contract (validateUserOp)                          │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  function validateUserOp(                                                          │  │
│  │    UserOperation calldata userOp,                                                 │  │
│  │    bytes32 userOpHash,                                                            │  │
│  │    uint256 missingAccountFunds                                                    │  │
│  │  ) external returns (uint256 validationData) {                                   │  │
│  │                                                                                    │  │
│  │    // Check signature mode (first byte)                                          │  │
│  │    bytes1 mode = userOp.signature[0]                                             │  │
│  │    if (mode == 0x01) {  // Session key mode                                     │  │
│  │      // Extract session key public key (64 bytes)                               │  │
│  │      bytes memory sessionPubKey = userOp.signature[1:65]                        │  │
│  │      bytes32 pubKeyHash = keccak256(sessionPubKey)                              │  │
│  │                                                                                    │  │
│  │      // Load session key from storage                                           │  │
│  │      SessionKey memory session = sessionKeys[pubKeyHash]                        │  │
│  │      require(session.active, "Session key not active")                          │  │
│  │      require(block.timestamp <= session.validUntil, "Session expired")         │  │
│  │                                                                                    │  │
│  │      // Extract ECDSA signature (65 bytes)                                      │  │
│  │      bytes memory signature = userOp.signature[65:130]                          │  │
│  │                                                                                    │  │
│  │      // Recover signer using ecrecover                                          │  │
│  │      bytes32 ethSignedHash = keccak256(                                         │  │
│  │        abi.encodePacked("\x19Ethereum Signed Message:\n32", userOpHash)        │  │
│  │      )                                                                           │  │
│  │      address signer = ecrecover(                                                 │  │
│  │        ethSignedHash,                                                           │  │
│  │        uint8(signature[64]),     // v                                           │  │
│  │        bytes32(signature[0:32]), // r                                           │  │
│  │        bytes32(signature[32:64]) // s                                           │  │
│  │      )                                                                           │  │
│  │                                                                                    │  │
│  │      // Calculate expected address from public key                              │  │
│  │      address expected = address(                                                 │  │
│  │        uint160(uint256(keccak256(sessionPubKey)))                               │  │
│  │      )                                                                           │  │
│  │                                                                                    │  │
│  │      require(signer == expected, "Invalid session signature")                   │  │
│  │    }                                                                              │  │
│  │                                                                                    │  │
│  │    // Pay EntryPoint from account balance (if needed)                           │  │
│  │    if (missingAccountFunds > 0) {                                               │  │
│  │      payable(msg.sender).transfer(missingAccountFunds)                          │  │
│  │    }                                                                              │  │
│  │                                                                                    │  │
│  │    return 0;  // Success                                                         │  │
│  │  }                                                                                │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                     │
                                     │ 10. Signature valid, continue to paymaster
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          EntryPoint (Paymaster Validation)                                │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  2. Call paymaster.validatePaymasterUserOp(userOp, userOpHash, maxCost)          │  │
│  └────────────────────────────────────┬───────────────────────────────────────────────┘  │
└────────────────────────────────────┬──┴──────────────────────────────────────────────────┘
                                     │
                                     │ 11. Validate paymaster signature
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          Paymaster Contract (validatePaymasterUserOp)                     │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  function validatePaymasterUserOp(                                                 │  │
│  │    UserOperation calldata userOp,                                                 │  │
│  │    bytes32 userOpHash,                                                            │  │
│  │    uint256 maxCost                                                                │  │
│  │  ) external returns (bytes memory context, uint256 validationData) {             │  │
│  │                                                                                    │  │
│  │    // Extract paymaster signature from paymasterAndData                          │  │
│  │    bytes memory signature = userOp.paymasterAndData[32:97]                       │  │
│  │    uint48 validUntil = uint48(bytes6(userOp.paymasterAndData[20:26]))           │  │
│  │    uint48 validAfter = uint48(bytes6(userOp.paymasterAndData[26:32]))           │  │
│  │                                                                                    │  │
│  │    // Reconstruct signed message                                                  │  │
│  │    bytes32 hash = keccak256(                                                      │  │
│  │      abi.encode(userOpHash, validUntil, validAfter)                              │  │
│  │    )                                                                              │  │
│  │                                                                                    │  │
│  │    // Verify signer is paymaster owner                                           │  │
│  │    address signer = SignatureCheckerLib.recoverSigner(hash, signature)          │  │
│  │    require(signer == owner(), "Invalid paymaster signature")                     │  │
│  │                                                                                    │  │
│  │    // Check deposit is sufficient                                                │  │
│  │    require(getDeposit() >= maxCost, "Insufficient paymaster deposit")           │  │
│  │                                                                                    │  │
│  │    // Return validation data (success)                                           │  │
│  │    return (                                                                       │  │
│  │      abi.encode(userOp.sender, maxCost),  // Context for postOp                 │  │
│  │      _packValidationData(false, validUntil, validAfter)                         │  │
│  │    );                                                                             │  │
│  │  }                                                                                │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                     │
                                     │ 12. Validation successful, execute
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          EntryPoint (Execution Phase)                                     │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  EXECUTION PHASE:                                                                  │  │
│  │  ─────────────────────────────────────────────────────────────────────────────    │  │
│  │  3. Call account.execute(target, value, data)                                    │  │
│  │     with callData from UserOp                                                     │  │
│  └────────────────────────────────────┬───────────────────────────────────────────────┘  │
└────────────────────────────────────┬──┴──────────────────────────────────────────────────┘
                                     │
                                     │ Direct flow alternative (Checkout.settle)
                                     │
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                      DIRECT FLOW (ON-SOURCE-CHAIN SETTLEMENT)                             │
└──────────────────────────────────────────────────────────────────────────────────────────┘

│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  Instead of calling the BridgeEscrow, the account may execute a direct settlement │  │
│  │  Smart Account executes a call to the Checkout contract to settle the invoice     │  │
│  │  on-chain:                                                                         │  │
│  │    Checkout.settle(invoiceId, merchantAddress, amount, metadata)                 │  │
│  │                                                                                    │  │
│  │  Effects:                                                                          │  │
│  │    - Checkout.settle performs the final ERC20 transfer to the merchant on-chain  │  │
│  │    - Emits the standard Transfer event that the Indexer watches to mark COMPLETE  │  │
│  │    - No cross-chain bridging steps required for this path                         │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │

                                     │
                                     │ 13. Execute bridge transaction
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          Smart Account (execute)                                          │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  function execute(address target, uint256 value, bytes calldata data)            │  │
│  │    external payable onlyEntryPoint {                                              │  │
│  │                                                                                    │  │
│  │    // Call bridge contract                                                        │  │
│  │    (bool success, bytes memory result) = target.call{value: value}(data)        │  │
│  │    require(success, "Call failed")                                               │  │
│  │  }                                                                                │  │
│  │  ─────────────────────────────────────────────────────────────────────────────    │  │
│  │  Target: 0x1234... (BridgeEscrow contract)                                       │  │
│  │  Data: lockAndBridge(PYUSD, 100100000, 421614, 0xdd0A..., nonce)               │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                     │
                                     │ 14. Lock tokens on source chain
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          BridgeEscrow Contract (Ethereum)                                 │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  function lockAndBridge(                                                           │  │
│  │    address token,           // PYUSD_ETHEREUM                                     │  │
│  │    uint256 amount,          // 100.1 PYUSD                                        │  │
│  │    uint256 destChainId,     // 421614                                            │  │
│  │    address recipient,       // Customer account                                   │  │
│  │    uint256 nonce            // Bridge nonce                                       │  │
│  │  ) external {                                                                      │  │
│  │                                                                                    │  │
│  │    // Transfer tokens from sender to bridge                                      │  │
│  │    IERC20(token).transferFrom(msg.sender, address(this), amount)                 │  │
│  │                                                                                    │  │
│  │    // Calculate fee (0.1%)                                                       │  │
│  │    uint256 fee = (amount * 10) / 10000;  // 0.1%                                │  │
│  │    uint256 netAmount = amount - fee;                                             │  │
│  │                                                                                    │  │
│  │    // Store bridge request                                                        │  │
│  │    bytes32 bridgeId = keccak256(                                                  │  │
│  │      abi.encode(block.chainid, destChainId, token, recipient, amount, nonce)    │  │
│  │    )                                                                              │  │
│  │                                                                                    │  │
│  │    bridges[bridgeId] = BridgeRequest({                                           │  │
│  │      token: token,                                                               │  │
│  │      amount: netAmount,                                                          │  │
│  │      destChainId: destChainId,                                                   │  │
│  │      recipient: recipient,                                                       │  │
│  │      timestamp: block.timestamp,                                                 │  │
│  │      status: Status.LOCKED                                                       │  │
│  │    })                                                                             │  │
│  │                                                                                    │  │
│  │    // Emit event for relayer to watch                                            │  │
│  │    emit TokensLocked(                                                             │  │
│  │      bridgeId, token, netAmount, destChainId, recipient, nonce                  │  │
│  │    )                                                                              │  │
│  │  }                                                                                │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                     │
                                     │ 15. Emit TokensLocked event
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          Bridge Watcher (Relayer Service)                                 │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  Event detected: TokensLocked                                                      │  │
│  │  - bridgeId: 0xabcd1234...                                                       │  │
│  │  - token: PYUSD_ETHEREUM                                                          │  │
│  │  - amount: 100 PYUSD (after 0.1% fee)                                           │  │
│  │  - destChainId: 421614                                                            │  │
│  │  - recipient: 0xdd0A...                                                          │  │
│  │  ─────────────────────────────────────────────────────────────────────────────    │  │
│  │  Processing:                                                                       │  │
│  │  1. Wait for 12 confirmations (safety)                                           │  │
│  │  2. Verify bridge ID hasn't been processed (replay protection)                   │  │
│  │  3. Check destination chain inventory                                            │  │
│  │  4. Submit release transaction on Arbitrum                                        │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                     │
                                     │ 16. Submit release on destination chain
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          BridgeEscrow Contract (Arbitrum)                                 │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  function release(                                                                 │  │
│  │    bytes32 bridgeId,                                                              │  │
│  │    address recipient,                                                             │  │
│  │    uint256 amount                                                                 │  │
│  │  ) external onlyRelayer {                                                         │  │
│  │                                                                                    │  │
│  │    // Check bridge hasn't been processed                                         │  │
│  │    require(!processed[bridgeId], "Already processed")                            │  │
│  │    processed[bridgeId] = true                                                    │  │
│  │                                                                                    │  │
│  │    // Transfer from inventory to recipient                                       │  │
│  │    IERC20(PYUSD_ARBITRUM).transfer(recipient, amount)                           │  │
│  │                                                                                    │  │
│  │    // Update inventory                                                            │  │
│  │    inventory -= amount                                                            │  │
│  │                                                                                    │  │
│  │    emit TokensReleased(bridgeId, recipient, amount)                              │  │
│  │  }                                                                                │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                     │
                                     │ 17. Funds now on Arbitrum, trigger payment
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          Frontend (Payment UserOperation)                                 │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  // Now funds are on Arbitrum, execute actual payment                            │  │
│  │  const paymentCalldata = encodeFunctionData({                                     │  │
│  │    abi: pyusdAbi,                                                                 │  │
│  │    functionName: "transfer",                                                      │  │
│  │    args: [merchantAddress, 100000000]  // 100 PYUSD                             │  │
│  │  })                                                                               │  │
│  │                                                                                    │  │
│  │  // Repeat UserOperation flow (steps 6-14) on Arbitrum                           │  │
│  │  // This time: direct PYUSD transfer (no bridge)                                 │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                     │
                                     │ 18. Execute payment on Arbitrum
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          PYUSD Contract (Arbitrum)                                        │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  ERC20.transfer(merchant, 100 PYUSD)                                              │  │
│  │  ─────────────────────────────────────────────────────────────────────────────    │  │
│  │  Balances updated:                                                                 │  │
│  │  - Customer (0xdd0A...): 0 PYUSD (spent 100.1)                                   │  │
│  │  - Merchant (0x99d4...): 100 PYUSD (received)                                    │  │
│  │  - Bridge fee vault: 0.1 PYUSD                                                   │  │
│  │                                                                                    │  │
│  │  emit Transfer(customer, merchant, 100000000)                                     │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                     │
                                     │ 19. Payment complete, update invoice
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          Indexer (Payment Watcher)                                        │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  Event detected: Transfer (PYUSD)                                                  │  │
│  │  - from: 0xdd0A... (customer)                                                     │  │
│  │  - to: 0x99d4... (merchant)                                                       │  │
│  │  - amount: 100 PYUSD                                                              │  │
│  │  ─────────────────────────────────────────────────────────────────────────────    │  │
│  │  Match to invoice: 550e8400-e29b-41d4-a716-446655440000                          │  │
│  │                                                                                    │  │
│  │  UPDATE invoices SET                                                               │  │
│  │    status = 'COMPLETED',                                                          │  │
│  │    paid_at = now(),                                                               │  │
│  │    tx_hash = '0xabc123...',                                                       │  │
│  │    chain_id = 421614,                                                             │  │
│  │    customer_address = '0xdd0A...'                                                │  │
│  │  WHERE id = '550e8400...'                                                         │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                     │
                                     │ 20. Notify merchant & customer
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          Frontend (Real-time Updates)                                     │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  WebSocket event: "invoice.completed"                                             │  │
│  │                                                                                    │  │
│  │  Merchant Dashboard:                                                               │  │
│  │  ✅ Payment received: 100 PYUSD                                                   │  │
│  │     From: 0xdd0A...b896                                                           │  │
│  │     Invoice: Coffee order #123                                                    │  │
│  │     Network: Arbitrum Sepolia                                                     │  │
│  │     Tx: 0xabc123...                                                               │  │
│  │                                                                                    │  │
│  │  Customer Checkout:                                                                │  │
│  │  ✅ Payment successful!                                                            │  │
│  │     Amount: 100 PYUSD                                                             │  │
│  │     Fee: 0.1 PYUSD (bridge)                                                       │  │
│  │     Gas: FREE (sponsored)                                                         │  │
│  │     Receipt: #550e8400...                                                         │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```


