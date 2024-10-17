import { UserRow } from "@/types/db";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, ReactNode, useContext } from "react";

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
  logout: () => void;
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

  const logout = () => {
    router.push("/logout");
  };

  return (
    <SessionContext.Provider
      value={{ user, isLoading, isError, refetch, logout }}
    >
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
