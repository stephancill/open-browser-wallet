"use client";

import { getConfig } from "@/lib/wagmi";
import { SessionProvider } from "@/providers/SessionProvider";
import { SmartWalletAccountProvider } from "@/providers/SmartWalletAccountProvider";
import { WalletConnectProvider } from "@/providers/WalletConnectProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { type State, WagmiProvider } from "wagmi";

export function Providers(props: {
  children: ReactNode;
  initialState?: State;
}) {
  const [config] = useState(() => getConfig());
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config} initialState={props.initialState}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <SmartWalletAccountProvider>
            <WalletConnectProvider>{props.children}</WalletConnectProvider>
          </SmartWalletAccountProvider>
        </SessionProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
