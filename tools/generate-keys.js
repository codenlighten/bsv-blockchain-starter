import bsv from 'smartledger-bsv';


async function generateKeys() {
    const privateKey = bsv.PrivateKey.fromRandom();
    const publicKey = privateKey.toPublicKey();
    const address = bsv.Address.fromPublicKey(publicKey);

    console.log("Private Key (WIF):", privateKey.toWIF());
    console.log("Public Key:", publicKey.toString());
    console.log("Address:", address.toString());
    const keys = {
        privateKey: privateKey.toWIF(),
        publicKey: publicKey.toString(),
        address: address.toString()
    };
    return keys;
}

generateKeys();