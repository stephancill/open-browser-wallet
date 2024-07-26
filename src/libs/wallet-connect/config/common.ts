import { IWalletConnectConfig } from "../service/wallet-connect";
import { EIP155_CHAINS } from "./EIP155";

export type WCChains = Record<string, WCChain>;

export type WCChain = {
  chainId: number;
  name: string;
  logo: string;
  rgb: string;
  rpc: string;
  namespace: string;
};

export enum EthEvent {
  AccountsChanged = "accountsChanged",
  ChainChanged = "chainChanged",
}

export const ALL_CHAINS: WCChains = {
  ...EIP155_CHAINS,
};

export const WC_CONFIG: IWalletConnectConfig = {
  projectId: "e8a450d0a41ce09a38c37ed5c6df736b",
  metadata: {
    name: "Open Browser Wallet",
    description: "An open passkey-based browser wallet similar to keys.coinbase.com",
    url: "https://github.com/stephancill/open-browser-wallet",
    icons: [],
  },
};
