"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { WalletConnectView } from "../components/WalletConnect";
import { AuthLayout } from "../layouts/AuthLayout";
import { useSession } from "../providers/SessionProvider";
import { useSmartWalletAccount } from "../providers/SmartWalletAccountProvider";

export default function Home() {
  const { user, isLoading: isUserLoading, logout } = useSession();
  const account = useAccount();
  const { isLoading: isWalletLoading } = useSmartWalletAccount();

  if (!isUserLoading && !user) {
    return (
      <div>
        <div>
          <Link href="/login">Login</Link>
        </div>
        <div>
          <Link href="/sign-up">Sign Up</Link>
        </div>
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
        <WalletConnectView />
      </div>
    </AuthLayout>
  );
}
