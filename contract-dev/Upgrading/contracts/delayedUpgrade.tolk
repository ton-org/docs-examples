struct UpgradeContract {
    data: cell?
    code: cell?
}

struct CurrentRequest {
    newUpgrade: UpgradeContract
    timestamp: uint32
}

struct (0x00000001) RequestUpgrade {
    newUpgrade: UpgradeContract
}

struct (0x00000002) RejectUpgrade { }

struct (0x00000003) ApproveUpgrade { }

type AllowedMessages =
    | RequestUpgrade
    | RejectUpgrade
    | ApproveUpgrade

fun onInternalMessage(in: InMessage) {

    val msg = lazy AllowedMessages.fromSlice(in.body);

    match (msg) {

        RequestUpgrade => {
            var storage = lazy Storage.load();

            assert (in.senderAddress == storage.adminAddress) throw 100;
            assert (storage.CurrentRequest == null) throw 101;

            storage.CurrentRequest = {
                newUpgrade: msg.newUpgrade,
                timestamp: blockchain.now()
            };

            storage.save();
        }

        RejectUpgrade => {
            var storage = lazy Storage.load();

            assert (in.senderAddress == storage.adminAddress) throw 100;
            assert (storage.CurrentRequest != null) throw 201;

            storage.CurrentRequest = null;
            storage.save();
        }

        ApproveUpgrade => {
            var storage = lazy Storage.load();
            
            assert (in.senderAddress == storage.adminAddress) throw 100;
            assert (storage.CurrentRequest != null) throw 301;
            assert (storage.CurrentRequest!.timestamp + storage.timeout < blockchain.now()) throw 302;

            if (storage.CurrentRequest!.newUpgrade.code != null) {
                contract.setCodePostponed(storage.CurrentRequest!.newUpgrade.code!);
            }
            if (storage.CurrentRequest!.newUpgrade.data != null) {
                contract.setData(storage.CurrentRequest!.newUpgrade.data!);
            }
            storage.CurrentRequest = null;
            storage.save();
        }

        else => { 
            // just accepted tons 
        }
    }
}

get fun currentRequest() {
    var storage = lazy Storage.load();
    return storage.CurrentRequest;
}

struct Storage {
    adminAddress: address,
    timeout: uint32,
    CurrentRequest: CurrentRequest?
}

fun Storage.load() {
    return Storage.fromCell(contract.getData());
}

fun Storage.save(self) {
    contract.setData(self.toCell());
}