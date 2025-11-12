import { Blockchain } from '@ton/sandbox';
import {
  Cell,
  MessageRelaxed,
  internal as internal_relaxed,
  fromNano,
  SendMode,
  toNano,
  OutActionSendMsg,
} from '@ton/core';
import {
  WalletContractV2R1,
  WalletContractV2R2,
  WalletContractV3R1,
  WalletContractV3R2,
  WalletContractV4,
  WalletContractV5R1,
} from '@ton/ton';
import { KeyPair, keyPairFromSeed, getSecureRandomBytes } from '@ton/crypto';
import { randomAddress } from '@ton/test-utils';
import { HighloadWalletV3Code, HighloadWalletV3 } from '../wrappers/highload-wallet-v3';
import { HighloadQueryId } from '../wrappers/highload-query-id';
import { Wallet as PreprocessedWalletV2 } from '../wrappers/preprocessed-wallet-v2';
import { SUBWALLET_ID, DEFAULT_TIMEOUT } from './imports/const';
import { extractTransactionFees } from './utils/fee-extraction';
import { setStoragePrices } from './utils/gas-utils';

export type MessageBodyResolver = (messageIndex: number) => Cell;

export type WalletTestResult = {
  walletName: string;
  requests: number;
  totalGas: bigint;
  totalFee: bigint;
  messageCount: number;
  bodyName: string;
};

export type TestConstants = {
  messageValue: bigint;
  deployValue: bigint;
};

export type MeasureWalletFunction = (
  messageCount: number,
  bodyResolver: MessageBodyResolver,
  bodyName: string,
  constants: TestConstants,
) => Promise<WalletTestResult>;

export type WalletConfig = {
  key: string;
  name: string;
  measureFunction: MeasureWalletFunction;
};

export const toCoins = (value: bigint): number => {
  return Number(fromNano(value));
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
  messageValue: bigint,
): MessageRelaxed[] =>
  Array.from({ length: count }, (_, offset) =>
    internal_relaxed({
      to: randomAddress(),
      value: messageValue,
      bounce: false,
      body: resolveBody(startIndex + offset),
    }),
  );

const setup = async () => {
  const blockchain = await Blockchain.create();

  const config = blockchain.config;
  blockchain.setConfig(
    setStoragePrices(config, {
      utime_sice: 0,
      bit_price_ps: 0n,
      cell_price_ps: 0n,
      mc_bit_price_ps: 0n,
      mc_cell_price_ps: 0n,
    }),
  );

  const keyPair = keyPairFromSeed(await getSecureRandomBytes(32));
  return { blockchain, keyPair };
};

async function measureStandardWallet(
  walletName: string,
  createWallet: (blockchain: Blockchain, keyPair: KeyPair) => any,
  batchSize: number,
  messageCount: number,
  bodyResolver: MessageBodyResolver,
  bodyName: string,
  constants: TestConstants,
): Promise<WalletTestResult> {
  const { blockchain, keyPair } = await setup();
  const wallet = createWallet(blockchain, keyPair);

  // Deploy wallet
  const deployer = await blockchain.treasury('deployer');
  await deployer.send({
    value: constants.deployValue,
    to: wallet.address,
    init: wallet.init,
  });

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

    const messages = createMessages(
      nextMessageIndex,
      batchCount,
      bodyResolver,
      constants.messageValue,
    );

    const transfer = await wallet.createTransfer({
      seqno: Number(seqno),
      secretKey: keyPair.secretKey,
      messages,
      sendMode: SendMode.NONE,
    });
    const result = await wallet.send(transfer);

    const externalTx = result.transactions.find(
      (tx: any) => tx.inMessage?.info.type === 'external-in',
    );
    if (!externalTx) throw new Error('No external-in transaction');

    const gas = extractGasUsed(externalTx);
    const txFees = extractTransactionFees(externalTx, blockchain);
    const fee = txFees.import_fee + txFees.storage_fee + txFees.gas_fees;

    totalGas += gas;
    totalFee += fee;
    sentMessagesCount += batchCount;
    requests++;

    seqno = seqno + 1n;
    nextMessageIndex += batchCount;
    lastBatch = { batchCount, gas, fee };
  }

  const balanceAfter = (await blockchain.getContract(wallet.address)).balance;
  const balanceDiff = balanceBefore - balanceAfter;
  const totalMessageValue = constants.messageValue * BigInt(sentMessagesCount);

  if (balanceDiff !== totalMessageValue + totalFee) {
    throw new Error(
      `Balance mismatch: expected ${totalMessageValue + totalFee}, got ${balanceDiff}`,
    );
  }

  return {
    walletName,
    requests,
    totalGas: totalGas + totalGasVirtual,
    totalFee: totalFee + totalFeeVirtual,
    messageCount,
    bodyName,
  };
}

async function measurePreprocessedWalletV2(
  messageCount: number,
  bodyResolver: MessageBodyResolver,
  bodyName: string,
  constants: TestConstants,
): Promise<WalletTestResult> {
  const walletName = 'Preprocessed Wallet V2';
  const batchSize = 255;
  const { blockchain, keyPair } = await setup();

  const wallet = blockchain.openContract(
    PreprocessedWalletV2.createFromPublicKey(keyPair.publicKey),
  );

  // Deploy
  const deployer = await blockchain.treasury('deployer');
  await wallet.sendDeploy(deployer.getSender(), constants.deployValue);

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

    const transfers = Array.from({ length: batchCount }, (_, offset) => ({
      to: randomAddress(),
      value: constants.messageValue,
      bounce: false,
      body: bodyResolver(nextMessageIndex + offset),
      mode: SendMode.NONE,
    }));

    const result = await wallet.sendTransfers(keyPair, transfers, Number(seqno));

    const externalTx = result.transactions.find(
      (tx: any) => tx.inMessage?.info.type === 'external-in',
    );
    if (!externalTx) throw new Error('No external-in transaction');

    const gas = extractGasUsed(externalTx);
    const txFees = extractTransactionFees(externalTx, blockchain);
    const fee = txFees.import_fee + txFees.storage_fee + txFees.gas_fees;

    totalGas += gas;
    totalFee += fee;
    sentMessagesCount += batchCount;
    requests++;

    seqno = seqno + 1n;
    nextMessageIndex += batchCount;
    lastBatch = { batchCount, gas, fee };
  }

  const balanceAfter = (await blockchain.getContract(wallet.address)).balance;
  const balanceDiff = balanceBefore - balanceAfter;
  const totalMessageValue = constants.messageValue * BigInt(sentMessagesCount);

  if (balanceDiff !== totalMessageValue + totalFee) {
    throw new Error(
      `Balance mismatch: expected ${totalMessageValue + totalFee}, got ${balanceDiff}`,
    );
  }

  return {
    walletName,
    requests,
    totalGas: totalGas + totalGasVirtual,
    totalFee: totalFee + totalFeeVirtual,
    messageCount,
    bodyName,
  };
}

async function measureHighloadV3(
  messageCount: number,
  bodyResolver: MessageBodyResolver,
  bodyName: string,
  constants: TestConstants,
): Promise<WalletTestResult> {
  const walletName = 'Highload Wallet V3';
  const { blockchain, keyPair } = await setup();
  blockchain.now = 1000;
  let queryId = new HighloadQueryId();

  const wallet = blockchain.openContract(
    HighloadWalletV3.createFromConfig(
      { publicKey: keyPair.publicKey, subwalletId: SUBWALLET_ID, timeout: DEFAULT_TIMEOUT },
      HighloadWalletV3Code,
    ),
  );

  const deployer = await blockchain.treasury('deployer');
  await wallet.sendDeploy(deployer.getSender(), constants.deployValue);

  const balanceBefore = (await blockchain.getContract(wallet.address)).balance;
  const totalMessageValue = constants.messageValue * BigInt(messageCount);

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
        value: constants.messageValue,
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
      blockchain.now,
    );
    queryId = queryId.getNext();

    const externalTx = result.transactions.find(
      (tx: any) => tx.inMessage?.info.type === 'external-in',
    );
    if (!externalTx) throw new Error('No external-in transaction');

    const externalFees = extractTransactionFees(externalTx, blockchain);
    const externalFee =
      externalFees.import_fee +
      externalFees.storage_fee +
      externalFees.gas_fees +
      externalFees.out_fwd_fees;

    const internalTx = result.transactions.find(
      (tx: any) =>
        tx.inMessage?.info.type === 'internal' &&
        tx.inMessage?.info.src?.equals?.(wallet.address) &&
        tx.inMessage?.info.dest?.equals?.(wallet.address),
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

  if (balanceDiff !== totalMessageValue + totalFee) {
    throw new Error(
      `Balance mismatch: expected ${totalMessageValue + totalFee}, got ${balanceDiff}`,
    );
  }

  return {
    walletName,
    requests,
    totalGas,
    totalFee,
    messageCount,
    bodyName,
  };
}

function createStandardWalletMeasureFunction(
  walletName: string,
  createWallet: (blockchain: Blockchain, keyPair: KeyPair) => any,
  batchSize: number,
): MeasureWalletFunction {
  return async (messageCount, bodyResolver, bodyName, constants) =>
    measureStandardWallet(
      walletName,
      createWallet,
      batchSize,
      messageCount,
      bodyResolver,
      bodyName,
      constants,
    );
}

export const WALLET_CONFIGS: WalletConfig[] = [
  {
    key: 'v2r1',
    name: 'Wallet V2R1',
    measureFunction: createStandardWalletMeasureFunction(
      'Wallet V2R1',
      (blockchain, kp) =>
        blockchain.openContract(
          WalletContractV2R1.create({ workchain: 0, publicKey: kp.publicKey }),
        ),
      4,
    ),
  },
  {
    key: 'v2r2',
    name: 'Wallet V2R2',
    measureFunction: createStandardWalletMeasureFunction(
      'Wallet V2R2',
      (blockchain, kp) =>
        blockchain.openContract(
          WalletContractV2R2.create({ workchain: 0, publicKey: kp.publicKey }),
        ),
      4,
    ),
  },
  {
    key: 'v3r1',
    name: 'Wallet V3R1',
    measureFunction: createStandardWalletMeasureFunction(
      'Wallet V3R1',
      (blockchain, kp) =>
        blockchain.openContract(
          WalletContractV3R1.create({ workchain: 0, publicKey: kp.publicKey }),
        ),
      4,
    ),
  },
  {
    key: 'v3r2',
    name: 'Wallet V3R2',
    measureFunction: createStandardWalletMeasureFunction(
      'Wallet V3R2',
      (blockchain, kp) =>
        blockchain.openContract(
          WalletContractV3R2.create({ workchain: 0, publicKey: kp.publicKey }),
        ),
      4,
    ),
  },
  {
    key: 'v4r2',
    name: 'Wallet V4R2',
    measureFunction: createStandardWalletMeasureFunction(
      'Wallet V4R2',
      (blockchain, kp) =>
        blockchain.openContract(WalletContractV4.create({ workchain: 0, publicKey: kp.publicKey })),
      4,
    ),
  },
  {
    key: 'v5r1',
    name: 'Wallet V5R1',
    measureFunction: createStandardWalletMeasureFunction(
      'Wallet V5R1',
      (blockchain, kp) =>
        blockchain.openContract(
          WalletContractV5R1.create({ workchain: 0, publicKey: kp.publicKey }),
        ),
      255,
    ),
  },
  {
    key: 'preprocessedV2',
    name: 'Preprocessed Wallet V2',
    measureFunction: measurePreprocessedWalletV2,
  },
  {
    key: 'highloadV3',
    name: 'Highload Wallet V3',
    measureFunction: measureHighloadV3,
  },
];

export const DEFAULT_CONSTANTS: TestConstants = {
  messageValue: toNano('0.01'),
  deployValue: toNano('1000'),
};

export async function runAllMeasurements(config: {
  enabledWallets: Record<string, boolean>;
  testRuns: Array<{
    messageCount: number;
    bodyResolver: MessageBodyResolver;
    bodyName: string;
  }>;
  constants: TestConstants;
}): Promise<WalletTestResult[][]> {
  const keyPair = keyPairFromSeed(await getSecureRandomBytes(32));
  const allResults: WalletTestResult[][] = [];

  const enabledWalletConfigs = WALLET_CONFIGS.filter(
    (walletConfig) => config.enabledWallets[walletConfig.key],
  );

  for (const testRun of config.testRuns) {
    const results: WalletTestResult[] = [];

    for (const walletConfig of enabledWalletConfigs) {
      const result = await walletConfig.measureFunction(
        testRun.messageCount,
        testRun.bodyResolver,
        testRun.bodyName,
        config.constants,
      );
      results.push(result);
    }

    allResults.push(results);
  }

  return allResults;
}
