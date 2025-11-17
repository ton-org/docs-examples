# Toncoin Payment Processing Examples

Educational TypeScript examples demonstrating Toncoin payment processing on the TON blockchain.

## Libraries Used

- [@ton/ton](https://github.com/ton-org/ton) - High-level TON blockchain API client
- [@ton/core](https://github.com/ton-org/ton-core) - Core primitives for TON blockchain
- [@ton/crypto](https://github.com/ton-org/ton-crypto) - Cryptographic primitives for TON

## Examples

### 1. Single Wallet with Invoices (`src/deposits/invoices.ts`)

Demonstrates accepting Toncoin deposits to a single wallet using unique text comments (UUIDs) to identify each payment.

**Use case**: Payment processing where each payment is tracked by a unique identifier in the transaction comment.

### 2. Multi-Wallet Deposits (`src/deposits/unique-addresses.ts`)

Demonstrates accepting Toncoin deposits where each user has their own unique deposit wallet that forwards funds to a master HOT wallet.

**Use case**: Exchange or service where users need permanent deposit addresses.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure your environment:
   - Copy `.env.example` to `.env`
   - Set your API key and wallet address
   - Choose mainnet or testnet

3. Run an example:
```bash
# Single wallet invoices example
npm start

# Multi-wallet example
npm run start:unique
```

## Development Scripts

- `npm start` - Run the single-wallet invoices example
- `npm run start:unique` - Run the multi-wallet deposits example
- `npm run build` - Type-check the project (does not produce executable output)
- `npm run format` - Format code with Prettier

## ⚠️ Educational Use Only

These examples are for learning purposes. Do not deploy to production without:
- Thorough security review
- Proper error handling
- Database persistence
- Monitoring and alerting
- Rate limiting and retry strategies
