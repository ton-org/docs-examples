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

export class AccountSubscription {
    private readonly client: TonClient;
    private readonly accountAddress: Address;
    private startTime: number;
    private readonly onTransaction: (tx: Transaction) => Promise<void>;
    private readonly limit: number;
    private isProcessing: boolean = false;
    private intervalId?: NodeJS.Timeout;

    /**
     * Creates a new AccountSubscription instance
     *
     * @param client - TonClient instance for API calls
     * @param accountAddress - Wallet address to monitor
     * @param startTime - Unix timestamp to start monitoring from (transactions before this will be ignored)
     * @param onTransaction - Callback function to handle each transaction
     * @param limit - Number of transactions to fetch per request (default: 10)
     */
    constructor(
        client: TonClient,
        accountAddress: string,
        startTime: number,
        onTransaction: (tx: Transaction) => Promise<void>,
        limit: number = 10,
    ) {
        this.client = client;
        this.accountAddress = Address.parse(accountAddress);
        this.startTime = startTime;
        this.onTransaction = onTransaction;
        this.limit = limit;
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
                const result = await this.handleTransactionsBatch();

                if (result > 0) {
                    this.startTime = result;
                    // In production, you should persist this timestamp to your database
                    console.log(`Updated startTime to ${result}`);
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
    private async handleTransactionsBatch(
        offsetLt?: string,
        offsetHash?: string,
        retryCount: number = 0,
    ): Promise<number> {
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
                return this.handleTransactionsBatch(offsetLt, offsetHash, retryCount);
            }
            return 0;
        }

        console.log(`Received ${transactions.length} transactions`);

        if (transactions.length === 0) {
            return this.startTime;
        }

        // Process transactions in order (newest first)
        let latestTime = 0;

        for (const tx of transactions) {
            if (tx.now < this.startTime) {
                return latestTime || this.startTime;
            }

            if (latestTime === 0) {
                latestTime = tx.now;
            }

            // call our handler
            await this.onTransaction(tx);
        }

        // If we got fewer transactions than the limit, we've reached the end
        if (transactions.length < this.limit) {
            return latestTime || this.startTime;
        }

        // Continue fetching older transactions
        const lastTx = transactions[transactions.length - 1];
        return this.handleTransactionsBatch(lastTx.lt.toString(), lastTx.hash().toString('base64'), 0);
    }
}
