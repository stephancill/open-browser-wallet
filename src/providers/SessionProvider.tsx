import { useQuery } from "@tanstack/react-query";
import { createContext, ReactNode, useContext, useEffect } from "react";
import { UserRow } from "../types/db";
import { useRouter } from "next/navigation";

async function fetchUser(): Promise<UserRow> {
  const response = await fetch("/api/user");

  if (!response.ok) {
    throw new Error("Failed to fetch user");
  }

  const { user } = await response.json();

  if (!user) {
    throw new Error("User not found");
  }

  return user;
}

interface SessionContextType {
  user: UserRow | null | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  const {
    data: user,
    isLoading,
    isError,
    isSuccess,
    refetch,
  } = useQuery({
    queryKey: ["user"],
    queryFn: fetchUser,
    retry: false,
  });

  useEffect(() => {
    if (isSuccess && user) {
      router.push("/");
    }
  }, [isSuccess, user, router]);

  return (
    <SessionContext.Provider value={{ user, isLoading, isError, refetch }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}
