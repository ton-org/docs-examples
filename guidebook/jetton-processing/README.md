# Jetton Payment Processing Examples

Educational TypeScript examples demonstrating jetton (token) payment processing on the TON blockchain.

## Libraries Used

- [@ton/ton](https://github.com/ton-org/ton) - High-level TON blockchain API client
- [@ton/core](https://github.com/ton-org/ton-core) - Core primitives for TON blockchain
- [@ton/crypto](https://github.com/ton-org/ton-crypto) - Cryptographic primitives for TON

## Examples

### 1. Single Wallet with Invoices (`src/deposits/jetton-invoices.ts`)

Demonstrates accepting jetton deposits to a single wallet using unique text comments (UUIDs) to identify each payment.

**Use case**: Payment processing where each jetton payment is tracked by a unique identifier in the transfer notification comment.

### 2. Multi-Wallet Jetton Deposits (`src/deposits/jetton-unique-addresses.ts`)

Demonstrates accepting jetton deposits where each user has their own unique deposit wallet with associated jetton wallets.

**Use case**: Exchange or service where users need permanent deposit addresses for multiple jetton types.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure your environment:
   - Copy `.env.example` to `.env`
   - Set your API key and wallet address
   - Configure supported jetton minters
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
- `npm run start:unique` - Run the multi-wallet jetton deposits example
- `npm run build` - Type-check the project (does not produce executable output)
- `npm run format` - Format code with Prettier

## ⚠️ Educational Use Only

These examples are for learning purposes. Do not deploy to production without:
- Thorough security review
- Proper error handling
- Database persistence
- Monitoring and alerting
- Rate limiting and retry strategies
- Proper jetton wallet validation
