import { createContext, ReactNode, useContext } from "react";
import { connectorId as passkeyWalletConnectorId } from "../lib/passkey-wallet-connector";

const smartWalletConnectorId = passkeyWalletConnectorId;

interface SmartWalletAccountType {}

const SmartWalletAccountContext = createContext<
  SmartWalletAccountType | undefined
>(undefined);

export function SmartWalletAccountProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <SmartWalletAccountContext.Provider value={{}}>
      {children}
    </SmartWalletAccountContext.Provider>
  );
}

export function useSmartWalletMetadata() {
  const context = useContext(SmartWalletAccountContext);
  if (context === undefined) {
    throw new Error(
      "useSmartWalletMetadata must be used within a SmartWalletMetadataProvider"
    );
  }
  return context;
}
