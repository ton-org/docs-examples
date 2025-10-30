import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { beginCell, Cell, toNano } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { DelayedUpgrade } from '../wrappers/delayedUpgrade';

const setup = async () => {
    const blockchain = await Blockchain.create();
    blockchain.now = Math.floor(Date.now() / 1000);

    const code = await compile('DelayedUpgrade');
    const deployer = await blockchain.treasury('deployer');
    const user = await blockchain.treasury('user');
    const timeout = 60 * 60 * 24 * 30; // 30 days

    const delayedUpgrade = blockchain.openContract(
        DelayedUpgrade.createFromConfig({ adminAddress: deployer.address, timeout }, code),
    );

    const deployResult = await delayedUpgrade.sendDeploy(deployer.getSender(), toNano('0.05'));

    const upgradeCode = beginCell().storeStringTail('upgrade code').endCell();
    const upgradeData = beginCell().storeStringTail('upgrade data').endCell();

    return { blockchain, deployer, delayedUpgrade, deployResult, code, upgradeCode, upgradeData, timeout, user };
};

describe('DelayedUpgrade', () => {
    it('should deploy', async () => {
        const { deployResult, deployer, delayedUpgrade } = await setup();

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: delayedUpgrade.address,
            deploy: true,
            success: true,
        });
    });

    it('should accept upgrade request', async () => {
        const { deployer, delayedUpgrade, upgradeCode, upgradeData } = await setup();

        const result = await delayedUpgrade.sendRequestUpgrade(
            deployer.getSender(),
            toNano('0.05'),
            upgradeCode,
            upgradeData,
        );
        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: delayedUpgrade.address,
            success: true,
        });

        const currentUpgrade = await delayedUpgrade.getCurrentRequest();

        expect(currentUpgrade).not.toBeNull();

        expect(currentUpgrade!.newCode).toEqualCell(upgradeCode);
        expect(currentUpgrade!.newData).toEqualCell(upgradeData);
        expect(currentUpgrade!.timestamp).toBeGreaterThan(0);
    });

    it('should not accept upgrade request if already has one', async () => {
        const { deployer, delayedUpgrade, upgradeCode, upgradeData } = await setup();

        await delayedUpgrade.sendRequestUpgrade(deployer.getSender(), toNano('0.05'), upgradeCode, upgradeData);
        const result = await delayedUpgrade.sendRequestUpgrade(
            deployer.getSender(),
            toNano('0.05'),
            upgradeCode,
            upgradeData,
        );

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: delayedUpgrade.address,
            success: false,
            exitCode: 101,
        });
    });

    it('should not accept upgrade request if not admin', async () => {
        const { delayedUpgrade, upgradeCode, upgradeData, user } = await setup();

        const result = await delayedUpgrade.sendRequestUpgrade(
            user.getSender(),
            toNano('0.05'),
            upgradeCode,
            upgradeData,
        );

        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: delayedUpgrade.address,
            success: false,
            exitCode: 100,
        });
    });

    const rejectSetup = async () => {
        const { deployer, delayedUpgrade, upgradeCode, upgradeData, user } = await setup();

        await delayedUpgrade.sendRequestUpgrade(deployer.getSender(), toNano('0.05'), upgradeCode, upgradeData);

        return { deployer, delayedUpgrade, upgradeCode, upgradeData, user };
    };

    it('should reject upgrade request', async () => {
        const { deployer, delayedUpgrade } = await rejectSetup();

        await delayedUpgrade.sendRejectUpgrade(deployer.getSender(), toNano('0.05'));

        const currentUpgrade = await delayedUpgrade.getCurrentRequest();

        expect(currentUpgrade).toBeNull();
    });

    it('should not reject upgrade request if not admin', async () => {
        const { delayedUpgrade, user } = await rejectSetup();

        const result = await delayedUpgrade.sendRejectUpgrade(user.getSender(), toNano('0.05'));
        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: delayedUpgrade.address,
            success: false,
            exitCode: 100,
        });
    });

    it('should not reject upgrade request if no request', async () => {
        const { deployer, delayedUpgrade } = await setup();

        const result = await delayedUpgrade.sendRejectUpgrade(deployer.getSender(), toNano('0.05'));
        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: delayedUpgrade.address,
            success: false,
            exitCode: 201,
        });
    });

    it('should not approve upgrade request before timeout', async () => {
        const { deployer, delayedUpgrade, upgradeCode, upgradeData } = await setup();

        await delayedUpgrade.sendRequestUpgrade(deployer.getSender(), toNano('0.05'), upgradeCode, upgradeData);

        const result = await delayedUpgrade.sendApproveUpgrade(deployer.getSender(), toNano('0.05'));

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: delayedUpgrade.address,
            success: false,
            exitCode: 302,
        });
    });

    it('should approve upgrade request after timeout', async () => {
        const { deployer, delayedUpgrade, upgradeCode, upgradeData, timeout, blockchain } = await setup();

        await delayedUpgrade.sendRequestUpgrade(deployer.getSender(), toNano('0.05'), upgradeCode, upgradeData);

        blockchain.now = Math.floor(Date.now() / 1000) + timeout + 1;

        const result = await delayedUpgrade.sendApproveUpgrade(deployer.getSender(), toNano('0.05'));

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: delayedUpgrade.address,
            success: true,
        });
    });

    it('should not approve upgrade request if no request', async () => {
        const { deployer, delayedUpgrade } = await setup();

        const result = await delayedUpgrade.sendApproveUpgrade(deployer.getSender(), toNano('0.05'));
        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: delayedUpgrade.address,
            success: false,
            exitCode: 301,
        });
    });

    it('should not approve upgrade request if not admin', async () => {
        const { delayedUpgrade, user } = await setup();

        const result = await delayedUpgrade.sendApproveUpgrade(user.getSender(), toNano('0.05'));
        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: delayedUpgrade.address,
            success: false,
            exitCode: 100,
        });
    });
});
