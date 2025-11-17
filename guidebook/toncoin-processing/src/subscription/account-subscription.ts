/**
 * Account subscription (functional API) for monitoring wallet transactions.
 * Polls a specific account for new transactions and invokes a callback in order.
 */

import { TonClient, Transaction } from '@ton/ton';
import { Address } from '@ton/core';

const wait = (milliseconds: number): Promise<void> => new Promise((r) => setTimeout(r, milliseconds));

export interface AccountSubscriptionOptions {
    readonly limit?: number;
    readonly lastLt?: string;
    readonly lastHash?: string;
    readonly archival?: boolean;
}

export type Unsubscribe = () => void;

export function createAccountSubscription(
    client: TonClient,
    accountAddress: string,
    onTransaction: (tx: Transaction) => Promise<void>,
    options: AccountSubscriptionOptions = {},
) {
    const address = Address.parse(accountAddress);
    const limit = options.limit ?? 10;
    const useArchival = options.archival ?? true;

    let lastProcessedLt = options.lastLt;
    let lastProcessedHash = options.lastHash;
    let isProcessing = false;
    let intervalId: NodeJS.Timeout | undefined;

    const getLastProcessed = (): { readonly lt?: string; readonly hash?: string } => ({
        lt: lastProcessedLt,
        hash: lastProcessedHash,
    });

    const isAlreadyProcessed = (tx: Transaction): boolean => {
        if (!lastProcessedLt || !lastProcessedHash) return false;
        const currentLt = tx.lt.toString();
        const currentHash = tx.hash().toString('base64');
        return currentLt === lastProcessedLt && currentHash === lastProcessedHash;
    };

    const fetchNewTransactions = async (
        offsetLt?: string,
        offsetHash?: string,
        attemptNumber: number = 1,
    ): Promise<Transaction[]> => {
        if (offsetLt && offsetHash) {
            console.log(`Fetching ${limit} transactions before LT:${offsetLt} Hash:${offsetHash}`);
        } else {
            console.log(`Fetching last ${limit} transactions`);
        }

        let transactions: Transaction[];
        try {
            transactions = await client.getTransactions(address, {
                limit,
                lt: offsetLt,
                hash: offsetHash,
                archival: useArchival,
            });
        } catch (error) {
            console.error(`API error (attempt ${attemptNumber}/3):`, error);
            if (attemptNumber < 3) {
                const delayMs = Math.min(1000 * 2 ** (attemptNumber - 1), 10000);
                console.log(`Retrying in ${delayMs}ms...`);
                await wait(delayMs);
                return fetchNewTransactions(offsetLt, offsetHash, attemptNumber + 1);
            }
            console.error('Failed to fetch transactions after 3 attempts, will retry on next poll cycle');
            return [];
        }

        console.log(`Received ${transactions.length} transactions`);
        if (transactions.length === 0) return [];

        const newTransactions: Transaction[] = [];
        for (const tx of transactions) {
            if (isAlreadyProcessed(tx)) return newTransactions;
            newTransactions.push(tx);
        }

        if (transactions.length === limit) {
            const lastTx = transactions[transactions.length - 1];
            const older = await fetchNewTransactions(lastTx.lt.toString(), lastTx.hash().toString('base64'), 1);
            return [...newTransactions, ...older];
        }
        return newTransactions;
    };

    const tick = async () => {
        if (isProcessing) return;
        isProcessing = true;
        try {
            const newTransactions = await fetchNewTransactions();
            if (newTransactions.length > 0) {
                const ordered = newTransactions.reverse();
                for (const tx of ordered) {
                    await onTransaction(tx);
                    lastProcessedLt = tx.lt.toString();
                    lastProcessedHash = tx.hash().toString('base64');
                    console.log(`Updated cursor to lt:${lastProcessedLt} hash:${lastProcessedHash}`);
                }
            }
        } catch (error) {
            console.error('Error in transaction polling:', error);
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

    const start = async (intervalMs: number = 10000): Promise<Unsubscribe> => {
        await tick();
        intervalId = setInterval(tick, intervalMs);
        return stop;
    };

    return { start, stop, getLastProcessed };
}
