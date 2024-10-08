import { HttpTransport } from "viem";
import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { arbitrum, base, degen, mainnet, optimism } from "wagmi/chains";

export const chains = [mainnet, base, optimism, degen, arbitrum] as const;

const transports = Object.fromEntries(
  chains.map((chain) => [chain.id, http()])
) as { [K in (typeof chains)[number]["id"]]: HttpTransport };

export function getConfig() {
  return createConfig({
    chains,
    transports,
    connectors: [],
    storage: createStorage({
      storage: cookieStorage,
    }),
    ssr: true,
  });
}

declare module "wagmi" {
  interface Register {
    config: ReturnType<typeof getConfig>;
  }
}
