"use client";

import { CHAIN } from "@/constants";
import { useSmartWalletHook } from "@/libs/smart-wallet/hook/useSmartWalletHook";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { useContext } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";

const queryClient = new QueryClient();
const wagmiConfig = createConfig({
  chains: [CHAIN],
  transports: {
    [CHAIN.id]: http(),
  },
});

const SmartWalletContext = React.createContext<UseSmartWallet | null>(null);

export function SmartWalletProvider({ children }: { children: React.ReactNode }) {
  const smartWalletValue = useSmartWalletHook();

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SmartWalletContext.Provider value={smartWalletValue}>
          {children}
        </SmartWalletContext.Provider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export const useWalletConnect = (): UseSmartWallet => {
  const context = useContext(SmartWalletContext);
  if (!context) {
    throw new Error("useSmartWalletHook must be used within a SmartWalletProvider");
  }
  return context;
};

type UseSmartWallet = ReturnType<typeof useSmartWalletHook>;
