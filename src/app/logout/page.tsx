"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Cookies from "js-cookie";
import { AUTH_SESSION_COOKIE_NAME } from "../../lib/constants";

export default function LogoutPage() {
  const queryClient = useQueryClient();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      Cookies.remove(AUTH_SESSION_COOKIE_NAME);
      queryClient.clear();
      const response = await fetch("/api/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error("Logout failed");
      }
    },
    onSuccess: () => {
      window.location.href = "/";
    },
  });

  useEffect(() => {
    logoutMutation.mutate();
  }, []);

  return (
    <div>
      <h1>Logging out...</h1>
      <p>Please wait while we log you out and redirect you to the home page.</p>
    </div>
  );
}
