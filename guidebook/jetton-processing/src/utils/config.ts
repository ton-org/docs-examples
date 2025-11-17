/**
 * Configuration loader for Toncoin payment processing
 *
 * Loads configuration from environment variables.
 * Throws errors if required configuration is missing.
 */

export interface Config {
    readonly isTestnet: boolean;
    readonly apiKey: string;
    readonly walletAddress: string;
    readonly apiUrl: string;
}

/**
 * Loads and validates configuration from environment variables
 * @throws {Error} if required configuration is missing
 */
export function loadConfig(): Config {
    const isTestnet = process.env.IS_TESTNET !== 'false';
    const apiKey = process.env.API_KEY;
    const walletAddress = process.env.WALLET_ADDRESS;

    if (!apiKey) {
        throw new Error('API_KEY environment variable is required. Get your key at https://toncenter.com');
    }

    if (!walletAddress) {
        throw new Error('WALLET_ADDRESS environment variable is required');
    }

    const apiUrl = isTestnet
        ? 'https://testnet.toncenter.com/api/v2/jsonRPC'
        : 'https://toncenter.com/api/v2/jsonRPC';

    return {
        isTestnet,
        apiKey,
        walletAddress,
        apiUrl,
    };
}
