"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SessionProvider, useSession } from "../providers/SessionProvider";

interface AuthLayoutProps {
  children: React.ReactNode;
}

function AuthLayoutContent({ children }: AuthLayoutProps) {
  const router = useRouter();
  const { user, isLoading, isError } = useSession();

  useEffect(() => {
    if (isLoading) return;

    if (isError || !user) {
      const currentPath = window.location.pathname;
      const searchParams = window.location.search;

      const redirectUrl = encodeURIComponent(`${currentPath}${searchParams}`);

      router.push(`/login?redirect=${redirectUrl}`);
    }
  }, [user, isLoading, isError, router]);

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
