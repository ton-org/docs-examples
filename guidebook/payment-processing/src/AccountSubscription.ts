/**
 * Account Subscription for monitoring wallet transactions
 *
 * This class polls the TON blockchain for new transactions on a specific wallet address.
 * It handles pagination, error recovery, and ensures transactions are processed in order.
 */

import { TonClient, Transaction } from '@ton/ton';
import { Address } from '@ton/core';

const wait = (milliseconds: number): Promise<void> => {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
};

interface AccountSubscriptionOptions {
    limit?: number;
    lastLt?: string;
    lastHash?: string;
    archival?: boolean;
}

export class AccountSubscription {
    private readonly client: TonClient;
    private readonly accountAddress: Address;
    private readonly onTransaction: (tx: Transaction) => Promise<void>;
    private readonly limit: number;
    private lastProcessedLt?: string;
    private lastProcessedHash?: string;
    private isProcessing: boolean = false;
    private intervalId?: NodeJS.Timeout;

    /**
     * Creates a new AccountSubscription instance
     *
     * @param client - TonClient instance for API calls
     * @param accountAddress - Wallet address to monitor
     * @param onTransaction - Callback function to handle each transaction
     * @param options - Additional subscription options (limit, archival, resume cursor)
     */
    constructor(
        client: TonClient,
        accountAddress: string,
        onTransaction: (tx: Transaction) => Promise<void>,
        options: AccountSubscriptionOptions = {},
    ) {
        this.client = client;
        this.accountAddress = Address.parse(accountAddress);
        this.onTransaction = onTransaction;
        this.limit = options.limit ?? 10;
        this.lastProcessedLt = options.lastLt;
        this.lastProcessedHash = options.lastHash;
    }

    /**
     * Starts polling for transactions
     *
     * @param intervalMs - Polling interval in milliseconds (default: 10000)
     */
    async start(intervalMs: number = 10000): Promise<void> {
        const tick = async () => {
            if (this.isProcessing) return;

            this.isProcessing = true;
            try {
                const newTransactions = await this.fetchNewTransactions();

                if (newTransactions.length > 0) {
                    // Process from oldest to newest to maintain chronological order
                    const ordered = [...newTransactions].reverse();
                    for (const tx of ordered) {
                        await this.onTransaction(tx);
                    }

                    const latest = newTransactions[0];
                    // persist lastProcessedLt, lastProcessedHash in database
                    this.lastProcessedLt = latest.lt.toString();
                    this.lastProcessedHash = latest.hash().toString('base64');
                    console.log(`Updated cursor to lt:${this.lastProcessedLt} hash:${this.lastProcessedHash}`);
                }
            } catch (error) {
                console.error('Error in transaction polling:', error);
            } finally {
                this.isProcessing = false;
            }
        };

        // Start immediately
        await tick();

        // Then poll at intervals
        this.intervalId = setInterval(tick, intervalMs);
    }

    /**
     * Stops polling for transactions
     */
    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
    }

    /**
     * Fetches and processes transactions
     *
     * TON transaction has composite ID: account address (on which the transaction took place) + transaction LT (logical time) + transaction hash.
     * So TxID = address+LT+hash, these three parameters uniquely identify the transaction.
     * In our case, we are monitoring one wallet and the address is `accountAddress`.
     */
    private async fetchNewTransactions(
        offsetLt?: string,
        offsetHash?: string,
        retryCount: number = 0,
    ): Promise<Transaction[]> {
        if (offsetLt && offsetHash) {
            console.log(`Fetching ${this.limit} transactions before LT:${offsetLt} Hash:${offsetHash}`);
        } else {
            console.log(`Fetching last ${this.limit} transactions`);
        }

        let transactions: Transaction[];
        try {
            // https://beta-docs.ton.org/ecosystem/api/toncenter/v2/accounts/list-account-transactions

            // IMPORTANT: By default getTransaction request is processed by any available liteserver.
            // If "archival=true" only liteservers with full history are used.
            // If we don't set this boolean flag to true, we could lose parts of older transaction
            // history, but archival node is costly to maintain, so if you are sure that you are working
            // only with the latest data, you can turn it off
            transactions = await this.client.getTransactions(this.accountAddress, {
                limit: this.limit,
                lt: offsetLt,
                hash: offsetHash,
                archival: true, // costly, only archival liteserver can handle this request
            });
        } catch (error) {
            console.error('API error:', error);
            retryCount++;

            if (retryCount < 10) {
                await wait(retryCount * 1000);
                return this.fetchNewTransactions(offsetLt, offsetHash, retryCount);
            }
            return [];
        }

        console.log(`Received ${transactions.length} transactions`);

        if (transactions.length === 0) {
            return [];
        }

        const newTransactions: Transaction[] = [];

        for (const tx of transactions) {
            if (this.isAlreadyProcessed(tx)) {
                // We've reached already processed transactions, stop here
                return newTransactions;
            }

            newTransactions.push(tx);
        }

        // If we fetched a full page, there might be more new transactions
        if (transactions.length === this.limit) {
            const lastTx = transactions[transactions.length - 1];
            const older = await this.fetchNewTransactions(lastTx.lt.toString(), lastTx.hash().toString('base64'), 0);

            return [...newTransactions, ...older];
        }

        return newTransactions;
    }

    private isAlreadyProcessed(tx: Transaction): boolean {
        if (!this.lastProcessedLt || !this.lastProcessedHash) {
            return false;
        }

        const currentLt = tx.lt.toString();
        const currentHash = tx.hash().toString('base64');
        return currentLt === this.lastProcessedLt && currentHash === this.lastProcessedHash;
    }

    getLastProcessed(): { lt?: string; hash?: string } {
        return {
            lt: this.lastProcessedLt,
            hash: this.lastProcessedHash,
        };
    }
}
