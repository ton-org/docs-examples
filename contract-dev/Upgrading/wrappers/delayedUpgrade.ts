import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type DelayedUpgradeConfig = {
    adminAddress: Address;
    timeout: number;
};

export function delayedUpgradeConfigToCell(config: DelayedUpgradeConfig): Cell {
    return beginCell().storeAddress(config.adminAddress).storeUint(config.timeout, 32).storeUint(0, 1).endCell();
}

export class DelayedUpgrade implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new DelayedUpgrade(address);
    }

    static createFromInit(init: { code: Cell; data: Cell }, workchain = 0) {
        return new DelayedUpgrade(contractAddress(workchain, init), init);
    }

    static createFromConfig(config: DelayedUpgradeConfig, code: Cell, workchain = 0) {
        const data = delayedUpgradeConfigToCell(config);
        const init = { code, data };
        return new DelayedUpgrade(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendRequestUpgrade(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        newData: Cell | null,
        newCode: Cell | null,
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x1, 32)
                .storeMaybeRef(newCode)
                .storeMaybeRef(newData)
                .storeUint(0, 32)
                .endCell(),
        });
    }

    async sendRejectUpgrade(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x2, 32).endCell(),
        });
    }

    async sendApproveUpgrade(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(0x3, 32).endCell(),
        });
    }

    async getCurrentRequest(provider: ContractProvider) {
        const { stack } = await provider.get('currentRequest', []);

        const newData = stack.readCellOpt();
        const newCode = stack.readCellOpt();
        const timestamp = stack.readNumberOpt();

        const type = stack.readNumber();

        if (type == 0) return null;

        return {
            newData,
            newCode,
            timestamp,
        };
    }
}
