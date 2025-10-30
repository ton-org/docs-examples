import "@stdlib/tvm-lowlevel"

struct (0x00001111) HotUpgrade {
    additionalData: cell?
    code: cell
}

struct (0x00002222) IncreaseCounter {}

type AllowedMessages =
    | HotUpgrade
    | IncreaseCounter

@method_id(2121)
fun hotUpgradeData(additionalData: cell?) { return null; }

fun onInternalMessage(in: InMessage) {

    val msg = lazy AllowedMessages.fromSlice(in.body);

    match (msg) {

        HotUpgrade => {
            var storage = lazy Storage.load();
            assert (in.senderAddress == storage.adminAddress) throw 1111;
            
            contract.setCodePostponed(msg.code);

            setTvmRegisterC3(transformSliceToContinuation(msg.code.beginParse()));
            hotUpgradeData(msg.additionalData);
        } 

        IncreaseCounter => {
            var storage = lazy Storage.load();
            storage.counter += 1;
            storage.save();
        }

        else => { 
            // just accept TON 
        }
    }
}

get fun counter() {
    var storage = lazy Storage.load();
    return storage.counter;
}

struct Storage {
    adminAddress: address
    counter: uint32
}

fun Storage.load() {
    return Storage.fromCell(contract.getData());
}

fun Storage.save(self) {
    contract.setData(self.toCell());
}