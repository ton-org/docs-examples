import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { HotUpgrade, hotUpgradeConfigToCell } from '../wrappers/hotUpgrade';
import { NewHotUpgrade, newHotUpgradeConfigToCell } from '../wrappers/newHotUpgrade';

const checkCounter = (codeName: string, createDataFromDefault: (adminAddress: Address, counter: bigint) => Cell) => {
    describe('check counter', () => {
        const setup = async () => {
            const blockchain = await Blockchain.create();
            const deployer = await blockchain.treasury('deployer');
            const user = await blockchain.treasury('user');

            const code = await compile(codeName);

            const contract = blockchain.openContract(
                HotUpgrade.createFromInit({ code, data: createDataFromDefault(deployer.address, BigInt(0)) }, 0),
            );

            const deployResult = await contract.sendDeploy(deployer.getSender(), toNano('0.05'));

            return { blockchain, deployer, user, contract, deployResult };
        };

        it('should deploy', async () => {
            const { deployer, contract, deployResult } = await setup();

            expect(deployResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: contract.address,
                deploy: true,
                success: true,
            });
        });

        it('should have counter get_method', async () => {
            const { contract } = await setup();
            const counter = await contract.getCounter();

            expect(counter).toEqual(0);
        });

        it('should increase counter', async () => {
            const { contract, user } = await setup();

            const result = await contract.sendIncreaseCounter(user.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: user.address,
                to: contract.address,
                success: true,
            });

            const counter = await contract.getCounter();
            expect(counter).toEqual(1);
        });

        it('should have hotUpgrade function', async () => {
            const { contract } = await setup();
            try {
                await contract.getHotUpgrade();
            } catch (error: any) {
                expect(error.exitCode).not.toBe(11); // 11 is the exit code if there is no method
            }
        });
    });
};

describe('HotUpgrade', () => {
    const createDataFromDefault = (adminAddress: Address, counter: bigint) =>
        hotUpgradeConfigToCell({ adminAddress, counter });
    checkCounter('HotUpgrade', createDataFromDefault);

    const setup = async () => {
        const blockchain = await Blockchain.create();
        const deployer = await blockchain.treasury('deployer');
        const user = await blockchain.treasury('user');

        const code = await compile('HotUpgrade');

        const newCode = await compile('NewHotUpgrade');
        const metadata = beginCell().storeStringTail('metadata').endCell();

        const contract = blockchain.openContract(
            HotUpgrade.createFromInit({ code, data: createDataFromDefault(deployer.address, BigInt(0)) }, 0),
        );

        return { blockchain, deployer, user, contract, newCode, metadata };
    };

    it('should process hot update contract', async () => {
        const { deployer, contract, newCode, metadata } = await setup();

        const result = await contract.sendHotUpgrade(deployer.getSender(), toNano('0.05'), metadata, newCode);

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: contract.address,
            success: true,
        });
    });

    it('should hot update code in contract', async () => {
        const { deployer, contract, newCode, metadata, blockchain } = await setup();

        await contract.sendHotUpgrade(deployer.getSender(), toNano('0.05'), metadata, newCode);

        const newAccountState = (await blockchain.getContract(contract.address)).accountState;

        if (newAccountState?.type !== 'active') {
            throw new Error('contract is not active');
        }

        const updatedCode = newAccountState?.state.code;

        expect(updatedCode).toEqualCell(newCode);
    });

    it('should hot update data in contract', async () => {
        const { deployer, contract, newCode, metadata, blockchain } = await setup();

        await contract.sendHotUpgrade(deployer.getSender(), toNano('0.05'), metadata, newCode);

        const newAccountState = (await blockchain.getContract(contract.address)).accountState;

        if (newAccountState?.type !== 'active') {
            throw new Error('contract is not active');
        }

        const updatedData = newAccountState?.state.data;

        expect(updatedData).toEqualCell(
            newHotUpgradeConfigToCell({ adminAddress: deployer.address, counter: BigInt(0), metadata }),
        );
    });

    it('should have metadata get_method after update', async () => {
        const { contract, deployer, newCode, metadata, blockchain } = await setup();

        await contract.sendHotUpgrade(deployer.getSender(), toNano('0.05'), metadata, newCode);

        // just open new interface, contract address is same
        const updatedContract = blockchain.openContract(NewHotUpgrade.createFromAddress(contract.address));

        const newMetadata = await updatedContract.getMetadata();
        expect(newMetadata).toEqualCell(metadata);
    });
});

describe('NewHotUpgrade', () => {
    const metadata = beginCell().storeStringTail('metadata').endCell();
    const createDataFromDefault = (adminAddress: Address, counter: bigint) =>
        newHotUpgradeConfigToCell({ adminAddress, counter, metadata });

    checkCounter('NewHotUpgrade', createDataFromDefault);
});
