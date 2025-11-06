/**
 * Block Subscription for monitoring blockchain transactions
 *
 * This class subscribes to new blocks on the TON blockchain and processes
 * all transactions in those blocks. It uses the Index API for efficient
 * block-by-block monitoring.
 */

import { TonClient } from '@ton/ton';
import { Transaction } from '@ton/ton';

export class BlockSubscription {
    private readonly client: TonClient;
    private lastProcessedBlock: number;
    private readonly onTransaction: (tx: Transaction) => Promise<void>;
    private readonly indexApiUrl: string;
    private readonly indexApiKey: string;
    private isProcessing: boolean = false;
    private intervalId?: NodeJS.Timeout;

    /**
     * Creates a new BlockSubscription instance
     *
     * @param client - TonClient instance
     * @param startBlock - Masterchain block number to start from
     * @param onTransaction - Callback for each transaction
     * @param indexApiUrl - Index API endpoint URL
     * @param indexApiKey - API key for Index API
     */
    constructor(
        client: TonClient,
        startBlock: number,
        onTransaction: (tx: Transaction) => Promise<void>,
        indexApiUrl: string,
        indexApiKey: string,
    ) {
        this.client = client;
        this.lastProcessedBlock = startBlock;
        this.onTransaction = onTransaction;
        this.indexApiUrl = indexApiUrl;
        this.indexApiKey = indexApiKey;
    }

    /**
     * Starts monitoring blocks
     *
     * @param intervalMs - Polling interval in milliseconds (default: 1000)
     */
    async start(intervalMs: number = 1000): Promise<void> {
        const tick = async () => {
            if (this.isProcessing) return;

            this.isProcessing = true;
            try {
                await this.processNextBlock();
            } catch (error) {
                console.error('Error processing block:', error);
            } finally {
                this.isProcessing = false;
            }
        };

        // Start immediately
        await tick();

        // Poll for new blocks (new masterchain block every ~5 seconds)
        this.intervalId = setInterval(tick, intervalMs);
    }

    /**
     * Stops monitoring blocks
     */
    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
    }

    /**
     * Gets the last processed block number
     */
    getLastProcessedBlock(): number {
        return this.lastProcessedBlock;
    }

    /**
     * Processes the next block if available
     */
    private async processNextBlock(): Promise<void> {
        // Get current masterchain info
        const masterchainInfo = await this.client.getMasterchainInfo();
        const currentBlock = masterchainInfo.latestSeqno;

        if (currentBlock <= this.lastProcessedBlock) {
            // No new blocks yet
            return;
        }

        const nextBlock = this.lastProcessedBlock + 1;

        console.log(`Processing masterchain block ${nextBlock} (current: ${currentBlock})`);

        // Fetch all transactions for this block using Index API
        const transactions = await this.getTransactionsByMasterchainBlock(nextBlock);

        console.log(`Found ${transactions.length} transactions in block ${nextBlock}`);

        // Process each transaction
        for (const tx of transactions) {
            await this.onTransaction(tx);
        }

        // Update last processed block
        this.lastProcessedBlock = nextBlock;

        // In production, save this to your database
        console.log(`✓ Processed block ${nextBlock}`);
    }

    /**
     * Fetches all transactions for a masterchain block using Index API
     */
    private async getTransactionsByMasterchainBlock(blockNumber: number): Promise<Transaction[]> {
        const url = `${this.indexApiUrl}getTransactionsByMasterchainSeqno?seqno=${blockNumber}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-API-Key': this.indexApiKey,
            },
        });

        if (!response.ok) {
            throw new Error(`Index API error: ${response.status} ${response.statusText}`);
        }

        const data: any = await response.json();

        if (data.error) {
            throw new Error(`Index API error: ${data.error}`);
        }

        // Index API returns transactions in a different format
        // We return them as-is and handle in the transaction callback
        return data as Transaction[];
    }
}
