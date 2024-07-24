import { Address, bytesToHex, Hex, hexToBytes } from "viem";
import { PUBLIC_CLIENT } from "../constants";
import { CSW_FACTORY_ABI as CoinbaseSmartWalletFactoryABI } from "@/constants/abi/CoinbaseSmartWalletFactory";
import { CSW_ABI } from "../constants/abi/CoinbaseSmartWallet";

export async function getSmartWalletAddress({ pubKey }: { pubKey: Hex }) {
  // Default nonce is 0 - this allows for a public key to own multiple smart wallets
  const nonce = BigInt(0);

  const smartWalletAddress = await PUBLIC_CLIENT.readContract({
    address: process.env.NEXT_PUBLIC_FACTORY_CONTRACT_ADDRESS as Hex,
    abi: CoinbaseSmartWalletFactoryABI,
    functionName: "getAddress",
    args: [[pubKey], nonce],
  });

  return smartWalletAddress;
}

export async function getReplaySafeHash({
  hash,
  address,
}: {
  hash: Hex;
  address: Address;
}): Promise<Hex> {
  const replaySafeHash = await PUBLIC_CLIENT.readContract({
    address,
    abi: CSW_ABI,
    functionName: "replaySafeHash",
    args: [hash],
  });

  return replaySafeHash;
}
