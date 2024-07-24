import { PUBLIC_CLIENT } from "@/constants";
import { getSmartWalletAddress } from "@/utils/smartWalletUtils";
import { Hex, stringify } from "viem";

export async function GET(_req: Request, { params }: { params: { pubKey: Hex } }) {
  const { pubKey } = params;
  if (!pubKey) {
    return Response.json(JSON.parse(stringify({ error: "pubkey is required" })));
  }

  const smartWalletAddress = await getSmartWalletAddress({ pubKey });

  const balance = await PUBLIC_CLIENT.getBalance({ address: smartWalletAddress });

  const createdUser = {
    account: smartWalletAddress,
    pubKey,
  };

  return Response.json(JSON.parse(stringify({ ...createdUser, balance })));
}
