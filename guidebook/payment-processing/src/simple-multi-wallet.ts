/**
 * Simple Multi-Wallet Example
 *
 * A minimal example showing the core concepts of multi-wallet deposit processing.
 * This demonstrates the basic flow without production features.
 */

import { TonClient, WalletContractV5R1 } from '@ton/ton';
import { Address, fromNano, internal, toNano } from '@ton/core';
import { mnemonicNew, mnemonicToPrivateKey } from '@ton/crypto';

const API_KEY = 'YOUR_API_KEY_HERE';
const HOT_WALLET_ADDRESS = 'UQB7AhB4fP7SWtnfnIMcVUkwIgVLKqijlcpjNEPUVontys5I';
const IS_TESTNET = true;

// Network global ID for Wallet V5
// -239 for mainnet, -3 for testnet
// This is required for WalletContractV5R1 to identify the network
const NETWORK_GLOBAL_ID = IS_TESTNET ? -3 : -239;

/**
 * Creates a new deposit wallet for a user
 */
async function createDepositWallet(userId: number) {
    console.log(`\nCreating deposit wallet for user ${userId}...`);

    // Generate mnemonic and keys
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

    console.log(`✓ Created: ${address}`);
    console.log(`  Mnemonic: ${mnemonic.join(' ')}`);

    return {
        userId,
        address,
        keyPair,
        mnemonic,
    };
}

/**
 * Checks if a wallet has received a deposit
 */
async function checkDeposit(client: TonClient, address: string) {
    const addr = Address.parse(address);

    // Get recent transactions
    const transactions = await client.getTransactions(addr, { limit: 5 });

    for (const tx of transactions) {
        // Check for incoming message
        if (!tx.inMessage) continue;

        const info = tx.inMessage.info;
        if (info.type !== 'internal') continue;

        // Check no outgoing messages (no bounce)
        if (tx.outMessages.size > 0) continue;

        const amount = info.value.coins;
        const from = info.src?.toString() || 'unknown';

        console.log('\n💰 Deposit found!');
        console.log(`   From: ${from}`);
        console.log(`   Amount: ${fromNano(amount)} TON`);
        console.log(`   Time: ${new Date(tx.now * 1000).toLocaleString()}`);

        return { found: true, amount, transaction: tx };
    }

    return { found: false };
}

/**
 * Forwards all balance from deposit wallet to HOT wallet
 */
async function forwardToHotWallet(client: TonClient, depositAddress: string, keyPair: any, userId: number) {
    console.log(`\nForwarding funds to HOT wallet...`);

    const wallet = WalletContractV5R1.create({
        walletId: {
            networkGlobalId: NETWORK_GLOBAL_ID,
        },
        publicKey: keyPair.publicKey,
        workchain: 0,
    });

    const contract = client.open(wallet);

    // Get balance
    const balance = await contract.getBalance();
    console.log(`Current balance: ${fromNano(balance)} TON`);

    if (balance === 0n) {
        console.log('No balance to forward');
        return;
    }

    // Get seqno
    const seqno = await contract.getSeqno();

    // Send all balance and destroy wallet
    await contract.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [
            internal({
                to: HOT_WALLET_ADDRESS,
                value: toNano('0'),
                body: `User ${userId} deposit`,
                bounce: false,
            }),
        ],
        sendMode: 128 + 32, // Send all + destroy
    });

    console.log('✓ Transfer initiated');
    console.log(`  From: ${depositAddress}`);
    console.log(`  To: ${HOT_WALLET_ADDRESS}`);
    console.log(`  Amount: ${fromNano(balance)} TON`);
}

/**
 * Main example
 */
async function main() {
    console.log('=== Simple Multi-Wallet Deposits Example ===\n');

    // Initialize client
    const client = new TonClient({
        endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC',
        apiKey: API_KEY,
    });

    // Create deposit wallet for user
    const depositWallet = await createDepositWallet(101);

    console.log('\n📋 Instructions:');
    console.log(`1. Send some testnet TON to: ${depositWallet.address}`);
    console.log(`2. Run this script again to check for deposits and forward`);
    console.log(`3. Funds will be automatically sent to HOT wallet\n`);

    // Check for deposits
    console.log('Checking for deposits...');
    const result = await checkDeposit(client, depositWallet.address);

    if (result.found) {
        // Forward to HOT wallet
        await forwardToHotWallet(client, depositWallet.address, depositWallet.keyPair, depositWallet.userId);

        console.log('\n✅ Deposit processed!');
        console.log('The deposit wallet has been destroyed to avoid storage fees.');
        console.log('It can be redeployed automatically on the next deposit.');
    } else {
        console.log('\nNo deposits found yet.');
    }
}

main().catch(console.error);
