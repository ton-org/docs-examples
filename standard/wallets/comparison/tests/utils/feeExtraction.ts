import { Blockchain } from '@ton/sandbox';
import { beginCell, storeMessage } from '@ton/core';
import { computeCellForwardFees, getMsgPrices } from './gasUtils';

/**
 * Transaction fee components extracted from a transaction.
 * 
 * Note: According to TON documentation, msg_fwd_fees already includes the action fee.
 * For internal messages: msg_fwd_fees = action_fee + fwd_fee
 * where action_fee ≈ msg_fwd_fees * first_frac / 2^16
 * 
 * Reference: https://docs.ton.org/develop/howto/fees-low-level#forward-fee
 */
export type TransactionFees = {
    storage_fee: bigint;   // Storage fees collected during storage phase
    gas_fees: bigint;      // Computation fees (gas) from compute phase
    action_fees: bigint;   // Action phase fees for sending messages
    out_fwd_fees: bigint;  // Total forward fees for outbound messages (includes action_fees)
    import_fee: bigint;    // Import fee for external-in messages (0 for internal)
    in_fwd_fee: bigint;    // Forward fee for inbound internal messages (0 for external)
};

/**
 * Extracts fee components from a transaction.
 * 
 * @param tx - Transaction object to analyze
 * @param blockchain - Blockchain instance for config access (required for import_fee calculation)
 * @returns TransactionFees object with detailed fee breakdown
 */
export function extractTransactionFees(tx: any, blockchain: Blockchain): TransactionFees {
    const fees: TransactionFees = {
        storage_fee: 0n,
        gas_fees: 0n,
        action_fees: 0n,
        out_fwd_fees: 0n,
        import_fee: 0n,
        in_fwd_fee: 0n,
    };

    if (tx.description.type !== 'generic') {
        return fees;
    }

    // Storage fee
    fees.storage_fee = (tx.description.storagePhase?.storageFeesCollected ?? 0n) as bigint;

    // Compute phase: gas fees
    if (tx.description.computePhase.type === 'vm') {
        fees.gas_fees = tx.description.computePhase.gasFees as bigint;
    }

    // Action phase: fees for sending messages, setting code, etc.
    fees.action_fees = (tx.description.actionPhase?.totalActionFees ?? 0n) as bigint;

    // Action phase: total forward fees for outbound messages
    // Note: totalFwdFees includes action_fees (sender's share of msg_fwd_fees)
    fees.out_fwd_fees = (tx.description.actionPhase?.totalFwdFees ?? 0n) as bigint;

    // Inbound message fees (depends on message type)
    if (tx.inMessage?.info.type === 'external-in') {
        // External messages: import fee
        const msgPrices = getMsgPrices(blockchain.config, 0);

        const extMsgCell = beginCell().store(storeMessage(tx.inMessage)).endCell();
        fees.import_fee = computeCellForwardFees(msgPrices, extMsgCell);
    } else if (tx.inMessage?.info.type === 'internal') {
        // Internal messages: forward fee paid by sender
        fees.in_fwd_fee = tx.inMessage.info.forwardFee as bigint;
    }

    return fees;
}

