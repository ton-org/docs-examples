/**
 * Multi-Wallet Deposits Example
 *
 * This example demonstrates how to accept TON coin deposits where each user has their own deposit wallet.
 * All deposits are automatically forwarded to a single HOT wallet.
 *
 * Flow:
 * 1. Generate a HOT wallet once (master wallet that receives all deposits)
 * 2. For each user, generate a unique deposit wallet and store keys in your database
 * 3. User sends TON to their deposit wallet address
 * 4. Your backend monitors all blockchain blocks for transactions
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
import { Address, internal, fromNano, toNano, SendMode } from '@ton/core';
import { mnemonicNew, mnemonicToPrivateKey } from '@ton/crypto';
import { BlockSubscription } from '../subscription/BlockSubscription';

// Configuration
const IS_TESTNET = true;
const API_KEY = 'YOUR_API_KEY_HERE';

const NODE_API_URL = IS_TESTNET
    ? 'https://testnet.toncenter.com/api/v2/jsonRPC'
    : 'https://toncenter.com/api/v2/jsonRPC';

// Your master HOT wallet address that receives all deposits
const HOT_WALLET_ADDRESS = 'UQB...5I';

// Network global ID for Wallet V5
// -239 for mainnet, -3 for testnet
// This is required for WalletContractV5R1 to identify the network
const NETWORK_GLOBAL_ID = IS_TESTNET ? -3 : -239;

/**
 * Mock database for deposit wallets
 * In production, use a real database (PostgreSQL, MongoDB, etc.)
 */
interface DepositWallet {
    userId: number;
    address: string;
    publicKey: Buffer;
    secretKey: Buffer;
}

class DepositWalletsDB {
    private wallets: Map<string, DepositWallet> = new Map();

    /**
     * Creates a new deposit wallet for a user
     */
    async createDepositWallet(userId: number): Promise<DepositWallet> {
        // Generate new key pair
        const mnemonic = await mnemonicNew();
        const keyPair = await mnemonicToPrivateKey(mnemonic);

        // Create wallet contract V5R1
        const wallet = WalletContractV5R1.create({
            walletId: {
                networkGlobalId: NETWORK_GLOBAL_ID,
            },
            publicKey: keyPair.publicKey,
            workchain: 0,
        });
        const address = wallet.address.toString({ bounceable: false });

        const depositWallet: DepositWallet = {
            userId,
            address,
            publicKey: keyPair.publicKey,
            // use separate storage for private keys in production
            secretKey: keyPair.secretKey,
        };

        // persist to real database in production
        this.wallets.set(address, depositWallet);

        console.log(`[DB] Created deposit wallet for user ${userId}: ${address}`);
        return depositWallet;
    }

    /**
     * Gets deposit wallet info by address
     */
    getDepositWallet(address: string): DepositWallet | undefined {
        try {
            const addr = Address.parse(address);
            const normalized = addr.toString({ bounceable: false });
            return this.wallets.get(normalized);
        } catch {
            return undefined;
        }
    }

    /**
     * Gets all deposit wallets
     */
    getAllWallets(): DepositWallet[] {
        return Array.from(this.wallets.values());
    }
}

const db = new DepositWalletsDB();

/**
 * Forwards all balance from deposit wallet to HOT wallet
 */
async function forwardToHotWallet(client: TonClient, depositWallet: DepositWallet): Promise<void> {
    const wallet = WalletContractV5R1.create({
        walletId: {
            networkGlobalId: NETWORK_GLOBAL_ID,
        },
        publicKey: depositWallet.publicKey,
        workchain: 0,
    });

    // Open wallet for operations
    const contract = client.open(wallet);

    // Get current balance
    const balance = await contract.getBalance();

    if (balance === 0n) {
        console.log(`Deposit wallet ${depositWallet.address} has zero balance, skipping`);
        return;
    }

    console.log(`Forwarding ${fromNano(balance)} TON to HOT wallet...`);

    // Get seqno
    const seqno = await contract.getSeqno();

    // Create transfer
    // Mode 128 + 32: send all remaining balance and destroy the contract
    // This avoids storage fees for empty wallets
    await contract.sendTransfer({
        seqno,
        secretKey: depositWallet.secretKey,
        messages: [
            internal({
                to: HOT_WALLET_ADDRESS,
                value: 0n, // Will be replaced by mode 128
                bounce: false,
            }),
        ],
        // Send all balance + destroy contract
        sendMode: SendMode.CARRY_ALL_REMAINING_BALANCE + SendMode.DESTROY_ACCOUNT_IF_ZERO,
    });

    // In production we need to monitor this transfer and retry it/mark for validation
    // if it fails

    console.log(`✓ Transfer sent from ${depositWallet.address} to HOT wallet`);
    console.log(`  User: ${depositWallet.userId}`);
    console.log(`  Amount: ${fromNano(balance)} TON`);
}

/**
 * Processes a deposit transaction
 */
async function processDeposit(
    client: TonClient,
    tx: Transaction,
    depositWallet: DepositWallet,
    block: { workchain: number; shard: string; seqno: number },
): Promise<void> {
    // Check if this is an incoming transaction with a source address
    if (!tx.inMessage?.info.src) {
        return;
    }

    const inMessage = tx.inMessage;
    if (!inMessage || inMessage.info.type !== 'internal') {
        return;
    }

    const amount = inMessage.info.value.coins;
    const depositAddress = inMessage.info.dest.toString({ bounceable: false });
    const sender = inMessage.info.src?.toString({ bounceable: false }) ?? 'unknown';
    const txHash = tx.hash().toString('base64');
    const txLt = tx.lt.toString();

    console.log('\n=== Deposit Detected ===');
    console.log(`Block: ${block.workchain}:${block.shard}:${block.seqno}`);
    console.log(`Deposit wallet: ${depositAddress}`);
    console.log(`User: ${depositWallet.userId}`);
    console.log(`Amount: ${fromNano(amount)} TON`);
    console.log(`Sender: ${sender}`);
    console.log(`Transaction hash: ${txHash}`);
    console.log(`Transaction LT: ${txLt}`);
    console.log(`Timestamp: ${new Date(tx.now * 1000).toISOString()}`);
    console.log('======================\n');

    try {
        await forwardToHotWallet(client, depositWallet);

        // In production:
        // 1. Mark transaction as processed in your database
        // 2. Credit user's account
        // 3. Send notification to user

        console.log(`✅ Deposit processed successfully for user ${depositWallet.userId}\n`);
    } catch (error) {
        console.error('Error forwarding to HOT wallet:', error);
        // In production: retry logic should be implemented
    }
}

/**
 * Main function
 */
async function main(): Promise<void> {
    console.log('=== TON Multi-Wallet Deposits Demo ===\n');
    console.log(`Network: ${IS_TESTNET ? 'TESTNET' : 'MAINNET'}`);
    console.log(`HOT Wallet: ${HOT_WALLET_ADDRESS}\n`);

    // Initialize TON client
    const client = new TonClient({
        endpoint: NODE_API_URL,
        apiKey: API_KEY,
    });

    // Create some example deposit wallets
    console.log('Creating example deposit wallets...\n');
    await db.createDepositWallet(101);
    await db.createDepositWallet(102);
    await db.createDepositWallet(103);

    console.log('\n=== Deposit Wallets ===');
    const wallets = db.getAllWallets();
    wallets.forEach((w) => {
        console.log(`User ${w.userId}: ${w.address}`);
    });
    console.log('=======================\n');

    console.log('Users can now send TON to their deposit addresses.');
    console.log('Funds will be automatically forwarded to the HOT wallet.\n');

    // Get starting block
    const masterchainInfo = await client.getMasterchainInfo();
    const startBlock = masterchainInfo.latestSeqno;

    console.log(`Starting from masterchain block ${startBlock}\n`);

    // Process inbound transactions for deposit wallets only
    const handleTransaction: ConstructorParameters<typeof BlockSubscription>[2] = async (tx, block) => {
        if (tx.outMessages.size > 0) {
            return;
        }

        const inMessage = tx.inMessage;
        if (!inMessage || inMessage.info.type !== 'internal') {
            return;
        }

        const destination = inMessage.info.dest.toString({ bounceable: false });
        const depositWallet = db.getDepositWallet(destination);

        if (!depositWallet) {
            return;
        }

        await processDeposit(client, tx, depositWallet, block);
    };

    // Start block subscription
    const subscription = new BlockSubscription(client, startBlock, handleTransaction);

    await subscription.start(1000); // Check every second

    console.log('Monitoring blockchain for deposits...');
    console.log('Press Ctrl+C to stop\n');

    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n\nShutting down...');
        subscription.stop();

        console.log(`Last processed block: ${subscription.getLastProcessedBlock()}`);
        console.log('Goodbye!');

        process.exit(0);
    });
}

// Run the application
if (require.main === module) {
    main().catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

export { db, forwardToHotWallet, processDeposit };
