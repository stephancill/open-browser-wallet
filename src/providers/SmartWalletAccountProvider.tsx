import { useQuery } from "@tanstack/react-query";
import { createContext, ReactNode, useContext } from "react";
import {
  SmartAccount,
  toCoinbaseSmartAccount,
  toWebAuthnAccount,
} from "viem/account-abstraction";
import { useClient, useConnect } from "wagmi";
import { smartWalletConnector } from "../lib/connector";
import { useSession } from "./SessionProvider";

interface SmartWalletAccountType {
  smartWalletAccount: SmartAccount | undefined | null;
  isLoading: boolean;
  error: Error | null;
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
    isLoading: isWalletLoading,
    data: smartWalletAccount,
    error: smartWalletError,
  } = useQuery({
    queryKey: ["smartWallet", user?.passkeyId],
    queryFn: async () => {
      if (!user) return null;

      const passkeyAccount = toWebAuthnAccount({
        credential: {
          id: user.passkeyId,
          publicKey: user.passkeyPublicKey,
        },
      });

      const smartWallet = await toCoinbaseSmartAccount({
        client,
        owners: [passkeyAccount],
      });

      const burnerConnector = smartWalletConnector({
        account: smartWallet,
      });

      await connectAsync({
        connector: burnerConnector,
      });

      return smartWallet;
    },
    enabled: !!user,
  });

  return (
    <SmartWalletAccountContext.Provider
      value={{
        smartWalletAccount,
        isLoading: isWalletLoading || isUserLoading,
        error: smartWalletError,
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
