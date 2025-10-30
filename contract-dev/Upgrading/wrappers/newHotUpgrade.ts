import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type NewHotUpgradeConfig = {
    adminAddress: Address;
    counter: bigint;
    metadata: Cell;
};

export function newHotUpgradeConfigToCell(config: NewHotUpgradeConfig): Cell {
    return beginCell()
        .storeUint(config.counter, 32)
        .storeAddress(config.adminAddress)
        .storeRef(config.metadata)
        .endCell();
}

export class NewHotUpgrade implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new NewHotUpgrade(address);
    }

    static createFromInit(init: { code: Cell; data: Cell }, workchain = 0) {
        return new NewHotUpgrade(contractAddress(workchain, init), init);
    }

    static createFromConfig(config: NewHotUpgradeConfig, code: Cell, workchain = 0) {
        const data = newHotUpgradeConfigToCell(config);
        const init = { code, data };
        return new NewHotUpgrade(contractAddress(workchain, init), init);
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
        additionalData: Cell | null,
        newCode: Cell | null,
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x00001111, 32).storeMaybeRef(additionalData).storeMaybeRef(newCode).endCell(),
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

    async getMetadata(provider: ContractProvider) {
        const { stack } = await provider.get('metadata', []);
        return stack.readCell();
    }

    async getCounter(provider: ContractProvider) {
        const { stack } = await provider.get('counter', []);
        return stack.readNumber();
    }
}
