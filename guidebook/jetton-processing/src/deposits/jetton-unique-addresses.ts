/**
 * Multi-wallet jetton deposits with unique addresses per user
 *
 * Each user gets their own TON wallet that holds Toncoin for fees and has associated jetton wallets for every
 * supported jetton type. When a jetton transfer arrives, the deposit is logged and can be credited to the user.
 *
 * Note: This example demonstrates deposit tracking only. In production, implement sweeping logic to move
 * jetton funds from user wallets to a cold storage wallet.
 */

import { Address, Cell } from '@ton/core';
import { JettonMaster, TonClient, Transaction, WalletContractV5R1, OpenedContract } from '@ton/ton';
import { mnemonicNew, mnemonicToPrivateKey } from '@ton/crypto';
import { createBlockSubscription } from '../subscription/block-subscription';
import { loadConfig } from '../utils/config';

// Jetton transfer notification opcode as per TEP-74
const TRANSFER_NOTIFICATION_OPCODE = 0x7362d09c;

/**
 * Configuration for a supported jetton
 */
interface JettonConfig {
    /** Human-readable token symbol for display */
    readonly symbol: string;
    /** Address of the jetton minter contract (unique identifier) */
    readonly minterAddress: string;
    /** Number of decimal places for display */
    readonly decimals: number;
    /** Minimum deposit amount in base units */
    readonly minDeposit: bigint;
}

/**
 * List of jettons this service accepts
 */
const SUPPORTED_JETTONS: readonly JettonConfig[] = [
    {
        symbol: 'TestJetton',
        minterAddress: 'EQB...28',
        decimals: 6,
        minDeposit: 1n,
    },
    {
        symbol: 'KOTE',
        minterAddress: 'EQB...NIj',
        decimals: 9,
        minDeposit: 1n,
    },
] as const;

/**
 * User's deposit wallet with associated jetton wallet addresses
 * In production, store this in a database
 */
interface DepositWallet {
    readonly userId: number;
    readonly tonWallet: WalletContractV5R1;
    readonly publicKey: Buffer;
    readonly secretKey: Buffer; // Store securely in production (HSM, KMS)
    /** Maps jetton minter address -> jetton wallet address */
    readonly jettonWallets: ReadonlyMap<string, Address>;
}

/**
 * Maps jetton wallet address -> metadata about that wallet
 */
interface JettonWalletMetadata {
    readonly minterAddress: string;
    readonly userId: number;
    readonly depositWallet: DepositWallet;
    readonly jettonWalletAddress: Address;
}

/**
 * Parsed jetton transfer notification
 */
interface TransferNotification {
    readonly queryId: bigint;
    readonly amount: bigint;
    readonly sender: Address;
}

/**
 * Information about a jetton deposit
 */
interface JettonDepositInfo {
    readonly jettonSymbol: string;
    readonly amount: bigint;
    readonly jettonWalletAddress: string;
    readonly userId: number;
    readonly senderAddress: string;
    readonly queryId: string;
    readonly txHash: string;
    readonly txLt: string;
    readonly blockInfo: string;
    readonly timestamp: Date;
}

/**
 * Creates a new deposit wallet for a user
 * In production, persist this to your database
 */
async function createDepositWallet(userId: number, networkGlobalId: number, client: TonClient): Promise<DepositWallet> {
    const mnemonic = await mnemonicNew();
    const keyPair = await mnemonicToPrivateKey(mnemonic);

    const tonWallet = WalletContractV5R1.create({
        walletId: {
            networkGlobalId,
        },
        publicKey: keyPair.publicKey,
        workchain: 0,
    });

    // Resolve jetton wallet addresses for all supported jettons
    const jettonWallets = new Map<string, Address>();

    for (const config of SUPPORTED_JETTONS) {
        const master = JettonMaster.create(Address.parse(config.minterAddress));
        const openedMaster = client.open(master);
        const jettonWalletAddress = await openedMaster.getWalletAddress(tonWallet.address);
        jettonWallets.set(config.minterAddress, jettonWalletAddress);
    }

    return {
        userId,
        tonWallet,
        publicKey: keyPair.publicKey,
        secretKey: keyPair.secretKey,
        jettonWallets,
    };
}

/**
 * Builds a reverse index from jetton wallet address to metadata
 */
function buildJettonWalletIndex(depositWallets: readonly DepositWallet[]): ReadonlyMap<string, JettonWalletMetadata> {
    const index = new Map<string, JettonWalletMetadata>();

    for (const depositWallet of depositWallets) {
        for (const [minterAddress, jettonWalletAddress] of depositWallet.jettonWallets.entries()) {
            index.set(jettonWalletAddress.toRawString(), {
                minterAddress,
                userId: depositWallet.userId,
                depositWallet,
                jettonWalletAddress,
            });
        }
    }

    return index;
}

/**
 * Decodes a jetton transfer notification message body
 * Per TEP-74: https://github.com/ton-blockchain/TEPs/blob/master/text/0074-jettons-standard.md
 */
function decodeTransferNotification(body: Cell): TransferNotification | null {
    try {
        const slice = body.beginParse();
        const opcode = slice.loadUint(32);

        if (opcode !== TRANSFER_NOTIFICATION_OPCODE) {
            return null;
        }

        const queryId = slice.loadUintBig(64);
        const amount = slice.loadCoins();
        const sender = slice.loadAddress();

        return {
            queryId,
            amount,
            sender,
        };
    } catch (error) {
        if (error instanceof Error && error.message.includes('slice')) {
            // Expected: malformed message
            return null;
        }
        // Unexpected error - log and rethrow
        console.error('Unexpected error decoding jetton transfer notification:', error);
        throw error;
    }
}

/**
 * Processes a jetton deposit transaction
 * @returns Deposit information or null if transaction should be skipped
 */
function processJettonDeposit(
    tx: Transaction,
    metadata: JettonWalletMetadata,
    config: JettonConfig,
    block: { workchain: number; shard: string; seqno: number },
): JettonDepositInfo | null {
    const inMessage = tx.inMessage;
    if (!inMessage || inMessage.info.type !== 'internal' || !inMessage.body) {
        return null;
    }

    const notification = decodeTransferNotification(inMessage.body);
    if (!notification) {
        return null;
    }

    if (notification.amount < config.minDeposit) {
        return null;
    }

    const jettonWalletAddress = inMessage.info.src.toRawString();
    const senderAddress = notification.sender.toRawString();

    return {
        jettonSymbol: config.symbol,
        amount: notification.amount,
        jettonWalletAddress,
        userId: metadata.userId,
        senderAddress,
        queryId: notification.queryId.toString(),
        txHash: tx.hash().toString('base64'),
        txLt: tx.lt.toString(),
        blockInfo: `${block.workchain}:${block.shard}:${block.seqno}`,
        timestamp: new Date(tx.now * 1000),
    };
}

/**
 * Main function
 */
async function main(): Promise<void> {
    const config = loadConfig();
    const networkGlobalId = config.isTestnet ? -3 : -239;

    console.log('=== Jetton Multi-Wallet Deposits Demo ===\n');
    console.log(`Network: ${config.isTestnet ? 'TESTNET' : 'MAINNET'}`);
    console.log(`HOT Wallet: ${config.walletAddress}\n`);

    const client = new TonClient({
        endpoint: config.apiUrl,
        apiKey: config.apiKey,
    });

    // Create example deposit wallets for 3 users
    // In production, create these when users register
    console.log('Creating example deposit wallets...\n');
    const wallet1 = await createDepositWallet(101, networkGlobalId, client);
    const wallet2 = await createDepositWallet(102, networkGlobalId, client);
    const wallet3 = await createDepositWallet(103, networkGlobalId, client);

    const depositWallets: readonly DepositWallet[] = [wallet1, wallet2, wallet3];

    // Display created wallets
    const configByMinter = new Map(SUPPORTED_JETTONS.map((c) => [c.minterAddress, c]));

    for (const wallet of depositWallets) {
        console.log(`User ${wallet.userId} TON wallet: ${wallet.tonWallet.address.toRawString()}`);
        for (const [minterAddress, address] of wallet.jettonWallets.entries()) {
            const config = configByMinter.get(minterAddress);
            const symbol = config ? config.symbol : minterAddress.slice(0, 10);
            console.log(`  ${symbol} jetton wallet: ${address.toRawString()}`);
        }
    }
    console.log('===================================\n');

    // Build reverse index for fast lookup
    const jettonWalletIndex = buildJettonWalletIndex(depositWallets);

    const masterchainInfo = await client.getMasterchainInfo();
    const startBlock = masterchainInfo.latestSeqno;
    console.log(`Starting from masterchain block ${startBlock}\n`);

    // Transaction handler
    const handleTransaction = async (
        tx: Transaction,
        block: { workchain: number; shard: string; seqno: number },
    ): Promise<void> => {
        // outMessages check (internal message filter)
        if (tx.outMessages.size > 0) {
            return;
        }

        const inMessage = tx.inMessage;
        // not internal message check
        if (!inMessage || inMessage.info.type !== 'internal') {
            return;
        }

        // Check if source is a known jetton wallet
        const metadata = jettonWalletIndex.get(inMessage.info.src.toRawString());
        if (!metadata) {
            return;
        }

        // Get jetton configuration
        const jettonConfig = configByMinter.get(metadata.minterAddress);
        if (!jettonConfig) {
            // This shouldn't happen if our index is built correctly
            console.error(`Config not found for minter: ${metadata.minterAddress}`);
            return;
        }

        const depositInfo = processJettonDeposit(tx, metadata, jettonConfig, block);
        if (!depositInfo) {
            return;
        }

        console.log('\n=== Jetton Deposit Detected ===');
        console.log(`Jetton: ${depositInfo.jettonSymbol}`);
        console.log(`Amount: ${depositInfo.amount.toString()}`);
        console.log(`Jetton wallet: ${depositInfo.jettonWalletAddress}`);
        console.log(`User ID: ${depositInfo.userId}`);
        console.log(`Sender: ${depositInfo.senderAddress}`);
        console.log(`Query ID: ${depositInfo.queryId}`);
        console.log(`Transaction hash: ${depositInfo.txHash}`);
        console.log(`Transaction LT: ${depositInfo.txLt}`);
        console.log(`Block: ${depositInfo.blockInfo}`);
        console.log(`Timestamp: ${depositInfo.timestamp.toISOString()}`);
        console.log('===============================\n');

        // In production:
        // 1. Mark transaction as processed in your database
        // 2. Credit user's account with the deposited amount
        // 3. Send notification to user
        // 4. Optionally sweep jettons to a cold wallet
    };

    const blockSub = createBlockSubscription(client, startBlock, handleTransaction);
    const unsubscribe = await blockSub.start(1000);

    console.log('Monitoring blockchain for jetton deposits...');
    console.log('Press Ctrl+C to stop\n');

    process.on('SIGINT', () => {
        console.log('\nShutting down...');
        unsubscribe();
        console.log(`Last processed block: ${blockSub.getLastProcessedBlock()}`);
        console.log('Persist this block number to resume safely after restart.');
        console.log('Goodbye!');
    });
}

if (require.main === module) {
    main().catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}
