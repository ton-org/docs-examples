import { Cell, beginCell } from '@ton/core';
import { randomAddress } from '@ton/test-utils';
import {
  MessageBodyResolver,
  runAllMeasurements,
  WALLET_CONFIGS,
  DEFAULT_CONSTANTS,
} from './get-results';
import { printTables } from './print-tables';

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

type ColumnAlignment = 'left' | 'center' | 'right';

type ColumnConfig = {
  key: string;
  header: string;
  alignment: ColumnAlignment;
  enabled: boolean;
};

type Config = {
  requestTimings: {
    realSeconds: number;
    theoreticalSeconds: number;
  };
  messageCounts: number[];
  messageBodyVariants: MessageBodyConfig[];
  enabledWallets: EnabledWallets;
  columnOrder: ColumnConfig[];
  testRuns: TestRunConfig[];
  outputDirectory: string;
};

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

const CONFIG: Config = (() => {
  const messageCounts = [1, 4, 200, 1000];
  const messageBodyVariants: MessageBodyConfig[] = [
    { name: 'Sending TONs', resolveBody: () => Cell.EMPTY },
    { name: 'Sending Comment', resolveBody: commentBodyResolver },
    { name: 'Sending Jettons', resolveBody: jettonBodyResolver },
  ];

  const enabledWallets = {
    v2r1: true,
    v2r2: true,
    v3r1: true,
    v3r2: true,
    v4r2: true,
    v5r1: true,
    preprocessedV2: true,
    highloadV3: true,
  } satisfies EnabledWallets;

  const columnOrder: ColumnConfig[] = [
    { key: 'walletVersion', header: 'Wallet Version', alignment: 'center', enabled: true },
    { key: 'gasDelta', header: 'Gas delta %', alignment: 'right', enabled: true },
    { key: 'feeDelta', header: 'Fee delta %', alignment: 'right', enabled: true },
    { key: 'requests', header: 'Requests', alignment: 'right', enabled: true },
    { key: 'totalGas', header: 'Total Gas', alignment: 'right', enabled: true },
    { key: 'gasPerMsg', header: 'Gas/Msg', alignment: 'right', enabled: true },
    { key: 'totalFee', header: 'Total Fee (TON)', alignment: 'right', enabled: true },
    { key: 'feePerMsg', header: 'Fee/Msg (TON)', alignment: 'right', enabled: true },
    { key: 'realTime', header: 'Real Time (s)', alignment: 'right', enabled: true },
    { key: 'theoryTime', header: 'Theory Time (s)', alignment: 'right', enabled: true },
  ];

  return {
    requestTimings: {
      realSeconds: 13,
      theoreticalSeconds: 4,
    },
    messageCounts,
    messageBodyVariants,
    enabledWallets,
    columnOrder,
    testRuns: buildTestRuns(messageBodyVariants, messageCounts),
    outputDirectory: __dirname,
  };
})();

describe('Wallet Fee Comparison', () => {
  it('Run all wallet measurements', async () => {
    const allResults = await runAllMeasurements({
      enabledWallets: CONFIG.enabledWallets,
      testRuns: CONFIG.testRuns,
      constants: DEFAULT_CONSTANTS,
    });

    const walletNames = WALLET_CONFIGS.reduce(
      (acc, config) => {
        acc[config.key] = config.name;
        return acc;
      },
      {} as Record<string, string>,
    );

    await printTables({
      allResults,
      testRuns: CONFIG.testRuns,
      columnOrder: CONFIG.columnOrder,
      requestTimings: CONFIG.requestTimings,
      highloadWalletName: walletNames['highloadV3'],
      preprocessedWalletName: walletNames['preprocessedV2'],
      outputDirectory: CONFIG.outputDirectory,
    });
  });
});
