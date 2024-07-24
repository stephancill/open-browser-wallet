import { createPublicClient, http } from "viem";
import { base, mainnet, optimism } from "viem/chains";

export const CHAIN = {
  ...base,
};

export const transport = http(process.env.NEXT_PUBLIC_RPC_ENDPOINT);

export const PUBLIC_CLIENT = createPublicClient({
  chain: base,
  transport: http(),
});

export const MAINNET_PUBLIC_CLIENT = createPublicClient({
  chain: mainnet,
  transport: http(),
});
