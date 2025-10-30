# Example

This repository contains examples of different smart contract upgrade patterns for TON blockchain documentation.

## Project structure

-   `contracts` - source code of all the smart contracts of the project and their dependencies.
-   `wrappers` - wrapper classes (implementing `Contract` from ton-core) for the contracts, including any [de]serialization primitives and compilation functions.
-   `tests` - tests for the contracts.
-   `scripts` - scripts used by the project, mainly the deployment scripts.

## Upgrade Examples

This project demonstrates several smart contract upgrade patterns:

### 1. Delayed Upgrade (`delayedUpgrade.tolk`)

A time-locked upgrade mechanism that provides a safety buffer before applying changes:

-   **Request Phase**: Admin submits an upgrade request with new code and/or data
-   **Timeout Period**: Mandatory waiting period (configurable, e.g., 30 days) before approval
-   **Approval/Rejection**: After timeout expires, admin can approve the upgrade or reject it at any time
-   **Security**: Prevents immediate upgrades, giving time to detect malicious changes

**Key Features:**
-   Three-message workflow: `RequestUpgrade`, `RejectUpgrade`, `ApproveUpgrade`
-   Only one pending upgrade request at a time
-   Admin-only operations with address verification
-   Uses `setCodePostponed()` to apply new code

### 2. Hot Upgrade (`hotUpgrade/main.tolk` → `hotUpgrade/new.tolk`)

An immediate upgrade mechanism with data migration capabilities:

-   **Instant Update**: Code changes apply in the same transaction
-   **Data Migration**: Special `hotUpgradeData()` function handles storage format changes
-   **Seamless Transition**: Contract remains operational during upgrade

**Key Features:**
-   Single message `HotUpgrade` with code and optional migration data
-   TVM register manipulation using `setTvmRegisterC3()` for immediate code execution
-   Example demonstrates adding new field (`metadata`) to storage structure and can modify the data structure 
-   Uses `oldStorage` struct pattern to migrate from old to new data format

**Example Flow:**
```
Old Storage: { adminAddress, counter }
    ↓ (HotUpgrade message)
New Storage: { counter, adminAddress, metadata }
```

## How to use

### Build

`npx blueprint build` or `yarn blueprint build`

### Test

`npx blueprint test` or `yarn blueprint test`

### Deploy or run another script

`npx blueprint run` or `yarn blueprint run`

### Add a new contract

`npx blueprint create ContractName` or `yarn blueprint create ContractName`
