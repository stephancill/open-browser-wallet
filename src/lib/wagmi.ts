import { HttpTransport } from "viem";
import { cookieStorage, createConfig, createStorage } from "wagmi";
import { base } from "wagmi/chains";
import { getTransportByChainId } from "./utils";

export const chains = [base] as const;

const transports = Object.fromEntries(
  chains.map((chain) => [chain.id, getTransportByChainId(chain.id)])
) as { [K in (typeof chains)[number]["id"]]: HttpTransport };

export const transportEndpoints = Object.fromEntries(
  chains.map((chain) => [chain.id, transports[chain.id]({ chain }).value?.url])
) as { [K in (typeof chains)[number]["id"]]: string };

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
