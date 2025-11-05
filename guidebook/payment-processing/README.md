# TON Payment Processing Examples

Modern TypeScript examples for processing TON blockchain payments using `@ton/ton` and `@ton/core` libraries.

## Overview

This project demonstrates how to accept TON coin deposits to a single wallet address. It includes:

- **Deposit Monitoring**: Poll the blockchain for incoming transactions
- **Comment Parsing**: Extract text comments (UUIDs) from transactions
- **Error Recovery**: Automatic retry logic with exponential backoff
- **Type Safety**: Full TypeScript support with comprehensive types

## Features

- ✅ Modern `@ton/ton` and `@ton/core` libraries (no deprecated TonWeb)
- ✅ Clean TypeScript code with strict typing
- ✅ Proper error handling and retry logic
- ✅ Transaction validation (checks for bounced transactions)
- ✅ Efficient pagination for transaction history
- ✅ Production-ready architecture

## Prerequisites

- Node.js 18+ 
- TypeScript 5+
- TON API key from [toncenter.com](https://toncenter.com)

## Installation

```bash
npm install
```

## Configuration

Edit `src/deposits.ts` to configure:

```typescript
const IS_MAINNET = false; // true for mainnet, false for testnet
const API_KEY = 'YOUR_API_KEY_HERE'; // Get from toncenter.com
const MY_WALLET_ADDRESS = 'YOUR_WALLET_ADDRESS';
```

## Usage

### Running the Deposit Monitor

```bash
npm start
```

This will start monitoring your wallet for incoming transactions.

### Building the Project

```bash
npm run build
```

### Code Formatting

```bash
npm run format
```

## Project Structure

```
src/
├── types.ts                  # TypeScript type definitions
├── AccountSubscription.ts    # Transaction polling logic
└── deposits.ts              # Main application entry point
```

## How It Works

### 1. Payment Flow

1. **Generate Payment Request**: When a user needs to pay:
   - Generate a unique UUID for the payment
   - Save it to your database with user info and expected amount
   - Display payment instructions to user

2. **User Makes Payment**: User sends TON with:
   - Your wallet address
   - Correct amount
   - UUID as text comment
   
   Use this deeplink format:
   ```
   ton://transfer/<WALLET_ADDRESS>?amount=<AMOUNT_IN_NANO>&text=<UUID>
   ```

3. **Monitor Transactions**: Backend continuously polls for transactions

4. **Process Deposits**: When transaction is detected:
   - Verify UUID exists in database
   - Check payment hasn't been processed
   - Validate amount matches expected
   - Credit user account
   - Mark as processed

### 2. Transaction Validation

**Critical checks performed:**

```typescript
// Must have a source address (incoming transaction)
if (!tx.inMessage?.source) return;

// Must have NO outgoing messages (prevents processing bounced coins)
if (tx.outMessages.length > 0) return;

// Must have a text comment (UUID for payment identification)
if (!comment) return;
```

### 3. Comment Format

Text comments use the following format:
- Opcode: `0x00000000` (32-bit, indicates text message)
- Text: UTF-8 string (your UUID)

Example:
```
User UUID: "payment-123-abc-def"
Transaction comment: "payment-123-abc-def"
```

## Production Considerations

### 1. Database Integration

Store and track:
- Payment UUIDs with user IDs and expected amounts
- Last processed transaction timestamp (`startTime`)
- Processed transaction hashes (prevent double-processing)

```typescript
interface PaymentRecord {
  uuid: string;
  userId: string;
  expectedAmount: bigint;
  processed: boolean;
  transactionHash?: string;
  processedAt?: Date;
}
```

### 2. Idempotency

Always check if a transaction has been processed:

```typescript
const existingPayment = await db.findByTransactionHash(tx.hash);
if (existingPayment) {
  console.log('Already processed');
  return;
}
```

### 3. Error Handling

- Log all deposits for audit trail
- Alert on unexpected amounts
- Handle edge cases (zero amount, invalid UUID, etc.)

### 4. Security

- Validate wallet addresses
- Use HTTPS for API calls
- Keep API keys in environment variables
- Implement rate limiting
- Set reasonable transaction value limits

### 5. Monitoring

- Track polling health
- Alert on API errors
- Monitor processing delays
- Dashboard for deposit statistics

## API Rate Limits

TonCenter API limits:
- **Free tier**: 1 request/second
- **Paid tier**: Higher limits available

Consider:
- Running your own API node for production
- Implementing request queuing
- Caching recent transactions

## Testing

### Testnet Testing

1. Get testnet TON from [faucet](https://t.me/testgiver_ton_bot)
2. Set `IS_MAINNET = false`
3. Use testnet wallet address
4. Send test transactions with unique UUIDs

### Test Cases

- ✅ Valid deposit with correct UUID
- ✅ Transaction without comment
- ✅ Transaction with bounced message (outgoing messages present)
- ✅ Duplicate transaction (same hash)
- ✅ Amount mismatch
- ✅ Unknown UUID

## Troubleshooting

### No transactions detected

- Check wallet address is correct
- Verify API key is valid
- Ensure `startTime` is not too far in the past
- Check network setting (mainnet vs testnet)

### Transactions missing comments

Users must send with text comment. Verify:
- Wallet app supports text comments
- Deeplink includes `text=<uuid>` parameter

### API errors

- Check API key validity
- Verify rate limits not exceeded
- Test API endpoint manually
- Consider implementing retry logic

## Advanced Topics

### Custom API Endpoint

Run your own API node:

```typescript
const client = new TonClient({
  endpoint: 'http://your-api-node:8081/jsonRPC',
});
```

### Handling Multiple Wallets

Create separate subscriptions for each wallet:

```typescript
const wallets = ['address1', 'address2', 'address3'];
const subscriptions = wallets.map(addr => 
  new AccountSubscription(client, addr, startTime, onTransaction)
);
```

### Database Schema Example

```sql
CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  uuid VARCHAR(255) UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  expected_amount BIGINT NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  transaction_hash VARCHAR(255),
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_uuid ON payments(uuid);
CREATE INDEX idx_tx_hash ON payments(transaction_hash);
```

## Resources

- [TON Documentation](https://docs.ton.org)
- [@ton/ton on npm](https://www.npmjs.com/package/@ton/ton)
- [@ton/core on npm](https://www.npmjs.com/package/@ton/core)
- [TonCenter API](https://toncenter.com/api/v2/)
- [TON HTTP API](https://github.com/toncenter/ton-http-api)

## License

MIT
