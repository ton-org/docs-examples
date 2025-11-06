/**
 * Payment Link Generator
 *
 * Utility functions to generate payment deeplinks
 * for users to easily send deposits with the correct UUID.
 */

import { toNano } from '@ton/core';

export interface PaymentRequest {
    walletAddress: string;
    amount: bigint;
    comment: string;
}

/**
 * Generates a TON deeplink for payment
 *
 * @param request - Payment request details
 * @returns Deeplink string that opens user's wallet app
 *
 * @example
 * const link = generatePaymentLink({
 *   walletAddress: 'UQB7AhB4fP7SWtnfnIMcVUkwIgVLKqijlcpjNEPUVontys5I',
 *   amount: toNano('1.5'),
 *   comment: 'payment-uuid-123'
 * });
 * // Returns: ton://transfer/UQB7Ah...?amount=1500000000&text=payment-uuid-123
 */
export function generatePaymentLink(request: PaymentRequest): string {
    const { walletAddress, amount, comment } = request;

    // Encode the comment for URL safety
    const encodedComment = encodeURIComponent(comment);

    // Build the deeplink
    return `ton://transfer/${walletAddress}?amount=${amount}&text=${encodedComment}`;
}

/**
 * Generates a UUID for payment tracking
 * Simple implementation - in production, use a proper UUID library
 */
export function generatePaymentUUID(): string {
    return `payment-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Example usage
 */
export function createPaymentExample(): void {
    const walletAddress = 'UQB7...5I';
    const amount = toNano('1.5'); // 1.5 TON
    const uuid = generatePaymentUUID();

    console.log('=== Payment Request ===');
    console.log(`UUID: ${uuid}`);
    console.log(`Amount: 1.5 TON`);
    console.log();

    const deeplink = generatePaymentLink({
        walletAddress,
        amount,
        comment: uuid,
    });

    console.log('Deeplink (opens wallet app):');
    console.log(deeplink);
    console.log();

    console.log('User instructions:');
    console.log('1. Click the link above or scan QR code (create from the link)');
    console.log('2. Confirm the transaction in your wallet');
    console.log('3. Wait for confirmation');
}

// Run example if executed directly
if (require.main === module) {
    createPaymentExample();
}
