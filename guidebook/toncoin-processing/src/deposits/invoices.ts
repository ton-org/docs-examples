/**
 * Single-wallet deposits with invoice tracking
 *
 * This example demonstrates how to accept Toncoin deposits to a single wallet
 * where each payment is identified by a unique text comment (UUID).
 *
 * Flow:
 * 1. Generate a wallet address once for your service
 * 2. On each payment request:
 *    a. Generate a unique UUID for the payment
 *    b. Store the payment record in your database with expected amount and UUID
 *    c. Provide the payment details to the user (wallet address, amount, UUID)
 * 3. The backend monitors all transactions to the wallet address
 * 4. On detecting an incoming transaction:
 *    a. Extract the UUID from the transaction comment
 *    b. Lookup the payment in the database
 *    c. Verify the payment hasn't been processed
 *    d. Verify the amount matches expectations
 *    e. Mark as processed and credit the user's account
 */

import { TonClient, Transaction } from '@ton/ton';
import { Cell, fromNano } from '@ton/core';
import { createAccountSubscription } from '../subscription/account-subscription';
import { loadConfig } from '../utils/config';

// Resume cursor - load last processed transaction LT + hash from your database
// If undefined, the subscriber will process recent transactions returned by the node
const LAST_PROCESSED_LT: string | undefined = undefined;
const LAST_PROCESSED_HASH: string | undefined = undefined;

interface DepositInfo {
    readonly amount: bigint;
    readonly senderAddress: string;
    readonly comment: string | undefined;
    readonly txHash: string;
    readonly txLt: string;
    readonly timestamp: Date;
}

/**
 * Parses message body to extract text comment if present
 * @param body - Message body cell
 * @returns Text comment or undefined if not present or parsing fails
 */
function parseComment(body: Cell): string | undefined {
    try {
        const slice = body.beginParse();
        const op = slice.loadUint(32);

        // op === 0 indicates UTF-8 text payload
        if (op === 0) {
            return slice.loadStringTail();
        }
    } catch (error) {
        if (error instanceof Error && error.message.includes('slice')) {
            // Expected: insufficient bits or malformed cell
            return undefined;
        }
        // Unexpected error - log and rethrow for debugging
        console.error('Unexpected error parsing comment:', error);
        throw error;
    }

    return undefined;
}

/**
 * Extracts deposit information from a transaction
 * @param tx - Transaction to process
 * @returns Deposit information or null if transaction should be skipped
 */
function extractDepositInfo(tx: Transaction): DepositInfo | null {
    // Check if this is an incoming transaction with a source address
    const inMessage = tx.inMessage;
    if (!inMessage || inMessage.info.type !== 'internal' || !inMessage.info.src) {
        return null;
    }

    // CRITICAL: Always verify there are no outgoing messages
    // This ensures the coins didn't bounce back due to an error
    if (tx.outMessages.size > 0) {
        return null;
    }

    const comment = inMessage.body ? parseComment(inMessage.body) : undefined;

    return {
        amount: inMessage.info.value.coins,
        senderAddress: inMessage.info.src.toString(),
        comment,
        txHash: tx.hash().toString('base64'),
        txLt: tx.lt.toString(),
        timestamp: new Date(tx.now * 1000),
    };
}

/**
 * Transaction handler - processes each transaction
 * @param tx - Transaction to process
 */
async function onTransaction(tx: Transaction): Promise<void> {
    const depositInfo = extractDepositInfo(tx);

    if (!depositInfo) {
        return;
    }

    if (!depositInfo.comment) {
        console.log('Transaction without comment - skipping');
        return;
    }

    console.log('\n=== New Deposit Detected ===');
    console.log(`Amount: ${fromNano(depositInfo.amount)} TON`);
    console.log(`From: ${depositInfo.senderAddress}`);
    console.log(`Comment/UUID: ${depositInfo.comment}`);
    console.log(`Transaction Hash: ${depositInfo.txHash}`);
    console.log(`Transaction LT: ${depositInfo.txLt}`);
    console.log(`Timestamp: ${depositInfo.timestamp.toISOString()}`);
    console.log('===========================\n');

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
 * Main function - sets up the deposit monitoring
 */
async function main(): Promise<void> {
    const config = loadConfig();

    console.log('Starting deposit monitoring...');
    console.log(`Network: ${config.isTestnet ? 'TESTNET' : 'MAINNET'}`);
    console.log(`Wallet: ${config.walletAddress}`);
    if (LAST_PROCESSED_LT && LAST_PROCESSED_HASH) {
        console.log(`Resume from lt:${LAST_PROCESSED_LT} hash:${LAST_PROCESSED_HASH}`);
    } else {
        console.log('Resume from latest transactions (no cursor saved)');
    }
    console.log('');

    // Initialize TON client
    const client = new TonClient({
        endpoint: config.apiUrl,
        apiKey: config.apiKey,
    });

    // Create and start the subscription
    const accountSub = createAccountSubscription(client, config.walletAddress, onTransaction, {
        limit: 10,
        lastLt: LAST_PROCESSED_LT,
        lastHash: LAST_PROCESSED_HASH,
    });

    const unsubscribe = await accountSub.start(10_000); // Poll every 10 seconds

    console.log('Monitoring started. Press Ctrl+C to stop.\n');

    // Handle graceful shutdown
    // Note: This won't catch SIGKILL or power loss. In production,
    // persist the cursor after each processed transaction.
    process.on('SIGINT', () => {
        console.log('\nStopping deposit monitoring...');
        const cursor = accountSub.getLastProcessed();
        console.log('Last processed cursor:', cursor);
        console.log('Persist this cursor to your database for safe resumption.');
        unsubscribe();
        // process.exit(0) is not needed - Node will exit naturally after cleanup
    });
}

// Run the application
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
