"use client";

import { useEffect } from "react";
import { AuthLayout } from "../layouts/AuthLayout";
import { useSession } from "../providers/SessionProvider";
import {
  toCoinbaseSmartAccount,
  toWebAuthnAccount,
} from "viem/account-abstraction";
import { useClient, useConnect, useAccount } from "wagmi";
import { passkey } from "../lib/passkey-wallet-connector";
import { useQuery } from "@tanstack/react-query";

export default function Home() {
  const { user } = useSession();
  const client = useClient();
  const { connectAsync } = useConnect();
  const account = useAccount();

  const { data: smartWallet } = useQuery({
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

      const burnerConnector = passkey({
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

  return (
    <AuthLayout>
      <div>
        <h1>Open Browser Wallet</h1>
        <pre>{JSON.stringify(user, null, 2)}</pre>
        <div>Connected: {account.address}</div>
      </div>
    </AuthLayout>
  );
}
