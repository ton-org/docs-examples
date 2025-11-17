/**
 * Multi-wallet deposits with unique addresses per user
 *
 * This example demonstrates how to accept Toncoin deposits where each user has their own deposit wallet.
 * All deposits are automatically forwarded to a single HOT wallet.
 *
 * Flow:
 * 1. Generate a HOT wallet once (master wallet that receives all deposits)
 * 2. For each user, generate a unique deposit wallet and store keys in your database
 * 3. User sends Toncoin to their deposit wallet address
 * 4. The backend monitors all blockchain blocks for transactions
 * 5. When a deposit is detected on a user's wallet:
 *    - Verify the transaction
 *    - Forward all balance to HOT wallet
 *    - Destroy the deposit wallet to avoid storage fees
 *    - Credit the user's account
 *
 * Advantages of this approach:
 * - No need for text comments/memos
 * - Each user has a permanent, unique deposit address
 * - Easier to track deposits per user
 *
 * Note: Deposit wallets are destroyed after each transfer to avoid storage fees.
 * They can be redeployed automatically on the next deposit.
 */

import { TonClient, WalletContractV5R1, Transaction } from '@ton/ton';
import { Address, internal, fromNano, SendMode } from '@ton/core';
import { mnemonicNew, mnemonicToPrivateKey } from '@ton/crypto';
import { createBlockSubscription } from '../subscription/block-subscription';
import { loadConfig } from '../utils/config';

/**
 * Represents a user's deposit wallet
 * In production, store this data in a real database (PostgreSQL, MongoDB, etc.)
 */
interface DepositWallet {
    readonly userId: number;
    readonly address: string;
    readonly publicKey: Buffer;
    readonly secretKey: Buffer; // Store securely in production (HSM, KMS, etc.)
}

/**
 * In-memory storage for deposit wallets
 * Maps wallet address (non-bounceable string) -> DepositWallet
 * In production, replace this with actual database queries
 */
type WalletAddressToDepositWallet = ReadonlyMap<string, DepositWallet>;

/**
 * Creates a new deposit wallet for a user
 * @param userId - Unique user identifier
 * @param networkGlobalId - Network ID (-3 for testnet, -239 for mainnet)
 * @returns DepositWallet record to persist in your database
 */
async function createDepositWallet(userId: number, networkGlobalId: number): Promise<DepositWallet> {
    // Generate new key pair
    const mnemonic = await mnemonicNew();
    const keyPair = await mnemonicToPrivateKey(mnemonic);

    // Create wallet contract V5R1
    const wallet = WalletContractV5R1.create({
        walletId: {
            networkGlobalId,
        },
        publicKey: keyPair.publicKey,
        workchain: 0,
    });
    const address = wallet.address.toString({ bounceable: false });

    const depositWallet: DepositWallet = {
        userId,
        address,
        publicKey: keyPair.publicKey,
        secretKey: keyPair.secretKey,
    };

    console.log(`[DB] Created deposit wallet for user ${userId}: ${address}`);
    return depositWallet;
}

/**
 * Looks up a deposit wallet by its address
 * @param walletMap - Map of wallet addresses to deposit wallet records
 * @param address - Wallet address to look up
 * @returns DepositWallet or undefined if not found
 */
function getDepositWallet(walletMap: WalletAddressToDepositWallet, address: string): DepositWallet | undefined {
    try {
        const addr = Address.parse(address);
        const normalized = addr.toString({ bounceable: false });
        return walletMap.get(normalized);
    } catch {
        return undefined;
    }
}

interface DepositInfo {
    readonly amount: bigint;
    readonly depositAddress: string;
    readonly sender: string;
    readonly txHash: string;
    readonly txLt: string;
    readonly timestamp: Date;
    readonly block: { readonly workchain: number; readonly shard: string; readonly seqno: number };
}

/**
 * Extracts deposit information from a transaction
 */
function extractDepositInfo(
    tx: Transaction,
    block: { workchain: number; shard: string; seqno: number },
): DepositInfo | null {
    const inMessage = tx.inMessage;
    if (!inMessage || inMessage.info.type !== 'internal' || !inMessage.info.src) {
        return null;
    }

    return {
        amount: inMessage.info.value.coins,
        depositAddress: inMessage.info.dest.toString({ bounceable: false }),
        sender: inMessage.info.src.toString({ bounceable: false }),
        txHash: tx.hash().toString('base64'),
        txLt: tx.lt.toString(),
        timestamp: new Date(tx.now * 1000),
        block,
    };
}

/**
 * Forwards all balance from deposit wallet to HOT wallet
 */
async function forwardToHotWallet(
    client: TonClient,
    depositWallet: DepositWallet,
    hotWalletAddress: string,
    networkGlobalId: number,
): Promise<bigint> {
    const wallet = WalletContractV5R1.create({
        walletId: {
            networkGlobalId,
        },
        publicKey: depositWallet.publicKey,
        workchain: 0,
    });

    const contract = client.open(wallet);
    const balance = await contract.getBalance();

    if (balance === 0n) {
        console.log(`Deposit wallet ${depositWallet.address} has zero balance, skipping`);
        return 0n;
    }

    console.log(`Forwarding ${fromNano(balance)} TON to HOT wallet...`);

    const seqno = await contract.getSeqno();

    // SendMode.CARRY_ALL_REMAINING_BALANCE (128) + SendMode.DESTROY_ACCOUNT_IF_ZERO (32)
    // forwards the full balance and removes the wallet to avoid future storage fees
    await contract.sendTransfer({
        seqno,
        secretKey: depositWallet.secretKey,
        messages: [
            internal({
                to: hotWalletAddress,
                value: 0n, // Will be replaced by CARRY_ALL_REMAINING_BALANCE
                bounce: false,
            }),
        ],
        sendMode: SendMode.CARRY_ALL_REMAINING_BALANCE + SendMode.DESTROY_ACCOUNT_IF_ZERO,
    });

    // In production: monitor this transfer and retry/validate if it fails
    console.log(`✓ Transfer sent from ${depositWallet.address} to HOT wallet`);
    console.log(`  User: ${depositWallet.userId}`);
    console.log(`  Amount: ${fromNano(balance)} TON`);

    return balance;
}

/**
 * Processes a deposit transaction
 */
async function processDeposit(
    client: TonClient,
    tx: Transaction,
    depositWallet: DepositWallet,
    block: { workchain: number; shard: string; seqno: number },
    hotWalletAddress: string,
    networkGlobalId: number,
): Promise<void> {
    // Skip outgoing transactions (bounced messages)
    if (tx.outMessages.size > 0) {
        return;
    }

    const depositInfo = extractDepositInfo(tx, block);
    if (!depositInfo) {
        return;
    }

    console.log('\n=== Deposit Detected ===');
    console.log(`Block: ${depositInfo.block.workchain}:${depositInfo.block.shard}:${depositInfo.block.seqno}`);
    console.log(`Deposit wallet: ${depositInfo.depositAddress}`);
    console.log(`User: ${depositWallet.userId}`);
    console.log(`Amount: ${fromNano(depositInfo.amount)} TON`);
    console.log(`Sender: ${depositInfo.sender}`);
    console.log(`Transaction hash: ${depositInfo.txHash}`);
    console.log(`Transaction LT: ${depositInfo.txLt}`);
    console.log(`Timestamp: ${depositInfo.timestamp.toISOString()}`);
    console.log('======================\n');

    try {
        await forwardToHotWallet(client, depositWallet, hotWalletAddress, networkGlobalId);

        // In production:
        // 1. Mark transaction as processed in your database
        // 2. Credit user's account
        // 3. Send notification to user
        console.log(`✅ Deposit processed successfully for user ${depositWallet.userId}\n`);
    } catch (error) {
        console.error('Error forwarding to HOT wallet:', error);
        // In production: implement retry logic with exponential backoff
    }
}

/**
 * Main function
 */
async function main(): Promise<void> {
    const config = loadConfig();
    const hotWalletAddress = config.walletAddress;
    const networkGlobalId = config.isTestnet ? -3 : -239;

    console.log('=== Toncoin Multi-Wallet Deposits Demo ===\n');
    console.log(`Network: ${config.isTestnet ? 'TESTNET' : 'MAINNET'}`);
    console.log(`HOT Wallet: ${hotWalletAddress}\n`);

    const client = new TonClient({
        endpoint: config.apiUrl,
        apiKey: config.apiKey,
    });

    // Create example deposit wallets
    // In production, create these when users requests deposit address
    console.log('Creating example deposit wallets...\n');
    const wallet1 = await createDepositWallet(101, networkGlobalId);
    const wallet2 = await createDepositWallet(102, networkGlobalId);
    const wallet3 = await createDepositWallet(103, networkGlobalId);

    // Build in-memory map (in production, query from database)
    const walletMap: WalletAddressToDepositWallet = new Map([
        [wallet1.address, wallet1],
        [wallet2.address, wallet2],
        [wallet3.address, wallet3],
    ]);

    console.log('\n=== Deposit Wallets ===');
    for (const wallet of walletMap.values()) {
        console.log(`User ${wallet.userId}: ${wallet.address}`);
    }
    console.log('=======================\n');

    console.log('Users can now send Toncoin to their deposit addresses.');
    console.log('Funds will be automatically forwarded to the HOT wallet.\n');

    // Get starting block
    const masterchainInfo = await client.getMasterchainInfo();
    const startBlock = masterchainInfo.latestSeqno;
    console.log(`Starting from masterchain block ${startBlock}\n`);

    // Transaction handler
    const handleTransaction = async (
        tx: Transaction,
        block: { workchain: number; shard: string; seqno: number },
    ): Promise<void> => {
        const inMessage = tx.inMessage;
        if (!inMessage || inMessage.info.type !== 'internal') {
            return;
        }

        const destination = inMessage.info.dest.toString({ bounceable: false });
        const depositWallet = getDepositWallet(walletMap, destination);

        if (!depositWallet) {
            return;
        }

        await processDeposit(client, tx, depositWallet, block, hotWalletAddress, networkGlobalId);
    };

    // Start block subscription
    const blockSub = createBlockSubscription(client, startBlock, handleTransaction);
    const unsubscribe = await blockSub.start(1000);

    console.log('Monitoring blockchain for deposits...');
    console.log('Press Ctrl+C to stop\n');

    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n\nShutting down...');
        unsubscribe();
        console.log(`Last processed block: ${blockSub.getLastProcessedBlock()}`);
        console.log('Persist this block number to resume safely after restart.');
        console.log('Goodbye!');
    });
}

// Run the application
if (require.main === module) {
    main().catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}
