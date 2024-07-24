import { Hex } from "viem";
import { getSmartWalletAddress } from "@/utils/smartWalletUtils";

export async function POST(req: Request) {
  const { pubKey } = (await req.json()) as { pubKey: Hex };

  /**
   * Limitations: passkey owner needs to be the only initial owner in order for lookups to be accurate
   * This is because the smart wallet address depends on the owner's public key
   * Could implement a record which maps public keys to smart wallet addresses in the future
   */
  const smartWalletAddress = await getSmartWalletAddress({ pubKey });

  const createdUser = {
    account: smartWalletAddress,
    pubKey,
  };

  return Response.json(createdUser);
}
