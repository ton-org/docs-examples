/**
 * Complete Integration Example
 *
 * This example shows a complete payment processing flow with a mock database.
 * In production, replace the mock database with your actual database (PostgreSQL, MongoDB, etc.)
 */

import { TonClient, Transaction } from '@ton/ton';
import { Address, fromNano, toNano } from '@ton/core';
import { AccountSubscription } from './AccountSubscription';
import { generatePaymentUUID, generatePaymentLink } from './payment-link';

// Mock Database
// In production, use a real database like PostgreSQL, MongoDB, etc.
interface PaymentRecord {
    uuid: string;
    userId: number;
    expectedAmount: bigint;
    processed: boolean;
    transactionHash?: string;
    processedAt?: Date;
    createdAt: Date;
}

class MockDatabase {
    private payments: Map<string, PaymentRecord> = new Map();
    private processedHashes: Set<string> = new Set();

    createPayment(userId: number, expectedAmount: bigint): string {
        const uuid = generatePaymentUUID();
        const payment: PaymentRecord = {
            uuid,
            userId,
            expectedAmount,
            processed: false,
            createdAt: new Date(),
        };
        this.payments.set(uuid, payment);
        console.log(`[DB] Created payment: ${uuid} for user ${userId}`);
        return uuid;
    }

    findPaymentByUUID(uuid: string): PaymentRecord | undefined {
        return this.payments.get(uuid);
    }

    isTransactionProcessed(txHash: string): boolean {
        return this.processedHashes.has(txHash);
    }

    markAsProcessed(uuid: string, txHash: string): void {
        const payment = this.payments.get(uuid);
        if (payment) {
            payment.processed = true;
            payment.transactionHash = txHash;
            payment.processedAt = new Date();
            this.processedHashes.add(txHash);
            console.log(`[DB] Marked payment ${uuid} as processed`);
        }
    }

    creditUserAccount(userId: number, amount: bigint): void {
        // In production, update user's balance in your database
        console.log(`[DB] Credited ${fromNano(amount)} TON to user ${userId}`);
    }

    getAllPayments(): PaymentRecord[] {
        return Array.from(this.payments.values());
    }
}

// Initialize mock database
const db = new MockDatabase();

// Configuration
const WALLET_ADDRESS = 'UQB7...5I';
const API_KEY = 'YOUR_API_KEY_HERE';
const IS_MAINNET = false;

/**
 * Processes a deposit transaction
 */
async function processDeposit(amount: bigint, senderAddress: string, comment: string, txHash: string): Promise<void> {
    console.log('\n=== Processing Deposit ===');
    console.log(`Amount: ${fromNano(amount)} TON`);
    console.log(`From: ${senderAddress}`);
    console.log(`Comment: ${comment}`);
    console.log(`TX Hash: ${txHash}`);

    // 1. Check if transaction already processed
    if (db.isTransactionProcessed(txHash)) {
        console.log('⚠️  Transaction already processed - skipping');
        return;
    }

    // 2. Find payment by UUID (comment)
    const payment = db.findPaymentByUUID(comment);
    if (!payment) {
        console.log('❌ Payment not found for UUID:', comment);
        return;
    }

    // 3. Check if already processed
    if (payment.processed) {
        console.log('⚠️  Payment already marked as processed');
        return;
    }

    // 4. Verify amount matches
    if (payment.expectedAmount !== amount) {
        console.log('❌ Amount mismatch!');
        console.log(`   Expected: ${fromNano(payment.expectedAmount)} TON`);
        console.log(`   Received: ${fromNano(amount)} TON`);
        // In production, you might want to handle partial payments or overpayments
        return;
    }

    // 5. Mark as processed and credit user
    db.markAsProcessed(comment, txHash);
    db.creditUserAccount(payment.userId, amount);

    console.log('✅ Deposit processed successfully!');
    console.log('========================\n');
}

/**
 * Parses message body to extract text comment
 */
function parseComment(tx: Transaction): string | undefined {
    if (!tx.inMessage?.body) return undefined;

    try {
        const slice = tx.inMessage.body.beginParse();
        const op = slice.loadUint(32);
        if (op === 0) {
            return slice.loadStringTail();
        }
    } catch (error) {
        // If parsing fails, return undefined
    }

    return undefined;
}

/**
 * Transaction handler
 */
async function onTransaction(tx: Transaction): Promise<void> {
    // Validate incoming transaction
    if (!tx.inMessage?.info.src) return;
    if (tx.inMessage.info.type !== 'internal') return;
    if (tx.outMessages.size > 0) return; // Skip bounced transactions

    const comment = parseComment(tx);
    if (!comment) {
        console.log('ℹ️  Transaction without comment - skipping');
        return;
    }

    await processDeposit(
        tx.inMessage.info.value.coins,
        tx.inMessage.info.src.toString(),
        comment,
        tx.hash().toString('base64'),
    );
}

/**
 * Creates a sample payment request
 */
function createSamplePaymentRequest(userId: number, amount: string): void {
    const amountNano = toNano(amount);
    const uuid = db.createPayment(userId, amountNano);

    const paymentLink = generatePaymentLink({
        walletAddress: WALLET_ADDRESS,
        amount: amountNano,
        comment: uuid,
    });

    console.log('\n=== Payment Request Created ===');
    console.log(`User ID: ${userId}`);
    console.log(`Amount: ${amount} TON`);
    console.log(`UUID: ${uuid}`);
    console.log(`\nPayment Link:`);
    console.log(paymentLink);
    console.log(`\nInstructions for user:`);
    console.log(`1. Click the link above or copy it`);
    console.log(`2. It will open your TON wallet app`);
    console.log(`3. Confirm the transaction`);
    console.log('===============================\n');
}

/**
 * Main function
 */
async function main(): Promise<void> {
    console.log('=== TON Payment Processing Demo ===\n');

    // Create some sample payment requests
    console.log('Creating sample payment requests...\n');
    createSamplePaymentRequest(101, '1.5');
    createSamplePaymentRequest(102, '2.0');
    createSamplePaymentRequest(103, '0.5');

    // Display all pending payments
    console.log('\n=== Pending Payments ===');
    const payments = db.getAllPayments();
    payments.forEach((p) => {
        console.log(`UUID: ${p.uuid}`);
        console.log(`  User: ${p.userId}`);
        console.log(`  Amount: ${fromNano(p.expectedAmount)} TON`);
        console.log(`  Status: ${p.processed ? 'Processed' : 'Pending'}`);
        console.log('');
    });

    // Initialize TON client
    const endpoint = IS_MAINNET
        ? 'https://toncenter.com/api/v2/jsonRPC'
        : 'https://testnet.toncenter.com/api/v2/jsonRPC';

    const client = new TonClient({
        endpoint,
        apiKey: API_KEY,
    });

    // Start monitoring
    const startTime = Math.floor(Date.now() / 1000) - 3600; // Last hour
    const subscription = new AccountSubscription(client, WALLET_ADDRESS, startTime, onTransaction);

    console.log('=== Starting Transaction Monitor ===');
    console.log(`Wallet: ${WALLET_ADDRESS}`);
    console.log(`Network: ${IS_MAINNET ? 'MAINNET' : 'TESTNET'}`);
    console.log(`Polling every 10 seconds...`);
    console.log('Press Ctrl+C to stop\n');

    await subscription.start(10000);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n\nShutting down...');
        subscription.stop();

        console.log('\n=== Final Payment Status ===');
        const finalPayments = db.getAllPayments();
        finalPayments.forEach((p) => {
            console.log(`${p.uuid}: ${p.processed ? '✅ Processed' : '⏳ Pending'}`);
        });

        process.exit(0);
    });
}

// Run the demo
if (require.main === module) {
    main().catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

export { db, processDeposit };
