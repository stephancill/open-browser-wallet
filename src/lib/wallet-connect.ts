/**
 * Based on https://github.com/passkeys-4337/smart-wallet/blob/main/front/src/libs/wallet-connect
 */

import { chains } from "@/lib/wagmi";
import { Core } from "@walletconnect/core";
import { SessionTypes } from "@walletconnect/types";
import { buildApprovedNamespaces, getSdkError } from "@walletconnect/utils";
import {
  IWeb3Wallet,
  Web3Wallet,
  Web3WalletTypes,
} from "@walletconnect/web3wallet";
import { EventEmitter } from "events";

export const config: IWalletConnectConfig = {
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID,
  metadata: {
    name: "Airtime Wallet",
    description:
      "An open passkey-based browser wallet similar to keys.coinbase.com",
    url: "https://github.com/stephancill/open-browser-wallet",
    icons: [],
  },
};

interface IWalletConnectConfig {
  projectId: string;
  relayUrl?: string;
  metadata: Web3WalletTypes.Metadata;
}

export enum EIP155Method {
  PersonalSign = "personal_sign",
  EthSign = "eth_sign",
  EthSignTransaction = "eth_signTransaction",
  SignTypedData = "eth_signTypedData",
  SignTypedDataV3 = "eth_signTypedData_v3",
  SignTypedDataV4 = "eth_signTypedData_v4",
  EthSendRawTransaction = "eth_sendRawTransaction",
  EthSendTransaction = "eth_sendTransaction",
  SwitchChain = "wallet_switchEthereumChain",
  ChainId = "eth_chainId",
  AddChain = "wallet_addEthereumChain",
}

export enum EthEvent {
  AccountsChanged = "accountsChanged",
  ChainChanged = "chainChanged",
}

export enum WCEvent {
  sessionChanged = "session_changed",
  pairingApproved = "pairing_approved",
  pairingRejected = "pairing_rejected",
  MethodNotSupported = "method_not_supported",
  SessionRequest = "session_request",
  // EthSendTransaction = EIP155Method.EthSendTransaction,
  // ChainId = EIP155Method.ChainId,
  // SignTypedData = EIP155Method.SignTypedData,
  // SignTypedDataV3 = EIP155Method.SignTypedDataV3,
  // SignTypedDataV4 = EIP155Method.SignTypedDataV4,
  // PersonalSign = EIP155Method.PersonalSign,
}

export interface IPairingApprovedEventPayload {
  pairingTopic: string;
}

export interface IPairingRejectedEventPayload {
  pairingTopic: string;
  msg: string;
}

/**
 *  WalletConnect
 * @description
 * WalletConnect is a singleton class that manages the connection to the WalletConnect service.
 * It is responsible for initializing the connection, handling events, and managing sessions.
 *
 * */
class WalletConnect extends EventEmitter {
  public sessions: Record<string, SessionTypes.Struct> = {};
  private _walletAddress: string = "";
  private _web3wallet: IWeb3Wallet | null;

  constructor() {
    super();
    this.sessions = {};
    this._web3wallet = null;
  }
  public set smartWalletAddress(address: string) {
    this._walletAddress = address;
  }

  public async init({
    walletConnectConfig,
    walletAddress,
  }: {
    walletConnectConfig: IWalletConnectConfig;
    walletAddress: string;
  }): Promise<void> {
    this._walletAddress = walletAddress;

    const core = new Core({
      projectId: walletConnectConfig.projectId,
      // TODO: optimize relayerRegionURL base on user's location
      // relayUrl: relayerRegionURL ?? process.env.NEXT_PUBLIC_RELAY_URL,
    });

    this._web3wallet = await Web3Wallet.init({
      core,
      metadata: walletConnectConfig.metadata,
    });

    if (!this._web3wallet) throw new Error("Web3Wallet is not initialized");
    this._web3wallet.on("session_proposal", (event) =>
      this._onSessionProposal(event)
    );
    this._web3wallet.on("session_request", (event) =>
      this._onSessionRequest(event)
    );
    this._web3wallet.on("session_delete", () => this._onSessionDelete());
    this._setSessions();
  }

  public unsubscribe(): void {
    if (!this._web3wallet) return;
    this._web3wallet.off("session_proposal", (event) =>
      this._onSessionProposal(event)
    );
    this._web3wallet.off("session_request", (event) =>
      this._onSessionRequest(event)
    );
    this._web3wallet.off("session_delete", () => this._onSessionDelete());
  }

  public async pair(uri: string): Promise<void> {
    if (!this._web3wallet) return;
    await this._web3wallet.pair({ uri });
    this._setSessions();
  }

  public async disconnectSession(topic: string): Promise<void> {
    if (!this._web3wallet) return;
    await this._web3wallet.disconnectSession({
      topic,
      reason: getSdkError("USER_DISCONNECTED"),
    });
    this._setSessions();
  }

  public async extendSession(topic: string): Promise<void> {
    if (!this._web3wallet) return;
    await this._web3wallet.extendSession({
      topic,
    });
    this._setSessions();
  }

  public async updateSession({
    topic,
    namespaces,
  }: {
    topic: string;
    namespaces: SessionTypes.Namespaces;
  }): Promise<void> {
    if (!this._web3wallet) return;
    await this._web3wallet.updateSession({
      topic,
      namespaces,
    });
    this._setSessions();
  }

  public async emitSessionEvent(params: {
    topic: string;
    event: any;
    chainId: string;
  }): Promise<void> {
    if (!this._web3wallet) return;
    await this._web3wallet.emitSessionEvent(params);
    this._setSessions();
  }

  public async handleRequest(
    request: Omit<
      Parameters<typeof this._jsonRpcEventRouter>[0],
      "onSuccess" | "onReject"
    >
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      this._jsonRpcEventRouter({
        method: request.method,
        params: request.params,
        origin: request.origin,
        onSuccess: async (result) => {
          resolve(result);
        },
        onReject: async () => {
          const response = {
            jsonrpc: "2.0",
            error: {
              code: 5000,
              message: "User rejected.",
            },
          };
          reject(response);
        },
      });
    });
  }

  private async _onSessionProposal({
    id,
    params,
  }: Web3WalletTypes.SessionProposal) {
    if (!this._web3wallet) return;

    try {
      const approvedNamespaces = buildApprovedNamespaces({
        proposal: params,
        supportedNamespaces: {
          eip155: {
            chains: chains.map((chain) => `eip155:${chain.id}`),
            methods: Object.values(EIP155Method),
            events: [EthEvent.AccountsChanged, EthEvent.ChainChanged],
            accounts: this._getAccounts(
              chains.map((chain) => `eip155:${chain.id}`)
            ),
          },
        },
      });
      await this._web3wallet.approveSession({
        id,
        namespaces: approvedNamespaces,
      });
      this.emit(WCEvent.pairingApproved, {
        pairingTopic: params.pairingTopic,
      });
      this._setSessions();
    } catch (error) {
      await this._web3wallet.rejectSession({
        id,
        reason: getSdkError("USER_REJECTED"),
      });
      this.emit(WCEvent.pairingRejected, {
        pairingTopic: params.pairingTopic,
        msg: "Session rejected: the wallet does not support the requested chain and/or rpc methods",
      });
    }
  }

  private async _onSessionRequest(
    event: Web3WalletTypes.SessionRequest
  ): Promise<void> {
    if (!this._web3wallet) return;
    const { topic, params, id, verifyContext } = event;
    const { request } = params;

    this._jsonRpcEventRouter({
      method: request.method,
      params: request.params,
      origin: verifyContext.verified.origin?.split("https://")[1] ?? "",
      onSuccess: async (hash) => {
        const response = { id, result: hash, jsonrpc: "2.0" };
        await this._web3wallet?.respondSessionRequest({
          topic,
          response,
        });
        return;
      },
      onReject: async () => {
        const response = {
          id,
          jsonrpc: "2.0",
          error: {
            code: 5000,
            message: "User rejected.",
          },
        };
        await this._web3wallet?.respondSessionRequest({
          topic,
          response,
        });
        return;
      },
    });
  }

  private async _onSessionDelete(): Promise<void> {
    this._setSessions();
  }

  private _setSessions(): void {
    if (!this._web3wallet) return;
    this.sessions = this._web3wallet.getActiveSessions();
    this.emit(WCEvent.sessionChanged, this.sessions);
  }

  private _getAccounts(chains: string[]): string[] {
    const accounts = chains.map((chain) => {
      return `${chain}:${this._walletAddress}`;
    });

    return accounts;
  }

  private _jsonRpcEventRouter({
    method,
    params,
    origin,
    onSuccess,
    onReject,
  }: {
    method: string;
    params: any[];
    origin: string;
    onSuccess: (args: any) => void;
    onReject: () => Promise<void>;
  }) {
    this.emit(WCEvent.SessionRequest, {
      method,
      params,
      origin,
      onSuccess,
      onReject,
    });
  }
}

export const walletConnect = new WalletConnect();
