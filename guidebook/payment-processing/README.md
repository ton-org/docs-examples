# TON Payment Processing Examples

Modern TypeScript examples for processing TON blockchain payments using `@ton/ton` and `@ton/core` libraries.

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

## Resources

- [@ton/ton on npm](https://www.npmjs.com/package/@ton/ton)
- [@ton/core on npm](https://www.npmjs.com/package/@ton/core)
- [TonCenter API](https://toncenter.com/api/v2/)
- [TON HTTP API](https://github.com/toncenter/ton-http-api)
