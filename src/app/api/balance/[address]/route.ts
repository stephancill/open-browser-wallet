import { Hex, stringify } from "viem";
import { PUBLIC_CLIENT } from "@/constants";

export async function GET(_req: Request, { params }: { params: { address: Hex } }) {
  const { address } = params;
  if (!address) {
    return Response.json(JSON.parse(stringify({ error: "address is required" })));
  }
  const balance = await PUBLIC_CLIENT.getBalance({ address });

  return Response.json(JSON.parse(stringify({ balance })));
}
