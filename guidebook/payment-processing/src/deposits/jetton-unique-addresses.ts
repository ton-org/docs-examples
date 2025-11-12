/**
 * Jetton Multi-Wallet Deposits Example
 *
 * Each user gets their own TON wallet that holds the TON for fees and a jetton wallet for every
 * supported jetton. When a jetton transfer arrives, we validate the message body, log the deposit,
 * and leave TODO hooks for production systems to persist and act on it.
 */

import { Address, Cell, OpenedContract } from '@ton/core';
import { JettonMaster, TonClient, Transaction, WalletContractV5R1 } from '@ton/ton';
import { mnemonicNew, mnemonicToPrivateKey } from '@ton/crypto';
import { BlockSubscription } from '../subscription/BlockSubscription';

const INTERNAL_TRANSFER_NOTIFICATION = 0x7362d09cn;

const IS_TESTNET = true;
const API_KEY = 'YOUR_API_KEY_HERE';
const NODE_API_URL = IS_TESTNET
    ? 'https://testnet.toncenter.com/api/v2/jsonRPC'
    : 'https://toncenter.com/api/v2/jsonRPC';
const HOT_WALLET_ADDRESS = 'UQB...HOT';
const NETWORK_GLOBAL_ID = IS_TESTNET ? -3 : -239;

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

const jettonConfigBySymbol = new Map<string, JettonConfig>(SUPPORTED_JETTONS.map((config) => [config.symbol, config]));

interface JettonWalletRecord {
    symbol: string;
    userId: number;
    depositWallet: DepositWallet;
    jettonWalletAddress: Address;
}

interface DepositWallet {
    userId: number;
    wallet: WalletContractV5R1;
    publicKey: Buffer;
    secretKey: Buffer;
    jettonWallets: Record<string, Address>;
}

class DepositWalletsDB {
    private readonly depositWallets = new Map<number, DepositWallet>();
    private readonly jettonWalletIndex = new Map<string, JettonWalletRecord>();
    private readonly jettonMasters = new Map<string, OpenedContract<JettonMaster>>();

    constructor(private readonly client: TonClient) {}

    getAllWallets(): DepositWallet[] {
        return [...this.depositWallets.values()];
    }

    findJettonWallet(address: Address): JettonWalletRecord | undefined {
        return this.jettonWalletIndex.get(address.toRawString());
    }

    private getJettonMaster(minterAddress: string): OpenedContract<JettonMaster> {
        let master = this.jettonMasters.get(minterAddress);
        if (!master) {
            const contract = JettonMaster.create(Address.parse(minterAddress));
            master = this.client.open(contract);
            this.jettonMasters.set(minterAddress, master);
        }
        return master;
    }

    async createDepositWallet(userId: number): Promise<DepositWallet> {
        const mnemonic = await mnemonicNew();
        const keyPair = await mnemonicToPrivateKey(mnemonic);

        const wallet = WalletContractV5R1.create({
            walletId: {
                networkGlobalId: NETWORK_GLOBAL_ID,
            },
            publicKey: keyPair.publicKey,
            workchain: 0,
        });

        const jettonWallets: Record<string, Address> = {};
        const pendingMappings: Array<{ symbol: string; address: Address }> = [];

        for (const config of SUPPORTED_JETTONS) {
            const master = this.getJettonMaster(config.minterAddress);
            const jettonWalletAddress = await master.getWalletAddress(wallet.address);
            jettonWallets[config.symbol] = jettonWalletAddress;
            pendingMappings.push({ symbol: config.symbol, address: jettonWalletAddress });
        }

        const record: DepositWallet = {
            userId,
            wallet,
            publicKey: keyPair.publicKey,
            secretKey: keyPair.secretKey,
            jettonWallets,
        };

        this.depositWallets.set(userId, record);

        for (const mapping of pendingMappings) {
            this.jettonWalletIndex.set(mapping.address.toRawString(), {
                symbol: mapping.symbol,
                userId,
                depositWallet: record,
                jettonWalletAddress: mapping.address,
            });
        }

        return record;
    }
}

const decodeInternalTransferNotification = (body?: Cell) => {
    if (!body) {
        return null;
    }
    try {
        const slice = body.beginParse();
        const opcode = slice.loadUintBig(32);

        if (opcode !== INTERNAL_TRANSFER_NOTIFICATION) {
            return null;
        }
        const queryId = slice.loadUintBig(64);
        const amount = slice.loadCoins();
        const sender = slice.loadAddress();

        const inRef = slice.loadBit();
        const forwardPayload = inRef ? slice.loadRef().beginParse() : slice;

        return {
            queryId,
            amount,
            sender,
            forwardPayload,
        };
    } catch (error) {
        console.error('Failed to decode jetton transfer payload', error);
        return null;
    }
};

const processJettonDeposit = async (
    tx: Transaction,
    info: JettonWalletRecord,
    jettonConfig: JettonConfig,
    block: { workchain: number; shard: string; seqno: number },
) => {
    const inMessage = tx.inMessage;
    if (!inMessage || inMessage.info.type !== 'internal') {
        return;
    }

    const parsedNotification = decodeInternalTransferNotification(inMessage.body);
    if (parsedNotification === null) {
        return;
    }

    if (parsedNotification.amount < jettonConfig.minDeposit) {
        console.log(`Deposit below minimum threshold for ${jettonConfig.symbol}, ignoring`);
        return;
    }

    const originalSenderWallet = parsedNotification.sender;
    const jettonWalletAddress = inMessage.info.src.toRawString();

    console.log('\n=== Jetton Deposit Detected ===');
    console.log(`Jetton: ${jettonConfig.symbol}`);
    console.log(`Amount: ${parsedNotification.amount.toString()}`);
    console.log(`Jetton wallet: ${jettonWalletAddress}`);
    console.log(`User ID: ${info.userId}`);
    console.log(`Sender: ${originalSenderWallet.toRawString()}`);
    console.log(`Transaction hash: ${tx.hash().toString('base64')}`);
    console.log(`Transaction LT: ${tx.lt.toString()}`);
    console.log(`Block: ${block.workchain}:${block.shard}:${block.seqno}`);
    console.log(`Timestamp: ${new Date(tx.now * 1000).toISOString()}`);
    console.log('===============================\n');

    // In production:
    // 1. Mark transaction as processed in your database
    // 2. Credit user's account
    // 3. Send notification to user
    // 4. Initiate sweep to cold wallet
};

async function main(): Promise<void> {
    console.log('=== TON Jetton Multi-Wallet Deposits Demo ===\n');
    console.log(`Network: ${IS_TESTNET ? 'TESTNET' : 'MAINNET'}`);
    console.log(`HOT Wallet: ${HOT_WALLET_ADDRESS}\n`);

    const client = new TonClient({
        endpoint: NODE_API_URL,
        apiKey: API_KEY,
    });

    const db = new DepositWalletsDB(client);

    console.log('Creating example deposit wallets...\n');
    for (const userId of [101, 102, 103]) {
        const depositWallet = await db.createDepositWallet(userId);
        console.log(`User ${userId} TON wallet: ${depositWallet.wallet.address.toRawString()}`);
        for (const [symbol, address] of Object.entries(depositWallet.jettonWallets)) {
            console.log(`  ${symbol} jetton wallet: ${address.toRawString()}`);
        }
    }
    console.log('===================================\n');

    const masterchainInfo = await client.getMasterchainInfo();
    const startBlock = masterchainInfo.latestSeqno;
    console.log(`Starting from masterchain block ${startBlock}\n`);

    const handleTransaction: ConstructorParameters<typeof BlockSubscription>[2] = async (tx, block) => {
        const inMessage = tx.inMessage;
        // not internal message check
        if (!inMessage || inMessage.info.type !== 'internal') {
            return;
        }

        // bounced check
        if (tx.outMessages.size > 0) {
            return;
        }

        // find if source is a known jetton wallet
        const jettonInfo = db.findJettonWallet(inMessage.info.src);
        if (!jettonInfo) {
            return;
        }

        // retrieve jetton master info
        const config = jettonConfigBySymbol.get(jettonInfo.symbol);
        if (!config) {
            // if we hit this branch, something is broken on our side
            return;
        }

        await processJettonDeposit(tx, jettonInfo, config, block);
    };

    const subscription = new BlockSubscription(client, startBlock, handleTransaction);
    // every 1 sec
    await subscription.start(1000);

    console.log('Monitoring blockchain for jetton deposits...');
    console.log('Press Ctrl+C to stop\n');

    process.on('SIGINT', () => {
        console.log('\nShutting down...');
        subscription.stop();
        console.log(`Last processed block: ${subscription.getLastProcessedBlock()}`);
        console.log('Goodbye!');
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
