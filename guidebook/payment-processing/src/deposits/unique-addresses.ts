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

import { TonClient, WalletContractV5R1 } from '@ton/ton';
import { Address, internal, fromNano, toNano } from '@ton/core';
import { mnemonicNew, mnemonicToPrivateKey, KeyPair } from '@ton/crypto';
import { BlockSubscription } from '../subscription/BlockSubscription';

// Configuration
const IS_TESTNET = true;
const API_KEY = 'YOUR_API_KEY_HERE';

const NODE_API_URL = IS_TESTNET
    ? 'https://testnet.toncenter.com/api/v2/jsonRPC'
    : 'https://toncenter.com/api/v2/jsonRPC';

const INDEX_API_URL = IS_TESTNET ? 'https://testnet.toncenter.com/api/index/' : 'https://toncenter.com/api/index/';

// Your master HOT wallet address that receives all deposits
const HOT_WALLET_ADDRESS = 'UQB7AhB4fP7SWtnfnIMcVUkwIgVLKqijlcpjNEPUVontys5I';

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
            secretKey: keyPair.secretKey,
        };

        this.wallets.set(address, depositWallet);

        console.log(`[DB] Created deposit wallet for user ${userId}: ${address}`);
        return depositWallet;
    }

    /**
     * Checks if an address is a known deposit wallet
     */
    isDepositAddress(address: string): boolean {
        // Normalize address to non-bounceable format
        try {
            const addr = Address.parse(address);
            const normalized = addr.toString({ bounceable: false });
            return this.wallets.has(normalized);
        } catch {
            return false;
        }
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
async function forwardToHotWallet(client: TonClient, depositWallet: DepositWallet, comment?: string): Promise<void> {
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
                value: toNano('0'), // Will be replaced by mode 128
                body: comment || '',
                bounce: false,
            }),
        ],
        sendMode: 128 + 32, // Send all balance + destroy contract
    });

    console.log(`✓ Transfer sent from ${depositWallet.address} to HOT wallet`);
    console.log(`  User: ${depositWallet.userId}`);
    console.log(`  Amount: ${fromNano(balance)} TON`);
}

/**
 * Processes a deposit transaction
 */
async function processDeposit(client: TonClient, tx: any): Promise<void> {
    const address = tx.account;

    // Check if this is one of our deposit wallets
    if (!db.isDepositAddress(address)) {
        return;
    }

    console.log('\n=== Deposit Detected ===');
    console.log(`Address: ${address}`);
    console.log(`Transaction: ${tx.hash}`);

    // Verify transaction with direct node request
    // This is important for security - always double-check with your own node
    const addr = Address.parse(address);
    const transactions = await client.getTransactions(addr, {
        limit: 1,
        lt: tx.lt,
        hash: tx.hash,
    });

    if (transactions.length === 0) {
        console.error('⚠️  Transaction not found in node - possible security issue!');
        return;
    }

    const txFromNode = transactions[0];

    // Verify it's an incoming transaction with no outgoing messages (no bounce)
    if (!txFromNode.inMessage) {
        console.log('No incoming message, skipping');
        return;
    }

    if (txFromNode.outMessages.size > 0) {
        console.log('Has outgoing messages (bounced), skipping');
        return;
    }

    // Get deposit wallet info
    const depositWallet = db.getDepositWallet(address);
    if (!depositWallet) {
        console.error('Deposit wallet not found in database');
        return;
    }

    // Extract deposit amount
    const info = txFromNode.inMessage.info;
    if (info.type !== 'internal') return;

    const amount = info.value.coins;
    console.log(`Amount: ${fromNano(amount)} TON`);
    console.log(`User: ${depositWallet.userId}`);
    console.log('======================\n');

    // Forward to HOT wallet
    try {
        await forwardToHotWallet(client, depositWallet, `User ${depositWallet.userId} deposit`);

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
 * Transaction handler
 */
async function onTransaction(client: TonClient, tx: any): Promise<void> {
    // Check for outgoing messages (skip bounced transactions)
    if (tx.out_msgs && tx.out_msgs.length > 0) {
        return;
    }

    // Check if transaction is on one of our deposit addresses
    if (db.isDepositAddress(tx.account)) {
        await processDeposit(client, tx);
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

    // Start block subscription
    const subscription = new BlockSubscription(
        client,
        startBlock,
        (tx) => onTransaction(client, tx),
        INDEX_API_URL,
        API_KEY,
    );

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
