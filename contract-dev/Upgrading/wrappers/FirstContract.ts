import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type FirstContractConfig = {
    adminAddress: Address;
};

export function firstContractConfigToCell(config: FirstContractConfig): Cell {
    return beginCell()
        .storeAddress(config.adminAddress)
        .endCell();
}

export class FirstContract implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new FirstContract(address);
    }

    static createFromConfig(config: FirstContractConfig, code: Cell, workchain = 0) {
        const data = firstContractConfigToCell(config);
        const init = { code, data };
        return new FirstContract(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendUpgrade(provider: ContractProvider, via: Sender, value: bigint, newData: Cell | null, newCode: Cell | null) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x00001111, 32)
                .storeMaybeRef(newData)
                .storeMaybeRef(newCode)
                .endCell(),
        });
    }
}
