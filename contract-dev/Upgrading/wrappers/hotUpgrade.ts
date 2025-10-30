import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type HotUpgradeConfig = {
    adminAddress: Address;
    counter: bigint;
};

export function hotUpgradeConfigToCell(config: HotUpgradeConfig): Cell {
    return beginCell().storeAddress(config.adminAddress).storeUint(config.counter, 32).endCell();
}

export class HotUpgrade implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new HotUpgrade(address);
    }

    static createFromInit(init: { code: Cell; data: Cell }, workchain = 0) {
        return new HotUpgrade(contractAddress(workchain, init), init);
    }

    static createFromConfig(config: HotUpgradeConfig, code: Cell, workchain = 0) {
        const data = hotUpgradeConfigToCell(config);
        const init = { code, data };
        return new HotUpgrade(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendHotUpgrade(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        additionalData: Cell,
        newCode: Cell,
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x00001111, 32).storeMaybeRef(additionalData).storeRef(newCode).endCell(),
        });
    }

    async sendIncreaseCounter(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x00002222, 32).endCell(),
        });
    }

    async getHotUpgrade(provider: ContractProvider) {
        await provider.get(2121, []);
    }

    async getCounter(provider: ContractProvider) {
        const { stack } = await provider.get('counter', []);
        return stack.readNumber();
    }
}
