# TON Payment Processing Examples

Modern TypeScript examples for processing TON blockchain payments using `@ton/ton` and `@ton/core` libraries.

## Overview

This project includes two main approaches for accepting TON deposits:

### 1. Single Wallet with Comments (`deposits.ts`)
- Users send TON to one wallet address
- Each payment includes a unique UUID in the comment field
- Backend polls wallet transactions
- Best for: Simple setups, services where users can add comments

### 2. Multi-Wallet Deposits (`deposits-multi-wallet.ts`)
- Each user gets their own unique deposit wallet address
- Funds automatically forwarded to a master HOT wallet
- Backend monitors all blockchain blocks
- Best for: Exchange-like services, when comments aren't reliable

## Installation

```bash
npm install
```

## Usage

### Single Wallet Deposits

```bash
npm start                # Full featured example
npm run start:simple     # Simple example
```

### Multi-Wallet Deposits

```bash
npm run start:multi      # Multi-wallet example
```

### Generate Payment Links

```bash
npm run payment-link     # Generate payment deeplinks
```

## Configuration

Edit the example files to configure:

```typescript
const IS_MAINNET = false; // true for mainnet, false for testnet
const API_KEY = 'YOUR_API_KEY_HERE'; // Get from toncenter.com
const MY_WALLET_ADDRESS = 'YOUR_WALLET_ADDRESS'; // For single wallet
const HOT_WALLET_ADDRESS = 'YOUR_HOT_WALLET'; // For multi-wallet
```

## How Each Approach Works

### Single Wallet Approach

**Flow:**
1. Generate one wallet address for your service
2. For each payment, generate a unique UUID
3. User sends TON with UUID as comment
4. Backend polls wallet transactions
5. Match UUID to payment in database
6. Credit user account

**Pros:**
- Simple setup (one wallet)
- Lower infrastructure requirements
- Easy to understand

**Cons:**
- Requires users to add comments
- Comment field may be missing or incorrect
- Need to handle duplicate/missing UUIDs

**Use cases:**
- Payment processors
- Donation systems
- Simple checkout flows

### Multi-Wallet Approach

**Flow:**
1. Generate a master HOT wallet
2. For each user, generate a unique deposit wallet
3. User sends TON to their personal address
4. Backend monitors all blockchain blocks
5. Detect deposit to user's wallet
6. Auto-forward to HOT wallet and destroy deposit wallet
7. Credit user account

**Pros:**
- No comment field needed
- Each user has permanent address
- More reliable tracking
- Better UX (no memo required)

**Cons:**
- More complex infrastructure
- Need to monitor entire blockchain
- Requires Index API or full node
- Extra transaction cost (forwarding)

**Use cases:**
- Cryptocurrency exchanges
- Trading platforms
- Wallets with deposit addresses
- Services where users can't add memos

### Key Differences

| Feature | Single Wallet | Multi-Wallet |
|---------|--------------|--------------|
| **Setup Complexity** | Simple | Complex |
| **Wallet Count** | 1 | 1 per user |
| **Comment Required** | Yes | No |
| **Monitoring** | Poll one wallet | Monitor all blocks |
| **Transaction Cost** | Lower | Higher (forwarding) |
| **User Experience** | Need to add memo | Just send to address |
| **Reliability** | Depends on comments | High |
| **Best For** | Simple services | Exchanges, platforms |

## Project Structure

```
src/
├── deposits.ts                    # Single wallet with comments
├── deposits-multi-wallet.ts       # Multi-wallet with auto-forwarding
├── simple-example.ts             # Minimal single wallet example
├── AccountSubscription.ts         # Transaction polling for single wallet
├── BlockSubscription.ts          # Block monitoring for multi-wallet
├── payment-link.ts               # Payment deeplink generator
└── config.ts                     # Configuration utilities
```

## Architecture Details

### Single Wallet Architecture

```
User Wallet → [TON + UUID comment] → Your Wallet
                                           ↓
                                    Your Backend
                                           ↓
                                    Poll Transactions
                                           ↓
                                    Match UUID → Credit User
```

### Multi-Wallet Architecture

```
User Wallet → [TON] → User's Deposit Wallet
                            ↓
                      Auto-forward (destroy wallet)
                            ↓
                      Your HOT Wallet
                            ↓
                      Your Backend
                            ↓
                    Monitor Blocks → Credit User
```

## Advanced Topics

### Why Destroy Deposit Wallets?

TON charges a small storage fee for deployed contracts. To avoid these fees on empty wallets:

1. After forwarding, destroy the deposit wallet (`sendMode: 128 + 32`)
2. Wallet account becomes `uninitialized`
3. No storage fees charged
4. Can be redeployed automatically on next deposit

```typescript
sendMode: 128 + 32
// 128 = send all remaining balance
// 32 = destroy contract if balance becomes zero
```

### Block Monitoring vs Transaction Polling

**Transaction Polling** (Single Wallet):
- Poll one specific wallet's transactions
- Lower API usage
- Simpler implementation
- Only sees your wallet's activity

**Block Monitoring** (Multi-Wallet):
- Subscribe to all new blocks
- See all blockchain activity
- Can filter for your deposit addresses
- Requires Index API
- More complex but more powerful

### Security Considerations

**Both Approaches:**
- Always verify no outgoing messages (no bounce)
- Double-check transactions with direct node request
- Implement idempotency (don't process twice)
- Use database transactions for atomic operations

**Multi-Wallet Specific:**
- Store private keys securely
- Use HSM for HOT wallet in production
- Implement rate limiting for forwarding
- Monitor for suspicious deposit patterns

## Production Checklist

- [ ] Use environment variables for API keys
- [ ] Implement proper database (PostgreSQL, MongoDB)
- [ ] Add comprehensive logging
- [ ] Set up monitoring and alerts
- [ ] Implement retry logic for failed operations
- [ ] Add transaction idempotency checks
- [ ] Test on testnet thoroughly
- [ ] Set up backup for last processed block/timestamp
- [ ] Implement graceful shutdown
- [ ] Add health check endpoints
- [ ] Set up automatic restarts
- [ ] Monitor API rate limits
- [ ] Implement circuit breakers for API calls

## Resources

- [@ton/ton on npm](https://www.npmjs.com/package/@ton/ton)
- [@ton/core on npm](https://www.npmjs.com/package/@ton/core)
- [@ton/crypto on npm](https://www.npmjs.com/package/@ton/crypto)
- [TonCenter API](https://toncenter.com/api/v2/)
- [TonCenter Index API](https://toncenter.com/api/index/)
- [TON HTTP API](https://github.com/toncenter/ton-http-api)
