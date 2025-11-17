/**
 * Block subscription (functional API) for monitoring blockchain transactions
 */

import { TonClient, Transaction } from '@ton/ton';

export type Unsubscribe = () => void;

export function createBlockSubscription(
    client: TonClient,
    startBlock: number,
    onTransaction: (tx: Transaction, block: { workchain: number; shard: string; seqno: number }) => Promise<void>,
) {
    let lastProcessedBlock = startBlock;
    let isProcessing = false;
    let intervalId: NodeJS.Timeout | undefined;

    const getLastProcessedBlock = (): number => lastProcessedBlock;

    const processShard = async (block: { workchain: number; shard: string; seqno: number }): Promise<number> => {
        const blockKey = `${block.workchain}:${block.shard}:${block.seqno}`;
        console.log(`  Processing block ${blockKey}`);
        try {
            const transactions = await client.getShardTransactions(block.workchain, block.seqno, block.shard);
            for (const shortTx of transactions) {
                const fullTx = await client.getTransaction(shortTx.account, shortTx.lt, shortTx.hash);
                if (fullTx) {
                    await onTransaction(fullTx, block);
                }
            }
            return transactions.length;
        } catch (error) {
            console.error(`Error processing block ${blockKey}:`, error);
            return 0;
        }
    };

    const processBlock = async (seqno: number): Promise<number> => {
        const masterchainShard = '8000000000000000';
        let processedCount = 0;
        processedCount += await processShard({ workchain: -1, shard: masterchainShard, seqno });
        const shards = await client.getWorkchainShards(seqno);
        for (const shard of shards) {
            processedCount += await processShard(shard);
        }
        return processedCount;
    };

    const processNextBlock = async (): Promise<void> => {
        const masterchainInfo = await client.getMasterchainInfo();
        const targetSeqno = masterchainInfo.latestSeqno;
        if (targetSeqno <= lastProcessedBlock) {
            return;
        }
        for (let nextSeqno = lastProcessedBlock + 1; nextSeqno <= targetSeqno; nextSeqno += 1) {
            const totalCount = await processBlock(nextSeqno);
            console.log(`✓ Processed masterchain block ${nextSeqno} (${totalCount} transactions)`);
            lastProcessedBlock = nextSeqno;
        }
    };

    const tick = async () => {
        if (isProcessing) return;
        isProcessing = true;
        try {
            await processNextBlock();
        } catch (error) {
            console.error('Error processing block:', error);
        } finally {
            isProcessing = false;
        }
    };

    const stop: Unsubscribe = () => {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = undefined;
        }
    };

    const start = async (intervalMs: number = 1000): Promise<Unsubscribe> => {
        await tick();
        intervalId = setInterval(tick, intervalMs);
        return stop;
    };

    return { start, stop, getLastProcessedBlock };
}
