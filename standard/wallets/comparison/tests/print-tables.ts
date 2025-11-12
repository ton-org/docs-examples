import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { WalletTestResult, toCoins } from './get-results';

type ColumnAlignment = 'left' | 'center' | 'right';

type ColumnConfig = {
  key: string;
  header: string;
  alignment: ColumnAlignment;
  enabled: boolean;
};

type RequestTimings = {
  realSeconds: number;
  theoreticalSeconds: number;
};

type TestRun = {
  messageCount: number;
  bodyName: string;
};

export type PrintTablesConfig = {
  allResults: WalletTestResult[][];
  testRuns: TestRun[];
  columnOrder: ColumnConfig[];
  requestTimings: RequestTimings;
  highloadWalletName: string;
  preprocessedWalletName: string;
  outputDirectory: string;
};

export const formatSeconds = (seconds: number): string => {
  const totalSeconds = Math.round(seconds);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${minutes}m ${secs}s`;
};

const trimCommonTrailingZeros = (values: string[]): string[] => {
  if (values.length === 0) return values;

  const numericValues = values.filter((v) => /^\d+\.\d+$/.test(v));
  if (numericValues.length !== values.length) return values;

  let commonTrailingZeros = Infinity;
  for (const value of values) {
    const decimals = value.split('.')[1];
    let trailingZeros = 0;
    for (let i = decimals.length - 1; i >= 0; i--) {
      if (decimals[i] === '0') {
        trailingZeros++;
      } else {
        break;
      }
    }
    commonTrailingZeros = Math.min(commonTrailingZeros, trailingZeros);
  }

  if (commonTrailingZeros >= 2) {
    return values.map((v) => {
      const [integer, decimals] = v.split('.');
      const trimmedDecimals = decimals.slice(0, decimals.length - commonTrailingZeros);
      return trimmedDecimals ? `${integer}.${trimmedDecimals}` : integer;
    });
  }

  return values;
};

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

const getAlignmentMarker = (alignment: ColumnAlignment): string => {
  switch (alignment) {
    case 'left':
      return ':---';
    case 'center':
      return ':---:';
    case 'right':
      return '---:';
  }
};

export async function printTables(config: PrintTablesConfig) {
  const {
    allResults,
    testRuns,
    columnOrder,
    requestTimings,
    highloadWalletName,
    preprocessedWalletName,
    outputDirectory,
  } = config;

  if (allResults.length === 0) return;

  const markdownLines: string[] = ['# Wallet Fee Comparison Results', ''];
  const numberFormatter = new Intl.NumberFormat('en-US');
  const tonFormatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 9,
    maximumFractionDigits: 9,
  });

  const resultsByBody = new Map<string, Array<{ results: WalletTestResult[]; runIndex: number }>>();

  allResults.forEach((results, runIndex) => {
    if (results.length === 0) return;

    const testRun = testRuns[runIndex];
    if (!resultsByBody.has(testRun.bodyName)) {
      resultsByBody.set(testRun.bodyName, []);
    }
    resultsByBody.get(testRun.bodyName)!.push({ results, runIndex });
  });

  const isHighloadResult = (result: WalletTestResult) => result.walletName === highloadWalletName;

  const formatRealTime = (result: WalletTestResult): string => {
    const seconds = isHighloadResult(result)
      ? requestTimings.realSeconds
      : result.requests * requestTimings.realSeconds;
    return formatSeconds(seconds);
  };

  const formatTheoreticalTime = (result: WalletTestResult): string => {
    const seconds = isHighloadResult(result)
      ? requestTimings.theoreticalSeconds
      : result.requests * requestTimings.theoreticalSeconds;
    return formatSeconds(seconds);
  };

  const createColumns = (
    gasPerMsgValues: bigint[],
    feePerMsgValues: bigint[],
    minGasPerMsg: bigint,
    minFeePerMsg: bigint,
  ) => {
    const columnAccessors: Record<
      string,
      {
        markdownAccessor: (result: WalletTestResult, index: number) => string;
        consoleAccessor: (result: WalletTestResult, index: number) => string | number;
      }
    > = {
      walletVersion: {
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
      gasDelta: {
        markdownAccessor: (_result, idx) =>
          formatPercentDiffMarkdown(gasPerMsgValues[idx], minGasPerMsg),
        consoleAccessor: (_result, idx) =>
          formatPercentDiffPlain(gasPerMsgValues[idx], minGasPerMsg),
      },
      feeDelta: {
        markdownAccessor: (_result, idx) =>
          formatPercentDiffMarkdown(feePerMsgValues[idx], minFeePerMsg),
        consoleAccessor: (_result, idx) =>
          formatPercentDiffPlain(feePerMsgValues[idx], minFeePerMsg),
      },
      requests: {
        markdownAccessor: (result) => numberFormatter.format(result.requests),
        consoleAccessor: (result) => result.requests,
      },
      totalGas: {
        markdownAccessor: (result) => numberFormatter.format(Number(result.totalGas)),
        consoleAccessor: (result) => Number(result.totalGas),
      },
      gasPerMsg: {
        markdownAccessor: (_result, idx) => numberFormatter.format(Number(gasPerMsgValues[idx])),
        consoleAccessor: (_result, idx) => Number(gasPerMsgValues[idx]),
      },
      totalFee: {
        markdownAccessor: (result) => tonFormatter.format(toCoins(result.totalFee)),
        consoleAccessor: (result) => toCoins(result.totalFee),
      },
      feePerMsg: {
        markdownAccessor: (_result, idx) => tonFormatter.format(toCoins(feePerMsgValues[idx])),
        consoleAccessor: (_result, idx) => toCoins(feePerMsgValues[idx]),
      },
      realTime: {
        markdownAccessor: (result) => formatRealTime(result),
        consoleAccessor: (result) => formatRealTime(result),
      },
      theoryTime: {
        markdownAccessor: (result) => formatTheoreticalTime(result),
        consoleAccessor: (result) => formatTheoreticalTime(result),
      },
    };

    return columnOrder
      .filter((col) => col.enabled)
      .map((col) => ({
        header: col.header,
        alignment: col.alignment,
        markdownAccessor: columnAccessors[col.key].markdownAccessor,
        consoleAccessor: columnAccessors[col.key].consoleAccessor,
      }));
  };

  resultsByBody.forEach((runsData, bodyName) => {
    markdownLines.push(`## ${bodyName}`, '');

    runsData.forEach(({ results, runIndex }) => {
      const testRun = testRuns[runIndex];
      markdownLines.push(`### ${testRun.messageCount} Messages`, '');

      const mainResults = results.filter((r) => r.walletName !== preprocessedWalletName);
      const preprocessedResults = results.filter((r) => r.walletName === preprocessedWalletName);

      const mainGasPerMsgValues = mainResults.map((r) => r.totalGas / BigInt(r.messageCount));
      const mainFeePerMsgValues = mainResults.map((r) => r.totalFee / BigInt(r.messageCount));
      const minGasPerMsg =
        mainGasPerMsgValues.length > 0
          ? mainGasPerMsgValues.reduce(
              (min, val) => (val < min ? val : min),
              mainGasPerMsgValues[0],
            )
          : 0n;
      const minFeePerMsg =
        mainFeePerMsgValues.length > 0
          ? mainFeePerMsgValues.reduce(
              (min, val) => (val < min ? val : min),
              mainFeePerMsgValues[0],
            )
          : 0n;

      let mainColumns: ReturnType<typeof createColumns> | null = null;
      let mainAllRowCells: string[][] = [];
      let preprocessedColumns: ReturnType<typeof createColumns> | null = null;
      let preprocessedAllRowCells: string[][] = [];

      if (mainResults.length > 0) {
        mainColumns = createColumns(
          mainGasPerMsgValues,
          mainFeePerMsgValues,
          minGasPerMsg,
          minFeePerMsg,
        );
        mainAllRowCells = mainResults.map((result, idx) =>
          mainColumns!.map((column) => column.markdownAccessor(result, idx)),
        );
      }

      if (preprocessedResults.length > 0) {
        const preprocessedGasPerMsgValues = preprocessedResults.map(
          (r) => r.totalGas / BigInt(r.messageCount),
        );
        const preprocessedFeePerMsgValues = preprocessedResults.map(
          (r) => r.totalFee / BigInt(r.messageCount),
        );
        preprocessedColumns = createColumns(
          preprocessedGasPerMsgValues,
          preprocessedFeePerMsgValues,
          minGasPerMsg,
          minFeePerMsg,
        );
        preprocessedAllRowCells = preprocessedResults.map((result, idx) =>
          preprocessedColumns!.map((column) => column.markdownAccessor(result, idx)),
        );
      }

      const columns = mainColumns || preprocessedColumns;
      if (!columns) return;

      const columnIndices = {
        totalFee: columns.findIndex((c) => c.header === 'Total Fee (TON)'),
        feePerMsg: columns.findIndex((c) => c.header === 'Fee/Msg (TON)'),
      };

      if (columnIndices.totalFee >= 0) {
        const allTotalFeeValues = [
          ...mainAllRowCells.map((row) => row[columnIndices.totalFee]),
          ...preprocessedAllRowCells.map((row) => row[columnIndices.totalFee]),
        ];
        const trimmedTotalFee = trimCommonTrailingZeros(allTotalFeeValues);

        mainAllRowCells.forEach((row, idx) => {
          row[columnIndices.totalFee] = trimmedTotalFee[idx];
        });
        preprocessedAllRowCells.forEach((row, idx) => {
          row[columnIndices.totalFee] = trimmedTotalFee[mainAllRowCells.length + idx];
        });
      }

      if (columnIndices.feePerMsg >= 0) {
        const allFeePerMsgValues = [
          ...mainAllRowCells.map((row) => row[columnIndices.feePerMsg]),
          ...preprocessedAllRowCells.map((row) => row[columnIndices.feePerMsg]),
        ];
        const trimmedFeePerMsg = trimCommonTrailingZeros(allFeePerMsgValues);

        mainAllRowCells.forEach((row, idx) => {
          row[columnIndices.feePerMsg] = trimmedFeePerMsg[idx];
        });
        preprocessedAllRowCells.forEach((row, idx) => {
          row[columnIndices.feePerMsg] = trimmedFeePerMsg[mainAllRowCells.length + idx];
        });
      }

      if (mainResults.length > 0 && mainColumns) {
        const headerRow = `| ${mainColumns.map((column) => column.header).join(' | ')} |`;
        const separatorRow = `| ${mainColumns.map((column) => getAlignmentMarker(column.alignment)).join(' | ')} |`;
        markdownLines.push(headerRow, separatorRow);

        mainAllRowCells.forEach((rowCells) => {
          markdownLines.push(`| ${rowCells.join(' | ')} |`);
        });

        const consoleRows = mainResults.map((result, idx) => {
          const row: Record<string, string | number> = {};
          mainColumns.forEach((column) => {
            row[column.header] = column.consoleAccessor(result, idx);
          });
          return row;
        });

        console.log(`\n${testRun.bodyName} - ${testRun.messageCount} Messages`);
        console.table(consoleRows);

        markdownLines.push('');
      }

      if (preprocessedResults.length > 0 && preprocessedColumns) {
        markdownLines.push('**Preprocessed Wallet V2**', '');

        const headerRow = `| ${preprocessedColumns.map((column) => column.header).join(' | ')} |`;
        const separatorRow = `| ${preprocessedColumns.map((column) => getAlignmentMarker(column.alignment)).join(' | ')} |`;
        markdownLines.push(headerRow, separatorRow);

        preprocessedAllRowCells.forEach((rowCells) => {
          markdownLines.push(`| ${rowCells.join(' | ')} |`);
        });

        const consoleRows = preprocessedResults.map((result, idx) => {
          const row: Record<string, string | number> = {};
          preprocessedColumns.forEach((column) => {
            row[column.header] = column.consoleAccessor(result, idx);
          });
          return row;
        });

        console.log(`\nPreprocessed Wallet V2:`);
        console.table(consoleRows);

        markdownLines.push('');
      }
    });
  });

  const outputDir = path.resolve(outputDirectory, 'results');
  const outputFile = path.join(outputDir, 'wallet-fee-comparison.md');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputFile, markdownLines.join('\n'), { encoding: 'utf-8' });
  console.log(`Markdown report saved to ${outputFile}`);
}
