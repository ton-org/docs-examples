/**
 * Deposits Processing Example
 *
 * This example demonstrates how to accept TON coin deposits to a single wallet.
 *
 * Flow:
 * 1. Generate a wallet address once (see wallet setup in separate example)
 * 2. For each payment, generate a unique UUID and save it in your database
 * 3. Provide the user with:
 *    - Your wallet address
 *    - Amount to send
 *    - UUID as text comment
 *
 *    You can use a deeplink:
 *    ton://transfer/<wallet_address>?amount=<amount_in_nano>&text=<uuid>
 *
 * 4. Your backend constantly polls for wallet transactions
 * 5. Process incoming transactions that haven't been processed yet
 */

import { TonClient, Transaction } from '@ton/ton';
import { fromNano } from '@ton/core';
import { AccountSubscription } from './AccountSubscription';

// Configuration
const IS_MAINNET = false; // Set to true for mainnet

// Docs: https://beta-docs.ton.org/ecosystem/node/setup-mytonctrl#liteserver-quickstart
// API Configuration
// Get your API key at https://toncenter.com
// Or run your own API: https://github.com/toncenter/ton-http-api
const MAINNET_API_URL = 'https://toncenter.com/api/v2/jsonRPC';
const TESTNET_API_URL = 'https://testnet.toncenter.com/api/v2/jsonRPC';
const API_KEY = 'YOUR_API_KEY_HERE'; // Replace with your actual API key

// Your wallet address that will receive deposits
const MY_WALLET_ADDRESS = 'UQB7...5I';

// Resume cursor - load last processed transaction LT + hash from your database
// If undefined, the subscriber will process recent transactions returned by the node
const LAST_PROCESSED_LT: string | undefined = undefined;
const LAST_PROCESSED_HASH: string | undefined = undefined;

/**
 * Parses message body to extract text comment if present
 */
// TODO: vendor to ton/ton
function parseComment(tx: Transaction): string | undefined {
    if (!tx.inMessage?.body) return undefined;

    try {
        const slice = tx.inMessage.body.beginParse();
        const op = slice.loadUint(32);

        // op === 0 -> UTF-8 payload
        if (op === 0) {
            return slice.loadStringTail();
        }
    } catch (error) {
        // If parsing fails, return undefined
    }

    return undefined;
}

/**
 * Transaction handler - processes each transaction
 */
async function onTransaction(tx: Transaction): Promise<void> {
    // Check if this is an incoming transaction with a source address
    if (!tx.inMessage?.info.src) {
        return;
    }

    // CRITICAL: Always verify there are no outgoing messages
    // This ensures the coins didn't bounce back due to an error
    if (tx.outMessages.size > 0) {
        return;
    }

    // Check if there's a text comment
    const comment = parseComment(tx);

    if (!comment) {
        console.log('Transaction without comment - skipping');
        return;
    }

    // Extract deposit information
    const info = tx.inMessage.info;
    if (info.type !== 'internal') return; // Only process internal messages

    const amount = info.value.coins;
    const senderAddress = info.src.toString();
    const txHash = tx.hash().toString('base64');

    console.log('\n=== New Deposit Detected ===');
    console.log(`Amount: ${fromNano(amount)} TON`);
    console.log(`From: ${senderAddress}`);
    console.log(`Comment: ${comment}`);
    console.log(`Transaction Hash: ${txHash}`);
    console.log(`Timestamp: ${new Date(tx.now * 1000).toISOString()}`);
    console.log('===========================\n');

    // Here you should:
    // 1. Find the payment in your database by the UUID (comment)
    // 2. Verify that the payment hasn't been processed yet
    // 3. Check that the amount matches what was expected
    // 4. Mark the payment as processed in your database
    // 5. Credit the user's account

    // Example pseudo-code:
    // const payment = await db.findPaymentByUUID(comment);
    // if (!payment) {
    //     console.log('Unknown payment UUID');
    //     return;
    // }
    // if (payment.processed) {
    //     console.log('Payment already processed');
    //     return;
    // }
    // if (payment.expectedAmount !== amount) {
    //     console.log('Amount mismatch');
    //     return;
    // }
    // await db.markPaymentAsProcessed(payment.id, txHash);
    // await db.creditUserAccount(payment.userId, amount);
}

/**
 * Main function - sets up the deposit monitoring
 */
async function main(): Promise<void> {
    console.log('Starting deposit monitoring...');
    console.log(`Network: ${IS_MAINNET ? 'MAINNET' : 'TESTNET'}`);
    console.log(`Wallet: ${MY_WALLET_ADDRESS}`);
    if (LAST_PROCESSED_LT && LAST_PROCESSED_HASH) {
        console.log(`Resume from lt:${LAST_PROCESSED_LT} hash:${LAST_PROCESSED_HASH}`);
    } else {
        console.log('Resume from latest transactions (no cursor saved)');
    }
    console.log('');

    // Initialize TON client
    const endpoint = IS_MAINNET ? MAINNET_API_URL : TESTNET_API_URL;
    const client = new TonClient({
        endpoint,
        apiKey: API_KEY,
    });

    // Create and start the subscription
    const subscription = new AccountSubscription(client, MY_WALLET_ADDRESS, onTransaction, {
        limit: 10,
        lastLt: LAST_PROCESSED_LT,
        lastHash: LAST_PROCESSED_HASH,
    });

    await subscription.start(10_000); // Poll every 10 seconds

    console.log('Monitoring started. Press Ctrl+C to stop.\n');

    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\nStopping deposit monitoring...');
        const cursor = subscription.getLastProcessed();
        console.log('Persist cursor to DB:', cursor);
        subscription.stop();
        process.exit(0);
    });
}

// Run the application
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
