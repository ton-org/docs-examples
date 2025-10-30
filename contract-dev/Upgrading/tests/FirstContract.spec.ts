import { Blockchain } from '@ton/sandbox';
import { beginCell, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { FirstContract, firstContractConfigToCell } from '../wrappers/FirstContract';

describe('FirstContract', () => {
    const setup = async () => {
        const blockchain = await Blockchain.create();
        
        const deployer = await blockchain.treasury('deployer');
        const user = await blockchain.treasury('user');
        
        const firstCode = await compile('FirstContract');
        const firstData = firstContractConfigToCell({ adminAddress: deployer.address });
        
        const newCode = beginCell().storeStringTail('new code').endCell();
        const newData = beginCell().storeStringTail('new data').endCell();

        const firstContract = blockchain.openContract(
            FirstContract.createFromConfig({ adminAddress: deployer.address }, firstCode),
        );


        const deployResult = await firstContract.sendDeploy(deployer.getSender(), toNano('0.05'));

        return { blockchain, deployer, user, firstContract, deployResult, firstCode, firstData, newData, newCode };
    };

    it('should deploy', async () => {
        const { deployResult, deployer, firstContract } = await setup();

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: firstContract.address,
            deploy: true,
            success: true,
        });
    });

    it('should upgrade contract code and data', async () => {
        const { blockchain, deployer, firstContract, newData, newCode } = await setup();

        await firstContract.sendUpgrade(deployer.getSender(), toNano('0.05'), newData, newCode);

        const newAccountState = (await blockchain.getContract(firstContract.address)).accountState;
        if (newAccountState?.type !== 'active') {
            throw new Error('First contract is not active');
        }

        const updatedData = newAccountState?.state.data!;
        const updatedCode = newAccountState?.state.code!;
        
        expect(updatedCode).toEqualCell(newCode);
        expect(updatedData).toEqualCell(newData);
    });

    it('should upgrade contract data only', async () => {
        const { blockchain, deployer, firstContract, newData, firstCode } = await setup();


        await firstContract.sendUpgrade(deployer.getSender(), toNano('0.05'), newData, null);

        const newAccountState = (await blockchain.getContract(firstContract.address)).accountState;
        if (newAccountState?.type !== 'active') {
            throw new Error('First contract is not active');
        }

        const updatedData = newAccountState?.state.data!;
        const updatedCode = newAccountState?.state.code!;
        
        expect(updatedData).toEqualCell(newData);
        expect(updatedCode).toEqualCell(firstCode);
    });

    it('should upgrade contract code only', async () => {
        const { blockchain, deployer, firstContract, newCode, firstData } = await setup();

        await firstContract.sendUpgrade(deployer.getSender(), toNano('0.05'), null, newCode);

        const newAccountState = (await blockchain.getContract(firstContract.address)).accountState;
        if (newAccountState?.type !== 'active') {
            throw new Error('First contract is not active');
        }

        const updatedData = newAccountState?.state.data!;
        const updatedCode = newAccountState?.state.code!;

        expect(updatedCode).toEqualCell(newCode);
        expect(updatedData).toEqualCell(firstData);
    });

    it("should reject upgrade if not admin send message", async () => {
        const { user, firstContract, newData, newCode } = await setup();

        const result = await firstContract.sendUpgrade(user.getSender(), toNano('0.05'), newData, newCode);

        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: firstContract.address,
            success: false,
            exitCode: 1111,
        });
    });
});
