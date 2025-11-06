/**
 * Configuration loader with environment variable support
 */

export interface Config {
    isMainnet: boolean;
    apiKey: string;
    walletAddress: string;
    startTime: number;
    pollInterval: number;
}

/**
 * Loads configuration from environment variables with fallback to defaults
 */
export function loadConfig(): Config {
    const isMainnet = process.env.IS_MAINNET === 'true';
    const apiKey = process.env.API_KEY || 'YOUR_API_KEY_HERE';
    const walletAddress = process.env.WALLET_ADDRESS || 'UQB7...5I';

    const startTime = process.env.START_TIME
        ? parseInt(process.env.START_TIME, 10)
        : Math.floor(Date.now() / 1000) - 3600; // Default: 1 hour ago

    const pollInterval = process.env.POLL_INTERVAL ? parseInt(process.env.POLL_INTERVAL, 10) : 10000; // Default: 10 seconds

    return {
        isMainnet,
        apiKey,
        walletAddress,
        startTime,
        pollInterval,
    };
}

/**
 * Gets the appropriate API endpoint based on network
 */
export function getApiEndpoint(isMainnet: boolean): string {
    return isMainnet ? 'https://toncenter.com/api/v2/jsonRPC' : 'https://testnet.toncenter.com/api/v2/jsonRPC';
}
