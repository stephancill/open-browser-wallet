"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SessionProvider, useSession } from "../providers/SessionProvider";
import { useSmartWalletAccount } from "../providers/SmartWalletAccountProvider";

interface AuthLayoutProps {
  children: React.ReactNode;
}

function AuthLayoutContent({ children }: AuthLayoutProps) {
  const router = useRouter();
  const { user, isLoading, isError } = useSession();
  const {
    ownerIndex,
    isLoading: isSmartWalletLoading,
    error: smartWalletError,
  } = useSmartWalletAccount();

  useEffect(() => {
    if (isLoading) return;

    if (isError || !user) {
      const currentPath = window.location.pathname;
      const searchParams = window.location.search;

      const redirectUrl = encodeURIComponent(`${currentPath}${searchParams}`);

      router.push(`/login?redirect=${redirectUrl}`);
    }

    if (user && user.importedAccountData && ownerIndex === -1) {
      router.push("/import/complete");
    }
  }, [user, isLoading, isError, router, ownerIndex]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (isError || !user) {
    return null;
  }

  return <>{children}</>;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <SessionProvider>
      <AuthLayoutContent>{children}</AuthLayoutContent>
    </SessionProvider>
  );
}
