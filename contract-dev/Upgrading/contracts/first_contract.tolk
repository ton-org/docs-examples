struct (0x00001111) UpgradeContract {
    data: cell?
    code: cell?
}

type AllowedMessages =
    | UpgradeContract

fun onInternalMessage(in: InMessage) {

    val msg = lazy AllowedMessages.fromSlice(in.body);

    match (msg) {

        UpgradeContract => {
            var storage = lazy Storage.load();
            assert (in.senderAddress == storage.adminAddress) throw 1111;
            
            if (msg.data != null) {
                contract.setData(msg.data!);
            }

            if (msg.code != null) {
                contract.setCodePostponed(msg.code!);
            }
        } 

        else => { 
            // just accept TON 
        }
    }
}

struct Storage {
    adminAddress: address
}

fun Storage.load() {
    return Storage.fromCell(contract.getData());
}

fun Storage.save(self) {
    contract.setData(self.toCell());
}