import { coinbaseSmartWalletAbi } from "@/abi/coinbaseSmartWallet";
import { smartWalletConnector } from "@/lib/connector";
import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { Hex, padHex } from "viem";
import {
  SmartAccount,
  toCoinbaseSmartAccount,
  toWebAuthnAccount,
} from "viem/account-abstraction";
import {
  useClient,
  useConnect,
  useReadContract,
  useReadContracts,
} from "wagmi";
import { useSession } from "./SessionProvider";

interface SmartWalletAccountType {
  smartWalletAccount: SmartAccount | undefined | null;
  isLoading: boolean;
  error: Error | null;
  passkeyOwnerIndex: number | undefined;
  refetchOwners: () => void;
  owners: Hex[] | undefined;
}

const SmartWalletAccountContext = createContext<
  SmartWalletAccountType | undefined
>(undefined);

export function SmartWalletAccountProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { user, isLoading: isUserLoading, logout } = useSession();
  const client = useClient();
  const { connectAsync } = useConnect();

  const {
    data: ownerCount,
    isLoading: isOwnerCountLoading,
    refetch: refetchOwnerCount,
  } = useReadContract({
    abi: coinbaseSmartWalletAbi,
    address: user?.walletAddress,
    functionName: "ownerCount",
    args: [],
    query: {
      enabled: !!user?.importedAccountData,
    },
  });

  const { data: ownersResult, refetch: refetchOwners } = useReadContracts({
    contracts: !!ownerCount
      ? Array.from({ length: Number(ownerCount) }, (_, i) => ({
          abi: coinbaseSmartWalletAbi,
          address: user?.walletAddress,
          functionName: "ownerAtIndex",
          args: [i],
        }))
      : undefined,
    query: {
      enabled: !!user?.importedAccountData && !!ownerCount,
    },
  });

  const owners = ownersResult?.map((owner) => owner.result as Hex);

  const ownerIndex = useMemo(() => {
    if (!user?.passkeyPublicKey) return undefined;

    if (!user.importedAccountData) return 0; // Wallets created natively always have index 0

    return owners?.findIndex(
      (owner) =>
        owner === padHex(user.passkeyPublicKey, { size: 64 }).toLowerCase()
    );
  }, [owners, user?.passkeyPublicKey]);

  const {
    isLoading: isWalletLoading,
    data: smartWalletAccount,
    error: smartWalletError,
  } = useQuery({
    queryKey: ["smartWallet", user?.passkeyId],
    queryFn: async () => {
      if (!user) return null;

      if (user.importedAccountData && ownerIndex === undefined) return null;

      const passkeyAccount = toWebAuthnAccount({
        credential: {
          id: user.passkeyId,
          publicKey: user.passkeyPublicKey,
        },
      });

      const smartWallet = await toCoinbaseSmartAccount({
        address: user.walletAddress,
        client,
        owners: [passkeyAccount],
        // @ts-ignore -- patched into viem
        signatureOwnerIndex: ownerIndex,
      });

      const burnerConnector = smartWalletConnector({
        account: smartWallet,
      });

      await connectAsync({
        connector: burnerConnector,
      });

      return smartWallet;
    },
    enabled: !!user && ownerIndex !== undefined,
  });

  // Refetch owners when the owner count changes
  useEffect(() => {
    if (!ownerCount) return;
    refetchOwnerCount();
  }, [ownerCount]);

  return (
    <SmartWalletAccountContext.Provider
      value={{
        smartWalletAccount,
        isLoading:
          isWalletLoading ||
          isUserLoading ||
          (!!user?.importedAccountData && isOwnerCountLoading),
        error: smartWalletError,
        passkeyOwnerIndex: ownerIndex,
        refetchOwners: refetchOwnerCount,
        owners,
      }}
    >
      {children}
    </SmartWalletAccountContext.Provider>
  );
}

export function useSmartWalletAccount() {
  const context = useContext(SmartWalletAccountContext);
  if (context === undefined) {
    throw new Error(
      "useSmartWalletAccount must be used within a SmartWalletAccountProvider"
    );
  }
  return context;
}
