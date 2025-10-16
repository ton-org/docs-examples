import { beginCell, SendMode, toNano } from "@ton/core";
import { Blockchain } from "@ton/sandbox";
import "@ton/test-utils";
import { Parent, SomeMessage, NotifyParent, storeNotifyParent } from "./output/sample_Parent";
import { Child } from "./output/sample_Child";

describe("parent", () => {
    const setup = async () => {
        const blockchain = await Blockchain.create({ config: "slim" });
        
        const owner = await blockchain.treasury("deployer");
        const user = await blockchain.treasury("user");

        const contract = blockchain.openContract(await Parent.fromInit());
    
        const deployResult = await contract.send(owner.getSender(), { value: toNano(0.5) }, null);
        
        return { blockchain, owner, user, contract, deployResult };
    }

    it("should deploy correctly", async () => {
        const { owner, contract, deployResult } = await setup();
        
        expect(deployResult.transactions).toHaveTransaction({
            from: owner.address,
            to: contract.address,
            deploy: true,
            success: true,
        });
    });

    it("should return funds to original sender", async () => {
        const { user, owner, contract } = await setup();

        const message: NotifyParent = {
            $$type: "NotifyParent",
            originalSender: owner.address, // just another address for the test
        };
        
        const cashbackResult = await contract.send(user.getSender(), { value: toNano(0.1) }, message);

        expect(cashbackResult.transactions).toHaveTransaction({
            from: contract.address,
            to: owner.address,
            body: beginCell().endCell(), // empty body
            mode: SendMode.CARRY_ALL_REMAINING_INCOMING_VALUE + SendMode.IGNORE_ERRORS, // cashback mode
        });
    });
});


describe("child", () => {
    const setup = async () => {
        const blockchain = await Blockchain.create({ config: "slim" });
        
        const owner = await blockchain.treasury("deployer");
        const user = await blockchain.treasury("user");
    
        const contract = await blockchain.openContract(
            await Child.fromInit(owner.address) // parent address is just any address for the test
        );  

        const deployResult = await contract.send(owner.getSender(), { value: toNano(0.5) }, null);

        return { blockchain, owner, user, contract, deployResult };
    }

    it("should deploy correctly", async () => {
        const { owner, contract, deployResult } = await setup();
        
        expect(deployResult.transactions).toHaveTransaction({
            from: owner.address,
            to: contract.address,
            deploy: true,
            success: true,
        });
    });

    it("should send message to parent", async () => {
        const { user, owner, contract } = await setup();

        const message: SomeMessage = {
            $$type: "SomeMessage",
        };
        
        const sendResult = await contract.send(user.getSender(), { value: toNano(0.1) }, message);

        const expectedMessage: NotifyParent = {
            $$type: "NotifyParent",
            originalSender: user.address,
        };

        const expectedBody = beginCell().store(storeNotifyParent(expectedMessage)).endCell();


        expect(sendResult.transactions).toHaveTransaction({
            from: contract.address,
            to: owner.address, // parent address
            body: expectedBody,
            mode: SendMode.CARRY_ALL_REMAINING_INCOMING_VALUE,
        });
    });
});

describe("protocol", () => {
    const setup = async () => {
        const blockchain = await Blockchain.create({ config: "slim" });
        
        const owner = await blockchain.treasury("deployer");
        const user = await blockchain.treasury("user");

        const parent = await blockchain.openContract(await Parent.fromInit());
        const child = await blockchain.openContract(await Child.fromInit(parent.address));

        const deployParentResult = await parent.send(owner.getSender(), { value: toNano(0.5) }, null);
        const deployChildResult = await child.send(owner.getSender(), { value: toNano(0.5) }, null);

        return { blockchain, owner, user, parent, child, deployParentResult, deployChildResult };
    }

    it("should parent deploy correctly", async () => {
        const { owner, parent, deployParentResult } = await setup();
        
        expect(deployParentResult.transactions).toHaveTransaction({
            from: owner.address,
            to: parent.address,
            deploy: true,
            success: true,
        });
    });

    it("should child deploy correctly", async () => {
        const { owner, child, deployChildResult } = await setup();
        
        expect(deployChildResult.transactions).toHaveTransaction({
            from: owner.address,
            to: child.address,
            deploy: true,
            success: true,
        });
    });
    
    it("should send message from parent on SomeMessage to child", async () => {
        const { user, child, parent } = await setup();

        const message: SomeMessage = {
            $$type: "SomeMessage",
        };
        
        const sendResult = await child.send(user.getSender(), { value: toNano(0.1) }, message);
        
        expect(sendResult.transactions).toHaveTransaction({
            from: parent.address,
            to: user.address,
            body: beginCell().endCell(), // empty body
            mode: SendMode.CARRY_ALL_REMAINING_INCOMING_VALUE + SendMode.IGNORE_ERRORS, // cashback mode
        });

        // console.log(getComputeGasForTx(sendResult.transactions[1]) + getComputeGasForTx(sendResult.transactions[2])) // on child and  on parent, first tx is on wallet 
    });

    // 0.003732400 TON  
    test.skip("find minimal amount of TON for protocol", async () => {
        const checkAmount = async (amount: bigint) => {
            const { user, child, parent } = await setup();

            const message: SomeMessage = {
                $$type: "SomeMessage",
            };
            
            const sendResult = await child.send(user.getSender(), { value: amount }, message);
            
            expect(sendResult.transactions).toHaveTransaction({
                from: parent.address,
                to: user.address,
                body: beginCell().endCell(), // empty body
                mode: SendMode.CARRY_ALL_REMAINING_INCOMING_VALUE + SendMode.IGNORE_ERRORS, // cashback mode
            });
        };

        let L = 0n;
        let R = toNano(10);

        while(L + 1n < R) {
            let M = (L + R) / 2n;

            try { 
                await checkAmount(M);
                R = M;
            } catch (error) {
                L = M;
            }
        }

        console.log(R, "is the minimal amount of nanotons for protocol");
    });
});
