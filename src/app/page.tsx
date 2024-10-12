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
import { LogOut } from "lucide-react";
import { Button } from "../components/Button";

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
      <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-65px)] gap-8">
        <div className="text-3xl font-bold">Open Browser Wallet</div>

        <div className="flex flex-col gap-4 mt-[30px]">
          <Link href="/sign-up" className="hover:no-underline">
            <Button>
              <div className="text-xl">Create account</div>
            </Button>
          </Link>
          <Link href="/login" className="text-gray-500">
            Sign in to existing account
          </Link>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <AuthLayout>
      <div className="flex flex-col">
        <div className="flex flex-col gap-8">
          <div className="flex px-4">
            <div className="text-3xl font-bold flex-grow">
              {user.phoneNumber}
            </div>
            <button className="border-none" onClick={logout}>
              <LogOut size={24} />
            </button>
          </div>
          <div className="mt-8 px-4">
            <WalletView />
          </div>
          <div className="bg-gray-100 h-[2px] rounded-full mx-4"></div>
          <div>
            <ShopView />
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}
