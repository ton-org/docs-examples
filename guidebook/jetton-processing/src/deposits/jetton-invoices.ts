/**
 * Single-wallet jetton deposits with invoice tracking
 *
 * Monitors a single wallet for incoming jetton transfer notifications
 * and processes each deposit along with the optional text comment (UUID).
 * This mirrors the Toncoin invoices example but for jetton tokens.
 */

import { Address, Cell } from '@ton/core';
import { createAccountSubscription } from '../subscription/account-subscription';
import { JettonMaster, TonClient, Transaction } from '@ton/ton';
import { loadConfig } from '../utils/config';

// Jetton transfer notification opcode as per TEP-74
const TRANSFER_NOTIFICATION_OPCODE = 0x7362d09c;
// Text comment opcode
const COMMENT_OPCODE = 0;

const LAST_PROCESSED_LT: string | undefined = undefined;
const LAST_PROCESSED_HASH: string | undefined = undefined;

/**
 * Configuration for a supported jetton
 */
interface JettonConfig {
    /** Human-readable token symbol (e.g., "USDT") */
    readonly symbol: string;
    /** Address of the jetton minter contract */
    readonly minterAddress: string;
    /** Number of decimal places for display (e.g., 6 for USDT) */
    readonly decimals: number;
    /** Minimum deposit amount in base units */
    readonly minDeposit: bigint;
}

/**
 * List of jettons this service accepts
 * In production, load this from database or configuration file
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
 * Maps a jetton wallet address to its configuration
 */
interface JettonWalletInfo {
    readonly config: JettonConfig;
    readonly jettonWalletAddress: Address;
}

/**
 * Parsed jetton transfer notification
 */
interface TransferNotification {
    readonly queryId: bigint;
    readonly amount: bigint;
    readonly sender: Address;
    readonly comment: string | undefined;
}

/**
 * Information about a jetton deposit
 */
interface JettonDepositInfo {
    readonly jettonSymbol: string;
    readonly amount: bigint;
    readonly jettonWalletAddress: string;
    readonly senderAddress: string;
    readonly comment: string;
    readonly queryId: string;
    readonly txHash: string;
    readonly txLt: string;
    readonly timestamp: Date;
}

/**
 * Decodes a jetton transfer notification message body
 * Per TEP-74: https://github.com/ton-blockchain/TEPs/blob/master/text/0074-jettons-standard.md
 *
 * @param body - Message body cell
 * @returns Parsed notification or null if invalid
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
        const payloadInRef = slice.loadBit();
        const payloadSlice = payloadInRef ? slice.loadRef().beginParse() : slice;

        let comment: string | undefined;
        try {
            const payloadOpcode = payloadSlice.loadUint(32);
            if (payloadOpcode === COMMENT_OPCODE) {
                comment = payloadSlice.loadStringTail();
            }
        } catch (error) {
            // Comment parsing failed - not critical, deposit is still valid
            if (error instanceof Error && !error.message.includes('slice')) {
                console.warn('Unexpected error parsing comment:', error);
            }
        }

        return {
            queryId,
            amount,
            sender,
            comment,
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
 * Extracts jetton deposit information from a transaction
 */
function extractJettonDeposit(
    tx: Transaction,
    jettonWalletMap: ReadonlyMap<string, JettonWalletInfo>,
): JettonDepositInfo | null {
    const inMessage = tx.inMessage;
    if (!inMessage || inMessage.info.type !== 'internal' || !inMessage.info.src || !inMessage.body) {
        return null;
    }

    const source = inMessage.info.src;
    const jettonWalletInfo = jettonWalletMap.get(source.toRawString());

    if (!jettonWalletInfo) {
        return null;
    }

    const notification = decodeTransferNotification(inMessage.body);
    if (!notification) {
        return null;
    }

    if (notification.amount < jettonWalletInfo.config.minDeposit) {
        console.log(`Deposit below minimum threshold for ${jettonWalletInfo.config.symbol}, ignoring`);
        return null;
    }

    return {
        jettonSymbol: jettonWalletInfo.config.symbol,
        amount: notification.amount,
        jettonWalletAddress: source.toRawString(),
        senderAddress: notification.sender.toRawString(),
        comment: notification.comment ?? 'no comment',
        queryId: notification.queryId.toString(),
        txHash: tx.hash().toString('base64'),
        txLt: tx.lt.toString(),
        timestamp: new Date(tx.now * 1000),
    };
}

/**
 * Transaction handler - processes each transaction
 */
async function onTransaction(tx: Transaction, jettonWalletMap: ReadonlyMap<string, JettonWalletInfo>): Promise<void> {
    const depositInfo = extractJettonDeposit(tx, jettonWalletMap);

    if (!depositInfo) {
        return;
    }

    console.log('\n=== Jetton Deposit Detected ===');
    console.log(`Jetton: ${depositInfo.jettonSymbol}`);
    console.log(`Amount: ${depositInfo.amount.toString()}`);
    console.log(`Jetton wallet: ${depositInfo.jettonWalletAddress}`);
    console.log(`Sender: ${depositInfo.senderAddress}`);
    console.log(`Comment/UUID: ${depositInfo.comment}`);
    console.log(`Query ID: ${depositInfo.queryId}`);
    console.log(`Transaction hash: ${depositInfo.txHash}`);
    console.log(`Transaction LT: ${depositInfo.txLt}`);
    console.log(`Timestamp: ${depositInfo.timestamp.toISOString()}`);
    console.log('===============================\n');

    // In production:
    // 1. Find the payment in your database by the UUID (comment)
    // 2. Verify that the payment hasn't been processed yet
    // 3. Check that the amount matches what was expected
    // 4. Mark the payment as processed in your database
    // 5. Credit the user's account
    //
    // Example with database:
    // const payment = await db.findPaymentByUUID(depositInfo.comment);
    // if (!payment) {
    //     console.log('Unknown payment UUID');
    //     return;
    // }
    // if (payment.processed) {
    //     console.log('Payment already processed');
    //     return;
    // }
    // if (payment.expectedAmount !== depositInfo.amount) {
    //     console.log('Amount mismatch');
    //     return;
    // }
    // await db.markPaymentAsProcessed(payment.id, depositInfo.txHash);
    // await db.creditUserAccount(payment.userId, depositInfo.amount);
}

/**
 * Resolves jetton wallet addresses for the owner
 * Maps jettonWalletAddress -> JettonWalletInfo
 */
async function resolveJettonWallets(
    client: TonClient,
    ownerAddress: Address,
): Promise<ReadonlyMap<string, JettonWalletInfo>> {
    const result = new Map<string, JettonWalletInfo>();

    for (const config of SUPPORTED_JETTONS) {
        const master = JettonMaster.create(Address.parse(config.minterAddress));
        const openedMaster = client.open(master);
        const jettonWalletAddress = await openedMaster.getWalletAddress(ownerAddress);

        result.set(jettonWalletAddress.toRawString(), {
            config,
            jettonWalletAddress,
        });
    }

    return result;
}

/**
 * Main function
 */
async function main(): Promise<void> {
    const config = loadConfig();

    console.log('=== Jetton Invoices Demo ===\n');
    console.log(`Network: ${config.isTestnet ? 'TESTNET' : 'MAINNET'}`);
    console.log(`Wallet: ${config.walletAddress}\n`);

    const client = new TonClient({
        endpoint: config.apiUrl,
        apiKey: config.apiKey,
    });

    const ownerAddress = Address.parse(config.walletAddress);
    // This is called only once
    const jettonWalletMap = await resolveJettonWallets(client, ownerAddress);

    console.log('Watching jetton wallets:');
    for (const info of jettonWalletMap.values()) {
        console.log(`  ${info.config.symbol}: ${info.jettonWalletAddress.toRawString()}`);
    }
    console.log('');

    const accountSub = createAccountSubscription(
        client,
        config.walletAddress,
        async (tx) => onTransaction(tx, jettonWalletMap),
        {
            limit: 10,
            lastLt: LAST_PROCESSED_LT,
            lastHash: LAST_PROCESSED_HASH,
        },
    );

    const unsubscribe = await accountSub.start(10_000);

    console.log('Monitoring jetton deposits... Press Ctrl+C to stop.');

    process.on('SIGINT', () => {
        console.log('\nStopping jetton deposit monitoring...');
        const cursor = accountSub.getLastProcessed();
        console.log('Last processed cursor:', cursor);
        console.log('Persist this cursor to your database for safe resumption.');
        unsubscribe();
    });
}

if (require.main === module) {
    main().catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}
