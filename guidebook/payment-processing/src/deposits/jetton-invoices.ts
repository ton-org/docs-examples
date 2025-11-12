/**
 * Jetton Deposits (Single Wallet)
 *
 * Monitors a single owner wallet for incoming jetton transfer notifications
 * and logs each deposit along with the optional text comment. This mirrors the
 * TON coin invoices example but leverages jetton transfer notifications.
 */

import { Address, Cell } from '@ton/core';
import { AccountSubscription } from '../subscription/AccountSubscription';
import { JettonMaster, TonClient, Transaction } from '@ton/ton';

const TRANSFER_NOTIFICATION_OPCODE = 0x7362d09c;
const COMMENT_OPCODE = 0;

const IS_TESTNET = true;
const API_KEY = 'YOUR_API_KEY_HERE';
const NODE_API_URL = IS_TESTNET
    ? 'https://testnet.toncenter.com/api/v2/jsonRPC'
    : 'https://toncenter.com/api/v2/jsonRPC';
const MY_WALLET_ADDRESS = 'UQB...MAIN';

const LAST_PROCESSED_LT: string | undefined = undefined;
const LAST_PROCESSED_HASH: string | undefined = undefined;

interface JettonConfig {
    symbol: string;
    minterAddress: string;
    decimals: number;
    minDeposit: bigint;
}

const SUPPORTED_JETTONS: JettonConfig[] = [
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
];

interface JettonWalletDetails {
    config: JettonConfig;
    walletAddress: Address;
}

const decodeTransferNotification = (body?: Cell) => {
    if (!body) {
        return null;
    }

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
        const payloadOpcode = payloadSlice.loadUint(32);

        let comment: string | undefined;
        if (payloadOpcode === COMMENT_OPCODE) {
            try {
                comment = payloadSlice.loadStringTail();
            } catch (error) {
                console.warn('Failed to parse comment from transfer notification payload:', error);
            }
        }

        return {
            queryId,
            amount,
            sender,
            comment,
        };
    } catch (error) {
        console.error('Failed to decode jetton transfer notification payload:', error);
        return null;
    }
};

const createTransactionHandler = (jettonWallets: Map<string, JettonWalletDetails>) => {
    return async (tx: Transaction): Promise<void> => {
        const inMessage = tx.inMessage;
        if (!inMessage || inMessage.info.type !== 'internal') {
            return;
        }

        const source = inMessage.info.src;
        if (!source) {
            return;
        }

        const jettonWallet = jettonWallets.get(source.toRawString());
        if (!jettonWallet) {
            return;
        }

        const notification = decodeTransferNotification(inMessage.body);
        if (!notification) {
            return;
        }

        if (notification.amount < jettonWallet.config.minDeposit) {
            console.log(`Deposit below minimum threshold for ${jettonWallet.config.symbol}, ignoring`);
            return;
        }

        const sender = notification.sender?.toRawString() ?? 'unknown';
        const comment = notification.comment ?? 'no comment';

        console.log('\n=== Jetton Deposit Detected ===');
        console.log(`Jetton: ${jettonWallet.config.symbol}`);
        console.log(`Amount: ${notification.amount.toString()}`);
        console.log(`Jetton wallet: ${source.toRawString()}`);
        console.log(`Sender: ${sender}`);
        console.log(`Comment: ${comment}`);
        console.log(`Query ID: ${notification.queryId.toString()}`);
        console.log(`Transaction hash: ${tx.hash().toString('base64')}`);
        console.log(`Transaction LT: ${tx.lt.toString()}`);
        console.log(`Timestamp: ${new Date(tx.now * 1000).toISOString()}`);
        console.log('===============================\n');

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
    };
};

async function resolveJettonWallets(
    client: TonClient,
    ownerAddress: Address,
): Promise<Map<string, JettonWalletDetails>> {
    const result = new Map<string, JettonWalletDetails>();

    for (const config of SUPPORTED_JETTONS) {
        const master = JettonMaster.create(Address.parse(config.minterAddress));
        const openedMaster = client.open(master);
        const jettonWalletAddress = await openedMaster.getWalletAddress(ownerAddress);
        result.set(jettonWalletAddress.toRawString(), {
            config,
            walletAddress: jettonWalletAddress,
        });
    }

    return result;
}

async function main(): Promise<void> {
    console.log('=== TON Jetton Invoices Demo ===\n');
    console.log(`Network: ${IS_TESTNET ? 'TESTNET' : 'MAINNET'}`);
    console.log(`Owner wallet: ${MY_WALLET_ADDRESS}\n`);

    const client = new TonClient({
        endpoint: NODE_API_URL,
        apiKey: API_KEY,
    });

    const ownerAddress = Address.parse(MY_WALLET_ADDRESS);
    const jettonWallets = await resolveJettonWallets(client, ownerAddress);

    console.log('Watching jetton wallets:');
    for (const details of jettonWallets.values()) {
        console.log(`  ${details.config.symbol}: ${details.walletAddress.toRawString()}`);
    }
    console.log('');

    const onTransaction = createTransactionHandler(jettonWallets);

    const subscription = new AccountSubscription(client, MY_WALLET_ADDRESS, onTransaction, {
        limit: 10,
        lastLt: LAST_PROCESSED_LT,
        lastHash: LAST_PROCESSED_HASH,
    });

    // 10 sec
    await subscription.start(10_000);

    console.log('Monitoring jetton deposits... Press Ctrl+C to stop.');

    process.on('SIGINT', () => {
        console.log('\nStopping jetton deposit monitoring...');
        const cursor = subscription.getLastProcessed();
        console.log('Persist cursor to DB:', cursor);
        subscription.stop();
        process.exit(0);
    });
}

if (require.main === module) {
    main().catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

export { main };
