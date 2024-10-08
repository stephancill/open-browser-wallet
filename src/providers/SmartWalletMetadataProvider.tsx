/**
 * This provider is used to calculate and metadata about the connected smart wallet.
 *
 * smartWalletConnection is the wagmi connection for the smart wallet
 * ownerConnection is the wagmi connection for the owner of the smart wallet (must be able to sign raw messages)
 *  - If not present, owner metadata is not available
 */

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { Hex, padHex } from "viem";
import { useConnections, useReadContracts } from "wagmi";
import { coinbaseSmartWalletAbi } from "../abi/coinbaseSmartWallet";
import { connectorId as passkeyWalletConnectorId } from "../lib/passkey-wallet-connector";

const smartWalletConnectorId = passkeyWalletConnectorId;

interface SmartWalletMetadataType {
  smartWalletConnection: ReturnType<typeof useConnections>[0] | undefined;
  smartWalletAddress: Hex | undefined;
  ownerConnection: ReturnType<typeof useConnections>[0] | undefined;
  isOwnerAddress: boolean | undefined;
  ownerAddress: Hex | undefined;
  owners: Hex[] | undefined;
  ownerIndex: number | undefined;
}

const SmartWalletMetadataContext = createContext<
  SmartWalletMetadataType | undefined
>(undefined);

export function SmartWalletMetadataProvider({
  children,
}: {
  children: ReactNode;
}) {
  const connections = useConnections();

  const {
    smartWalletConnection,
    smartWalletAddress,
    ownerConnection,
    ownerAddress,
  } = useMemo(() => {
    const smartWalletConnection = connections.find(
      (connection) => connection.connector.id === smartWalletConnectorId
    );
    const smartWalletAddress = smartWalletConnection?.accounts[0];

    const ownerConnection = connections.find(
      (connection) => connection.connector.id !== smartWalletConnectorId
    );

    const ownerAddress = ownerConnection?.accounts[0];

    return {
      smartWalletConnection,
      smartWalletAddress,
      ownerConnection,
      ownerAddress,
    };
  }, [connections]);

  const { data: ownerMetadata, refetch: refetchOwnerMetadata } =
    useReadContracts({
      contracts: [
        {
          abi: coinbaseSmartWalletAbi,
          address: smartWalletAddress,
          functionName: "ownerCount",
          args: [],
        },
      ],
    });

  const [ownerCountResult] = ownerMetadata ?? [];

  const ownerCount = ownerCountResult?.result;

  const { data: ownersResult, refetch: refetchOwners } = useReadContracts({
    contracts: !!ownerCount
      ? Array.from({ length: Number(ownerCount) }, (_, i) => ({
          abi: coinbaseSmartWalletAbi,
          address: smartWalletAddress,
          functionName: "ownerAtIndex",
          args: [i],
        }))
      : undefined,
  });

  const owners = ownersResult?.map((owner) => owner.result as Hex);

  const ownerIndex = useMemo(() => {
    if (!ownerAddress) return undefined;

    return owners?.findIndex(
      (owner) => owner === padHex(ownerAddress, { size: 32 }).toLowerCase()
    );
  }, [owners, ownerAddress]);

  return (
    <SmartWalletMetadataContext.Provider
      value={{
        smartWalletConnection,
        smartWalletAddress,
        ownerConnection,
        ownerAddress,
        owners,
        isOwnerAddress: ownerIndex !== undefined && ownerIndex > -1,
        ownerIndex,
      }}
    >
      {children}
    </SmartWalletMetadataContext.Provider>
  );
}

export function useSmartWalletMetadata() {
  const context = useContext(SmartWalletMetadataContext);
  if (context === undefined) {
    throw new Error(
      "useSmartWalletMetadata must be used within a SmartWalletMetadataProvider"
    );
  }
  return context;
}
