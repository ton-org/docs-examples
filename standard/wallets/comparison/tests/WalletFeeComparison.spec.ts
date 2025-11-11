import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { Blockchain } from '@ton/sandbox';
import {
    Cell,
    SendMode,
    internal as internal_relaxed,
    toNano,
    MessageRelaxed,
    OutActionSendMsg,
    beginCell,
    Address,
    fromNano,
} from '@ton/core';
import {
    WalletContractV2R1,
    WalletContractV2R2,
    WalletContractV3R1,
    WalletContractV3R2,
    WalletContractV4,
    WalletContractV5R1
} from '@ton/ton';
import { KeyPair, keyPairFromSeed, getSecureRandomBytes } from '@ton/crypto';
import { randomAddress } from '@ton/test-utils';
import { HighloadWalletV3Code, HighloadWalletV3 } from '../wrappers/HighloadWalletV3';
import { HighloadQueryId } from '../wrappers/HighloadQueryId';
import { Wallet as PreprocessedWalletV2 } from '../wrappers/PreprocessedWalletV2';
import { SUBWALLET_ID, DEFAULT_TIMEOUT } from './imports/const';
import { extractTransactionFees } from './utils/feeExtraction';

type MessageBodyResolver = (messageIndex: number) => Cell;

type MessageBodyConfig = {
    name: string;
    resolveBody: MessageBodyResolver;
};

type TestRunConfig = {
    messageCount: number;
    bodyResolver: MessageBodyResolver;
    bodyName: string;
};

type WalletKey =
    | 'v2r1'
    | 'v2r2'
    | 'v3r1'
    | 'v3r2'
    | 'v4r2'
    | 'v5r1'
    | 'preprocessedV2'
    | 'highloadV3';

type EnabledWallets = Record<WalletKey, boolean>;
type WalletNames = Record<WalletKey, string>;

type Config = {
    constants: {
        messageValue: bigint;
        deployValue: bigint;
    };
    requestTimings: {
        realSeconds: number;
        theoreticalSeconds: number;
    };
    messageCounts: number[];
    messageBodyVariants: MessageBodyConfig[];
    enabledWallets: EnabledWallets;
    walletNames: WalletNames;
    displayFields: {
        requests: boolean;
        totalGas: boolean;
        gasPerMsg: boolean;
        totalFee: boolean;
        feePerMsg: boolean;
        percentToBestGas: boolean;
        percentToBestFee: boolean;
        time: boolean;
        theoreticalTime: boolean;
    };
    testRuns: TestRunConfig[];
};

const CONFIG: Config = (() => {
    const messageCounts = [1, 4, 200, 1000];
    const messageBodyVariants: MessageBodyConfig[] = [
        { name: 'Empty', resolveBody: () => Cell.EMPTY },
        { name: 'Comment', resolveBody: commentBodyResolver },
        { name: 'Jetton', resolveBody: jettonBodyResolver },
    ];

    // Wallet selection (true = enabled, false = disabled)
    const enabledWallets = {
        v2r1: true,
        v2r2: true,
        v3r1: true,
        v3r2: true,
        v4r2: true,
        v5r1: true,
        preprocessedV2: false,
        highloadV3: true,
    } satisfies EnabledWallets;

    // Wallet names for reporting
    const walletNames = {
        v2r1: 'Wallet V2R1',
        v2r2: 'Wallet V2R2',
        v3r1: 'Wallet V3R1',
        v3r2: 'Wallet V3R2',
        v4r2: 'Wallet V4R2',
        v5r1: 'Wallet V5R1',
        preprocessedV2: 'Preprocessed Wallet V2',
        highloadV3: 'Highload Wallet V3',
    } satisfies WalletNames;

    // Columns to include
    const displayFields = {
        requests: true,
        totalGas: true,
        gasPerMsg: true,
        totalFee: true,
        feePerMsg: true,
        percentToBestGas: true,
        percentToBestFee: true,
        time: true,
        theoreticalTime: true,
    };

    return {
        constants: {
            messageValue: toNano('0.01'),
            deployValue: toNano('1000'),
        },
        requestTimings: {
            realSeconds: 13,
            theoreticalSeconds: 4,
        },
        messageCounts,
        messageBodyVariants,
        enabledWallets,
        walletNames,
        displayFields,
        testRuns: buildTestRuns(messageBodyVariants, messageCounts),
    };
})();

const toCoins = (value: bigint): number => {
    return Number(fromNano(value));
};

const formatSeconds = (seconds: number): string => {
    const totalSeconds = Math.round(seconds);
    if (totalSeconds < 60) {
        return `${totalSeconds}s`;
    }
    const minutes = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${minutes}m ${secs}s`;
};

const extractGasUsed = (tx: any): bigint => {
    if (tx.description.type !== 'generic') return 0n;
    if (tx.description.computePhase.type !== 'vm') return 0n;
    return tx.description.computePhase.gasUsed as bigint;
};

const createMessages = (
    startIndex: number,
    count: number,
    resolveBody: MessageBodyResolver,
): MessageRelaxed[] =>
    Array.from({ length: count }, (_, offset) =>
        internal_relaxed({
            to: randomAddress(),
            value: CONFIG.constants.messageValue,
            bounce: false,
            body: resolveBody(startIndex + offset),
        }),
    );

function buildTestRuns(bodyVariants: MessageBodyConfig[], counts: number[]): TestRunConfig[] {
    return bodyVariants.flatMap((variant) =>
        counts.map((messageCount) => ({
            messageCount,
            bodyResolver: variant.resolveBody,
            bodyName: variant.name,
        })),
    );
}

function commentBodyResolver(messageIndex: number): Cell {
    return beginCell().storeUint(0, 32).storeStringTail(randomString(12, messageIndex)).endCell();
}

function jettonBodyResolver(messageIndex: number): Cell {
    return beginCell()
        .storeUint(0xf8a7ea5, 32)
        .storeUint(messageIndex, 64)
        .storeCoins(1)
        .storeAddress(randomAddress())
        .storeAddress(randomAddress())
        .storeMaybeRef(null)
        .storeCoins(0)
        .storeMaybeRef(commentBodyResolver(messageIndex))
        .endCell();
}

function randomString(size: number, seed: number): string {
    return generateSeededString(seed, size);
}

function generateSeededString(
    seed: number,
    size: number,
    characterSet: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
): string {
    const randomFunc = mulberry32(seed);

    let result = '';
    for (let i = 0; i < size; i++) {
        const randomIndex = Math.floor(randomFunc() * characterSet.length);
        result += characterSet.charAt(randomIndex);
    }
    return result;
}

function mulberry32(seed: number): () => number {
    return function () {
        let t = (seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

type WalletTestResult = {
    walletName: string;
    requests: number;
    totalGas: bigint;
    totalFee: bigint;
    messageCount: number;
    bodyName: string;
};

type BatchExecutionContext = {
    blockchain: Blockchain;
    wallet: any;
    seqno: bigint;
    batchCount: number;
    bodyResolver: MessageBodyResolver;
    startIndex: number;
};

type BatchExecutionResult = {
    gas: bigint;
    fee: bigint;
    nextSeqno?: bigint;
};

type WalletMeasurementOptions = {
    walletName: string;
    messageCount: number;
    bodyResolver: MessageBodyResolver;
    bodyName: string;
    batchSize: number;
    createWallet: (blockchain: Blockchain) => Promise<any> | any;
    deploy: (blockchain: Blockchain, wallet: any) => Promise<void>;
    executeBatch: (context: BatchExecutionContext) => Promise<BatchExecutionResult>;
};

async function measureWalletBatches(options: WalletMeasurementOptions): Promise<WalletTestResult> {
    const { walletName, messageCount, bodyResolver, bodyName, batchSize, createWallet, deploy, executeBatch } = options;

    const blockchain = await Blockchain.create();
    const wallet = await createWallet(blockchain);
    await deploy(blockchain, wallet);

    const balanceBefore = (await blockchain.getContract(wallet.address)).balance;

    let totalGas = 0n;
    let totalFee = 0n;
    let totalGasVirtual = 0n;
    let totalFeeVirtual = 0n;
    let requests = 0;
    let sentMessagesCount = 0;

    let seqno: bigint = BigInt(await wallet.getSeqno());
    let nextMessageIndex = 0;
    let lastBatch: { batchCount: number; gas: bigint; fee: bigint } | null = null;

    for (let i = 0; i < messageCount; i += batchSize) {
        const batchCount = Math.min(batchSize, messageCount - i);

        if (lastBatch && batchCount === lastBatch.batchCount) {
            totalGasVirtual += lastBatch.gas;
            totalFeeVirtual += lastBatch.fee;
            requests++;
            continue;
        }

        const { gas, fee, nextSeqno } = await executeBatch({
            blockchain,
            wallet,
            seqno,
            batchCount,
            bodyResolver,
            startIndex: nextMessageIndex,
        });

        totalGas += gas;
        totalFee += fee;
        sentMessagesCount += batchCount;
        requests++;

        seqno = nextSeqno ?? seqno + 1n;
        nextMessageIndex += batchCount;
        lastBatch = { batchCount, gas, fee };
    }

    const balanceAfter = (await blockchain.getContract(wallet.address)).balance;
    const balanceDiff = balanceBefore - balanceAfter;
    const totalMessageValue = CONFIG.constants.messageValue * BigInt(sentMessagesCount);

    expect(balanceDiff).toBe(totalMessageValue + totalFee);

    return {
        walletName,
        requests,
        totalGas: totalGas + totalGasVirtual,
        totalFee: totalFee + totalFeeVirtual,
        messageCount,
        bodyName,
    };
}

describe('Wallet Fee Comparison', () => {
    let keyPair: KeyPair;
    const allResults: WalletTestResult[][] = []; // Results collected for each run

    beforeAll(async () => {
        keyPair = keyPairFromSeed(await getSecureRandomBytes(32));
    });

    const deployWallet = async (blockchain: Blockchain, wallet: any) => {
        const deployer = await blockchain.treasury('deployer');
        await deployer.send({
            value: CONFIG.constants.deployValue,
            to: wallet.address,
            init: wallet.init,
        });
    };

    async function measureStandardWallet(
        walletName: string,
        createWallet: (blockchain: Blockchain) => any,
        batchSize: number,
        messageCount: number,
        bodyResolver: MessageBodyResolver,
        bodyName: string
    ) {
        return measureWalletBatches({
            walletName,
            messageCount,
            bodyResolver,
            bodyName,
            batchSize,
            createWallet,
            deploy: deployWallet,
            executeBatch: async ({ wallet, seqno, batchCount, bodyResolver, blockchain, startIndex }) => {
                const messages = createMessages(startIndex, batchCount, bodyResolver);

                const transfer = await wallet.createTransfer({
                    seqno: Number(seqno),
                    secretKey: keyPair.secretKey,
                    messages,
                    sendMode: SendMode.NONE,
                });
                const result = await wallet.send(transfer);

                const externalTx = result.transactions.find((tx: any) => tx.inMessage?.info.type === 'external-in');
                if (!externalTx) throw new Error('No external-in transaction');

                const gas = extractGasUsed(externalTx);
                const txFees = extractTransactionFees(externalTx, blockchain);
                const fee = txFees.import_fee + txFees.storage_fee + txFees.gas_fees;

                return { gas, fee, nextSeqno: seqno + 1n };
            },
        });
    }

    async function measurePreprocessedWalletV2(
        walletName: string,
        messageCount: number,
        bodyResolver: MessageBodyResolver,
        bodyName: string
    ) {
        return measureWalletBatches({
            walletName,
            messageCount,
            bodyResolver,
            bodyName,
            batchSize: 255,
            createWallet: (blockchain) =>
                blockchain.openContract(PreprocessedWalletV2.createFromPublicKey(keyPair.publicKey)),
            deploy: async (blockchain, wallet) => {
                const deployer = await blockchain.treasury('deployer');
                await wallet.sendDeploy(deployer.getSender(), CONFIG.constants.deployValue);
            },
            executeBatch: async ({ wallet, seqno, batchCount, bodyResolver, blockchain, startIndex }) => {
                const transfers = Array.from({ length: batchCount }, (_, offset) => ({
                    to: randomAddress(),
                    value: CONFIG.constants.messageValue,
                    bounce: false,
                    body: bodyResolver(startIndex + offset),
                    mode: SendMode.NONE,
                }));

                const result = await wallet.sendTransfers(keyPair, transfers, Number(seqno));

                const externalTx = result.transactions.find((tx: any) => tx.inMessage?.info.type === 'external-in');
                if (!externalTx) throw new Error('No external-in transaction');

                const gas = extractGasUsed(externalTx);
                const txFees = extractTransactionFees(externalTx, blockchain);
                const fee = txFees.import_fee + txFees.storage_fee + txFees.gas_fees;

                return { gas, fee, nextSeqno: seqno + 1n };
            },
        });
    }

    async function measureHighloadV3(
        walletName: string,
        messageCount: number,
        bodyResolver: MessageBodyResolver,
        bodyName: string
    ) {
        const blockchain = await Blockchain.create();
        blockchain.now = 1000;
        let queryId = new HighloadQueryId();

        const wallet = blockchain.openContract(
            HighloadWalletV3.createFromConfig(
                { publicKey: keyPair.publicKey, subwalletId: SUBWALLET_ID, timeout: DEFAULT_TIMEOUT },
                HighloadWalletV3Code
            )
        );

        const deployer = await blockchain.treasury('deployer');
        await wallet.sendDeploy(deployer.getSender(), CONFIG.constants.deployValue);

        const balanceBefore = (await blockchain.getContract(wallet.address)).balance;
        const totalMessageValue = CONFIG.constants.messageValue * BigInt(messageCount);

        let totalGas = 0n;
        let totalFee = 0n;
        let requests = 0;
        const batchSize = 254;

        for (let i = 0; i < messageCount; i += batchSize) {
            const batchCount = Math.min(batchSize, messageCount - i);
            const actions: OutActionSendMsg[] = Array.from({ length: batchCount }, (_, offset) => ({
                type: 'sendMsg',
                mode: SendMode.NONE,
                outMsg: internal_relaxed({
                    to: randomAddress(),
                    value: CONFIG.constants.messageValue,
                    bounce: false,
                    body: bodyResolver(i + offset),
                }),
            }));

            const result = await wallet.sendBatch(
                keyPair.secretKey,
                actions,
                SUBWALLET_ID,
                queryId,
                DEFAULT_TIMEOUT,
                blockchain.now
            );
            queryId = queryId.getNext();

            const externalTx = result.transactions.find((tx: any) => tx.inMessage?.info.type === 'external-in');
            if (!externalTx) throw new Error('No external-in transaction');

            const externalFees = extractTransactionFees(externalTx, blockchain);
            const externalFee =
                externalFees.import_fee + externalFees.storage_fee + externalFees.gas_fees + externalFees.out_fwd_fees;

            const internalTx = result.transactions.find(
                (tx: any) =>
                    tx.inMessage?.info.type === 'internal' &&
                    tx.inMessage?.info.src?.equals?.(wallet.address) &&
                    tx.inMessage?.info.dest?.equals?.(wallet.address)
            );
            if (!internalTx) throw new Error('No internal self-call transaction');

            const internalFees = extractTransactionFees(internalTx, blockchain);
            const internalFee = internalFees.storage_fee + internalFees.gas_fees;

            totalGas += extractGasUsed(externalTx) + extractGasUsed(internalTx);
            totalFee += externalFee + internalFee;
            requests++;
        }

        const balanceAfter = (await blockchain.getContract(wallet.address)).balance;
        const balanceDiff = balanceBefore - balanceAfter;

        // Verify balance calculation
        expect(balanceDiff).toBe(totalMessageValue + totalFee);

        return {
            walletName,
            requests,
            totalGas,
            totalFee,
            messageCount,
            bodyName,
        };
    }

    CONFIG.testRuns.forEach((testRun, runIndex) => {
        describe(`Run ${runIndex + 1}: ${testRun.messageCount} messages, body: ${testRun.bodyName}`, () => {
            const results: WalletTestResult[] = [];

            // Wallet V2R1
            if (CONFIG.enabledWallets.v2r1) {
                it(`Measure ${CONFIG.walletNames.v2r1}`, async () => {
                    const result = await measureStandardWallet(
                        CONFIG.walletNames.v2r1,
                        (blockchain) =>
                            blockchain.openContract(
                                WalletContractV2R1.create({ workchain: 0, publicKey: keyPair.publicKey })
                            ),
                        4, // V2R1 supports up to 4 messages per transaction
                        testRun.messageCount,
                        testRun.bodyResolver,
                        testRun.bodyName
                    );
                    results.push(result);
                });
            }

            // Wallet V2R2
            if (CONFIG.enabledWallets.v2r2) {
                it(`Measure ${CONFIG.walletNames.v2r2}`, async () => {
                    const result = await measureStandardWallet(
                        CONFIG.walletNames.v2r2,
                        (blockchain) =>
                            blockchain.openContract(
                                WalletContractV2R2.create({ workchain: 0, publicKey: keyPair.publicKey })
                            ),
                        4, // V2R2 supports up to 4 messages per transaction
                        testRun.messageCount,
                        testRun.bodyResolver,
                        testRun.bodyName
                    );
                    results.push(result);
                });
            }

            // Wallet V3R1
            if (CONFIG.enabledWallets.v3r1) {
                it(`Measure ${CONFIG.walletNames.v3r1}`, async () => {
                    const result = await measureStandardWallet(
                        CONFIG.walletNames.v3r1,
                        (blockchain) =>
                            blockchain.openContract(
                                WalletContractV3R1.create({ workchain: 0, publicKey: keyPair.publicKey })
                            ),
                        4, // V3R1 supports up to 4 messages per transaction
                        testRun.messageCount,
                        testRun.bodyResolver,
                        testRun.bodyName
                    );
                    results.push(result);
                });
            }

            // Wallet V3R2
            if (CONFIG.enabledWallets.v3r2) {
                it(`Measure ${CONFIG.walletNames.v3r2}`, async () => {
                    const result = await measureStandardWallet(
                        CONFIG.walletNames.v3r2,
                        (blockchain) =>
                            blockchain.openContract(
                                WalletContractV3R2.create({ workchain: 0, publicKey: keyPair.publicKey })
                            ),
                        4, // V3R2 supports up to 4 messages per transaction
                        testRun.messageCount,
                        testRun.bodyResolver,
                        testRun.bodyName
                    );
                    results.push(result);
                });
            }

            // Wallet V4R2
            if (CONFIG.enabledWallets.v4r2) {
                it(`Measure ${CONFIG.walletNames.v4r2}`, async () => {
                    const result = await measureStandardWallet(
                        CONFIG.walletNames.v4r2,
                        (blockchain) =>
                            blockchain.openContract(
                                WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey })
                            ),
                        4, // V4 supports up to 4 messages per transaction
                        testRun.messageCount,
                        testRun.bodyResolver,
                        testRun.bodyName
                    );
                    results.push(result);
                });
            }

            // Wallet V5R1
            if (CONFIG.enabledWallets.v5r1) {
                it(`Measure ${CONFIG.walletNames.v5r1}`, async () => {
                    const result = await measureStandardWallet(
                        CONFIG.walletNames.v5r1,
                        (blockchain) =>
                            blockchain.openContract(
                                WalletContractV5R1.create({ workchain: 0, publicKey: keyPair.publicKey })
                            ),
                        255, // V5 supports up to 255 messages per transaction
                        testRun.messageCount,
                        testRun.bodyResolver,
                        testRun.bodyName
                    );
                    results.push(result);
                });
            }

            // Preprocessed Wallet V2
            if (CONFIG.enabledWallets.preprocessedV2) {
                it(`Measure ${CONFIG.walletNames.preprocessedV2}`, async () => {
                    const result = await measurePreprocessedWalletV2(
                        CONFIG.walletNames.preprocessedV2,
                        testRun.messageCount,
                        testRun.bodyResolver,
                        testRun.bodyName
                    );
                    results.push(result);
                });
            }

            // Highload Wallet V3
            if (CONFIG.enabledWallets.highloadV3) {
                it(`Measure ${CONFIG.walletNames.highloadV3}`, async () => {
                    const result = await measureHighloadV3(
                        CONFIG.walletNames.highloadV3,
                        testRun.messageCount,
                        testRun.bodyResolver,
                        testRun.bodyName
                    );
                    results.push(result);
                });
            }

            afterAll(() => {
                allResults.push(results);
            });
        });
    });

    afterAll(() => {
        if (allResults.length === 0) return;

        const markdownLines: string[] = ['# Wallet Fee Comparison Results', ''];
        const numberFormatter = new Intl.NumberFormat('en-US');
        const tonFormatter = new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 9,
        });
        allResults.forEach((results, runIndex) => {
            if (results.length === 0) return;

            const testRun = CONFIG.testRuns[runIndex];
            markdownLines.push(
                `## Run ${runIndex + 1}: ${testRun.messageCount} messages, Body: ${testRun.bodyName}`,
                ''
            );

            const gasPerMsgValues = results.map((r) => r.totalGas / BigInt(r.messageCount));
            const feePerMsgValues = results.map((r) => r.totalFee / BigInt(r.messageCount));
            const minGasPerMsg = gasPerMsgValues.reduce((min, val) => (val < min ? val : min), gasPerMsgValues[0]);
            const minFeePerMsg = feePerMsgValues.reduce((min, val) => (val < min ? val : min), feePerMsgValues[0]);

            const formatPercentDiffPlain = (value: bigint, baseline: bigint): string => {
                if (baseline === 0n) {
                    return 'N/A';
                }
                const diff = Number(((value - baseline) * 10000n) / baseline) / 100;
                if (!Number.isFinite(diff)) {
                    return 'N/A';
                }
                if (diff === 0) {
                    return '0.00%';
                }
                const prefix = diff > 0 ? '+' : '';
                return `${prefix}${diff.toFixed(2)}%`;
            };

            const formatPercentDiffMarkdown = (value: bigint, baseline: bigint): string => {
                if (baseline === 0n) {
                    return 'N/A';
                }
                if (value === baseline) {
                    return '**Best**';
                }
                return formatPercentDiffPlain(value, baseline);
            };

            const isHighloadResult = (result: WalletTestResult) => result.walletName === CONFIG.walletNames.highloadV3;

            // Simplified assumption: Highload Wallet V3 can handle multiple batches per block, but the exact limit depends on network settings and payload size.
            const formatRealTime = (result: WalletTestResult): string => {
                const seconds = isHighloadResult(result)
                    ? CONFIG.requestTimings.realSeconds
                    : result.requests * CONFIG.requestTimings.realSeconds;
                return formatSeconds(seconds);
            };

            const formatTheoreticalTime = (result: WalletTestResult): string => {
                const seconds = isHighloadResult(result)
                    ? CONFIG.requestTimings.theoreticalSeconds
                    : result.requests * CONFIG.requestTimings.theoreticalSeconds;
                return formatSeconds(seconds);
            };

            const columns: {
                header: string;
                markdownAccessor: (result: WalletTestResult, index: number) => string;
                consoleAccessor: (result: WalletTestResult, index: number) => string | number;
            }[] = [
                    {
                        header: 'Wallet Version',
                        markdownAccessor: (result, idx) => {
                            const gasPerMsg = gasPerMsgValues[idx];
                            const feePerMsg = feePerMsgValues[idx];
                            const isGasBest = gasPerMsg === minGasPerMsg;
                            const isFeeBest = feePerMsg === minFeePerMsg;
                            const isBest = isGasBest || isFeeBest;
                            return isBest ? `**${result.walletName}** ${isFeeBest ? '✅' : ''}` : result.walletName;
                        },
                        consoleAccessor: (result) => result.walletName,
                    },
                ];

            if (CONFIG.displayFields.requests) {
                columns.push({
                    header: 'Requests',
                    markdownAccessor: (result) => numberFormatter.format(result.requests),
                    consoleAccessor: (result) => result.requests,
                });
            }
            if (CONFIG.displayFields.totalGas) {
                columns.push({
                    header: 'Total Gas',
                    markdownAccessor: (result) => numberFormatter.format(Number(result.totalGas)),
                    consoleAccessor: (result) => Number(result.totalGas),
                });
            }
            if (CONFIG.displayFields.gasPerMsg) {
                columns.push({
                    header: 'Gas per Msg',
                    markdownAccessor: (_result, idx) => numberFormatter.format(Number(gasPerMsgValues[idx])),
                    consoleAccessor: (_result, idx) => Number(gasPerMsgValues[idx]),
                });
            }
            if (CONFIG.displayFields.totalFee) {
                columns.push({
                    header: 'Total Fee (TON)',
                    markdownAccessor: (result) => tonFormatter.format(toCoins(result.totalFee)),
                    consoleAccessor: (result) => toCoins(result.totalFee),
                });
            }
            if (CONFIG.displayFields.feePerMsg) {
                columns.push({
                    header: 'Fee per Msg (TON)',
                    markdownAccessor: (_result, idx) => tonFormatter.format(toCoins(feePerMsgValues[idx])),
                    consoleAccessor: (_result, idx) => toCoins(feePerMsgValues[idx]),
                });
            }
            if (CONFIG.displayFields.percentToBestGas) {
                columns.push({
                    header: 'Gas delta (%)',
                    markdownAccessor: (_result, idx) => formatPercentDiffMarkdown(gasPerMsgValues[idx], minGasPerMsg),
                    consoleAccessor: (_result, idx) => formatPercentDiffPlain(gasPerMsgValues[idx], minGasPerMsg),
                });
            }
            if (CONFIG.displayFields.percentToBestFee) {
                columns.push({
                    header: 'Fee delta (%)',
                    markdownAccessor: (_result, idx) => formatPercentDiffMarkdown(feePerMsgValues[idx], minFeePerMsg),
                    consoleAccessor: (_result, idx) => formatPercentDiffPlain(feePerMsgValues[idx], minFeePerMsg),
                });
            }
            if (CONFIG.displayFields.time) {
                columns.push({
                    header: 'Real Time (sec)',
                    markdownAccessor: (result) => formatRealTime(result),
                    consoleAccessor: (result) => formatRealTime(result),
                });
            }
            if (CONFIG.displayFields.theoreticalTime) {
                columns.push({
                    header: 'Theoretical Time (sec)',
                    markdownAccessor: (result) => formatTheoreticalTime(result),
                    consoleAccessor: (result) => formatTheoreticalTime(result),
                });
            }

            const headerRow = `| ${columns.map((column) => column.header).join(' | ')} |`;
            const separatorRow = `| ${columns.map(() => '---').join(' | ')} |`;

            markdownLines.push(headerRow, separatorRow);

            results.forEach((result, idx) => {
                const rowCells = columns.map((column) => column.markdownAccessor(result, idx));
                markdownLines.push(`| ${rowCells.join(' | ')} |`);
            });

            const consoleRows = results.map((result, idx) => {
                const row: Record<string, string | number> = {};
                columns.forEach((column) => {
                    row[column.header] = column.consoleAccessor(result, idx);
                });
                return row;
            });

            console.log(`Run ${runIndex + 1}: ${testRun.messageCount} messages, Body: ${testRun.bodyName}`);
            console.table(consoleRows);

            markdownLines.push('');
        });

        const outputDir = path.resolve(__dirname, 'results');
        const outputFile = path.join(outputDir, 'wallet-fee-comparison.md');
        mkdirSync(outputDir, { recursive: true });
        writeFileSync(outputFile, markdownLines.join('\n'), { encoding: 'utf-8' });
        console.log(`Markdown report saved to ${outputFile}`);
    });
});


