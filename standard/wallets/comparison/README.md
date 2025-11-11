# Wallet Fee Comparison

This workspace provides a reproducible test harness for benchmarking transaction fees across several TON wallet implementations. The suite focuses on measuring gas usage, total fees, and per-message costs for different payload sizes and batch configurations.

## Layout
- `tests/WalletFeeComparison.spec.ts` — main Jest suite that orchestrates the fee measurements and outputs markdown reports.
- `tests/utils` — helper utilities for fee extraction and TON gas calculations.
- `wrappers/` — contract wrappers required to deploy and interact with wallets inside the sandbox.
- `build/` — precompiled wallet artifacts referenced by the wrappers.

## Getting Started
1. Install dependencies: `yarn install`
2. Run the benchmark suite: `yarn test`

The tests spawn sandbox blockchains locally, so no external network access is required. Results are written to `tests/results/wallet-fee-comparison.md`.
