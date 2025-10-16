message SomeMessage {}
message NotifyParent {
    originalSender: Address;
}

const gasForProtocol: Int = 7000;

contract Parent {
    receive() { }

    receive(msg: NotifyParent) {
        cashback(msg.originalSender);
    }
}

contract Child(parent: Address) {
    receive() {}

    receive(msg: SomeMessage) {
        let ctx = context();

        require(
            ctx.value >
            2 * ctx.readForwardFee() + // Child -> Parent and Parent -> original sender
            getComputeFee(gasForProtocol, false),
            "Insufficient amount of TON attached",
        );

        message(MessageParameters {
            to: self.parent,
            body: NotifyParent {
                originalSender: sender(),
            }.toCell(),
            value: 0,
            mode: SendRemainingValue,
        });
    }
}
