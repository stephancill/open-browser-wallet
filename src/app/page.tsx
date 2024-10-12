"use client";

import { AuthLayout } from "../layouts/AuthLayout";
import { useSession } from "../providers/SessionProvider";
import {
  toCoinbaseSmartAccount,
  toWebAuthnAccount,
} from "viem/account-abstraction";
import { useClient, useConnect, useAccount } from "wagmi";
import { smartWalletConnector } from "../lib/connector";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { WalletView } from "../components/WalletView";
import { ShopView } from "../components/ShopView";

export default function Home() {
  const { user, isLoading: isUserLoading, logout } = useSession();
  const client = useClient();
  const { connectAsync } = useConnect();
  const account = useAccount();

  const { isLoading: isWalletLoading } = useQuery({
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
    throwOnError: true,
  });

  if (!isUserLoading && !user) {
    return (
      <div>
        <Link href="/login">Login</Link>
        <Link href="/sign-up">Sign Up</Link>
      </div>
    );
  }

  return (
    <AuthLayout>
      <div>
        <h1>Open Browser Wallet</h1>
        <pre>{JSON.stringify(user, null, 2)}</pre>
        <div>Connected: {isWalletLoading ? "Loading..." : account.address}</div>
        <button onClick={logout}>Logout</button>
        <WalletView />
        <ShopView />
      </div>
    </AuthLayout>
  );
}
