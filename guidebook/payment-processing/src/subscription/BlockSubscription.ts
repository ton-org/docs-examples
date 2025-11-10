/**
 * Block Subscription for monitoring blockchain transactions
 *
 * This class subscribes to new blocks on the TON blockchain and processes
 * all transactions in those blocks using the native @ton/ton API.
 *
 */

import { TonClient, Transaction } from '@ton/ton';

export class BlockSubscription {
    private readonly client: TonClient;
    private lastProcessedBlock: number;
    private readonly onTransaction: (
        tx: Transaction,
        block: { workchain: number; shard: string; seqno: number },
    ) => Promise<void>;
    private isProcessing: boolean = false;
    private intervalId?: NodeJS.Timeout;

    /**
     * Creates a new BlockSubscription instance
     *
     * @param client - TonClient instance
     * @param startBlock - Masterchain block number to start from
     * @param onTransaction - Callback for each transaction
     */
    constructor(
        client: TonClient,
        startBlock: number,
        onTransaction: (tx: Transaction, block: { workchain: number; shard: string; seqno: number }) => Promise<void>,
    ) {
        this.client = client;
        this.lastProcessedBlock = startBlock;
        this.onTransaction = onTransaction;
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
        const targetSeqno = masterchainInfo.latestSeqno;

        if (targetSeqno <= this.lastProcessedBlock) {
            return;
        }

        let nextSeqno = this.lastProcessedBlock + 1;

        while (nextSeqno <= targetSeqno) {
            const totalCount = await this.processBlock(nextSeqno);
            console.log(`✓ Processed masterchain block ${nextSeqno} (${totalCount} transactions)`);
            this.lastProcessedBlock = nextSeqno;
            // Persist the last processed block number in durable storage here to resume safely after restarts.
            nextSeqno += 1;
        }
    }

    /**
     * Processes transactions in a specific block (workchain + shard + seqno)
     */
    private async processBlock(seqno: number): Promise<number> {
        const masterchainShard = '8000000000000000';
        let processedCount = 0;

        processedCount += await this.processShard({ workchain: -1, shard: masterchainShard, seqno });

        const shards = await this.client.getWorkchainShards(seqno);

        for (const shard of shards) {
            processedCount += await this.processShard(shard);
        }

        return processedCount;
    }

    private async processShard(block: { workchain: number; shard: string; seqno: number }): Promise<number> {
        const blockKey = `${block.workchain}:${block.shard}:${block.seqno}`;
        console.log(`  Processing block ${blockKey}`);

        try {
            const transactions = await this.client.getShardTransactions(block.workchain, block.seqno, block.shard);

            for (const shortTx of transactions) {
                const fullTx = await this.client.getTransaction(shortTx.account, shortTx.lt, shortTx.hash);

                if (fullTx) {
                    await this.onTransaction(fullTx, block);
                }
            }

            return transactions.length;
        } catch (error) {
            console.error(`Error processing block ${blockKey}:`, error);
            return 0;
        }
    }
}
