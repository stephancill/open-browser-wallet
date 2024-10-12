/**
 * Based on https://github.com/scaffold-eth/burner-connector
 */

import type {
  EIP1193RequestFn,
  Hex,
  SendTransactionParameters,
  SignTypedDataParameters,
  Transport,
  WalletRpcSchema,
} from "viem";
import {
  BaseError,
  createPublicClient,
  custom,
  fromHex,
  getAddress,
  http,
  SwitchChainError,
} from "viem";
import {
  createBundlerClient,
  createPaymasterClient,
  SmartAccount,
} from "viem/account-abstraction";
import { hexToBigInt, numberToHex } from "viem/utils";
import { createConnector } from "wagmi";
import { chains } from "./wagmi";
import { base } from "viem/chains";

export class ConnectorNotConnectedError extends BaseError {
  override name = "ConnectorNotConnectedError";
  constructor() {
    super("Connector not connected.");
  }
}

export class ChainNotConfiguredError extends BaseError {
  override name = "ChainNotConfiguredError";
  constructor() {
    super("Chain not configured.");
  }
}

type Provider = ReturnType<
  Transport<"custom", Record<any, any>, EIP1193RequestFn<WalletRpcSchema>>
>;

export const connectorId = "passkeySmartWallet" as const;
export const connectorName = "Passkey Smart Wallet" as const;

function formatBundlerRpcUrl(chainId: number) {
  // API endpoint proxies requests to https://api.pimlico.io
  return `/api/bundler/v2/${chainId}/rpc`;
}

const bundlerTransports = Object.fromEntries(
  chains.map((chain) => [chain.id, http(formatBundlerRpcUrl(chain.id))])
);

const paymasterTransports = Object.fromEntries(
  chains.map((chain) => [chain.id, http(`/api/paymaster?chainId=${chain.id}`)])
);

export const smartWalletConnector = ({
  account,
}: {
  account: SmartAccount;
}) => {
  let connected = true;
  let connectedChainId: number;

  return createConnector<Provider>((config) => ({
    id: connectorId,
    name: connectorName,
    type: connectorId,
    async connect({ chainId } = {}) {
      const provider = await this.getProvider();
      const accounts = await provider.request({
        method: "eth_accounts",
      });
      let currentChainId = await this.getChainId();
      if (chainId && currentChainId !== chainId && this.switchChain) {
        const chain = await this.switchChain({ chainId });
        currentChainId = chain.id;
      }
      connected = true;
      return { accounts, chainId: currentChainId };
    },
    async getProvider({ chainId } = {}) {
      const request: EIP1193RequestFn = async ({ method, params }) => {
        const chain =
          config.chains.find((x) => x.id === chainId || connectedChainId) ??
          config.chains[0];

        const transport =
          config.transports?.[chain.id] ?? http(chain.rpcUrls.default.http[0]);
        if (!transport) throw new Error("No transport found for chain");

        const rpcClient = createPublicClient({
          chain: chain,
          transport,
        });

        const paymasterClient = createPaymasterClient({
          transport: bundlerTransports[chain.id],
        });

        const bundlerClient = createBundlerClient({
          chain,
          account,
          transport: bundlerTransports[chain.id],
          paymaster: paymasterClient,
          userOperation: {
            async estimateFeesPerGas(parameters) {
              const estimatedFees = await rpcClient.estimateFeesPerGas();
              return {
                ...estimatedFees,
                maxFeePerGas: BigInt(
                  Math.round(Number(estimatedFees.maxFeePerGas) * 1.12) // pimlico bundler needs a buffer
                ),
                maxPriorityFeePerGas: BigInt(
                  Math.round(Number(estimatedFees.maxPriorityFeePerGas) * 1.12) // pimlico bundler needs a buffer
                ),
              };
            },
          },
        });

        if (method === "eth_requestAccounts") {
          return [account.address];
        }

        if (method === "eth_sendTransaction") {
          const actualParams = (params as SendTransactionParameters[])[0];

          if (!actualParams?.to) {
            throw new Error("to is required");
          }

          const hash = await bundlerClient.sendUserOperation({
            calls: [
              {
                data: actualParams?.data,
                to: actualParams?.to,
                value: actualParams?.value
                  ? hexToBigInt(actualParams.value as unknown as Hex)
                  : undefined,
                // gas: actualParams?.gas
                //   ? hexToBigInt(actualParams.gas as unknown as Hex)
                //   : undefined,
                // nonce: actualParams?.nonce
                //   ? hexToBigInt(actualParams.nonce as unknown as Hex)
                //   : undefined,
                // maxPriorityFeePerGas: actualParams?.maxPriorityFeePerGas
                //   ? hexToBigInt(
                //       actualParams.maxPriorityFeePerGas as unknown as Hex
                //     )
                //   : undefined,
                // maxFeePerGas: actualParams?.maxFeePerGas
                //   ? hexToBigInt(actualParams.maxFeePerGas as unknown as Hex)
                //   : undefined,
                // gasPrice: (actualParams?.gasPrice
                //   ? hexToBigInt(actualParams.gasPrice as unknown as Hex)
                //   : undefined) as undefined,
              },
            ],
          });

          const tx = await bundlerClient.waitForUserOperationReceipt({
            hash,
          });

          return tx.receipt.transactionHash;
        }

        if (method === "personal_sign") {
          // first param is Hex data representation of message,
          // second param is address of the signer
          const rawMessage = (params as [`0x${string}`, `0x${string}`])[0];
          const signature = await account.signMessage({
            message: { raw: rawMessage },
          });

          return signature;
        }

        if (method === "eth_signTypedData_v4") {
          // first param is address of the signer
          // second param is stringified typed data
          const [_, typedData] = params as [
            `0x${string}`,
            SignTypedDataParameters,
          ];

          const signature = await account.signTypedData(typedData);

          return signature;
        }

        if (method === "eth_accounts") {
          return [account.address];
        }

        if (method === "wallet_switchEthereumChain") {
          type Params = [{ chainId: Hex }];
          connectedChainId = fromHex((params as Params)[0].chainId, "number");
          this.onChainChanged(connectedChainId.toString());
          return;
        }

        const body = { method, params };
        const result = (await transport({ chain }).request(body)) as any;
        return result;
      };

      return custom({ request })({ retryCount: 0 });
    },
    onChainChanged(chain) {
      const chainId = Number(chain);
      config.emitter.emit("change", { chainId });
    },
    async getAccounts() {
      if (!connected) throw new ConnectorNotConnectedError();
      const provider = await this.getProvider();
      const accounts = await provider.request({ method: "eth_accounts" });
      const walletAddress = accounts.map((x) =>
        getAddress(x)
      )[0] as `0x${string}`;
      return [walletAddress];
    },
    async onDisconnect() {
      config.emitter.emit("disconnect");
      connected = false;
    },
    async getChainId() {
      const provider = await this.getProvider();
      const hexChainId = await provider.request({ method: "eth_chainId" });
      return fromHex(hexChainId, "number");
    },
    async isAuthorized() {
      if (!connected) return false;
      const accounts = await this.getAccounts();
      return !!accounts.length;
    },
    onAccountsChanged(accounts) {
      if (accounts.length === 0) this.onDisconnect();
      else
        config.emitter.emit("change", {
          accounts: accounts.map((x) => getAddress(x)),
        });
    },
    async switchChain({ chainId }) {
      const provider = await this.getProvider();
      const chain = config.chains.find((x) => x.id === chainId);
      if (!chain) throw new SwitchChainError(new ChainNotConfiguredError());

      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: numberToHex(chainId) }],
      });
      return chain;
    },
    disconnect() {
      console.log("disconnect from passkey smart wallet");
      connected = false;
      return Promise.resolve();
    },
  }));
};
