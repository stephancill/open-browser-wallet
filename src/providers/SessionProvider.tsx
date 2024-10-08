import { useQuery } from "@tanstack/react-query";
import { createContext, ReactNode, useContext } from "react";
import { UserRow } from "../types/db";

async function fetchUser(): Promise<UserRow | null> {
  const user = localStorage.getItem("obw:user");

  if (!user) {
    return null;
  }

  return JSON.parse(user);
}

interface SessionContextType {
  user: UserRow | null | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const {
    data: user,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["user"],
    queryFn: fetchUser,
  });

  return (
    <SessionContext.Provider value={{ user, isLoading, isError, refetch }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
