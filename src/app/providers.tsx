"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { type State, WagmiProvider } from "wagmi";

import { getConfig } from "@/lib/wagmi";
import { WalletConnectProvider } from "../providers/WalletConnectProvider";
import { SmartWalletMetadataProvider } from "../providers/SmartWalletMetadataProvider";
import { SessionProvider } from "../providers/SessionProvider";

export function Providers(props: {
  children: ReactNode;
  initialState?: State;
}) {
  const [config] = useState(() => getConfig());
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config} initialState={props.initialState}>
      <QueryClientProvider client={queryClient}>
        <SmartWalletMetadataProvider>
          <WalletConnectProvider>
            <SessionProvider>{props.children}</SessionProvider>
          </WalletConnectProvider>
        </SmartWalletMetadataProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
