"use client";

import { CHALLENGE_DURATION_SECONDS } from "@/lib/constants";
import { createUUID } from "@/lib/utils";
import { useSession } from "@/providers/SessionProvider";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Hex, hexToBytes } from "viem";
import { createCredential } from "webauthn-p256";

export default function SignUpPage() {
  const [username, setUsername] = useState("");
  const [nonce] = useState(() => createUUID());

  const router = useRouter();
  const searchParams = useSearchParams();
  const { refetch } = useSession();

  const {
    data: challenge,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["challenge", nonce],
    queryFn: async () => {
      const response = await fetch("/api/challenge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ nonce }),
      });
      if (!response.ok) {
        throw new Error("Failed to fetch challenge");
      }
      const { challenge } = (await response.json()) as { challenge: Hex };

      return challenge;
    },
    refetchInterval: CHALLENGE_DURATION_SECONDS * 1000,
  });

  const createAccountMutation = useMutation({
    mutationFn: async ({
      credential,
      username,
    }: {
      credential: {
        id: string;
        publicKey: Hex;
      };
      username: string;
    }) => {
      const response = await fetch("/api/sign-up", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          passkeyId: credential.id,
          passkeyPublicKey: credential.publicKey,
          nonce,
        }),
      });
      if (!response.ok) {
        try {
          const { error } = await response.json();
          console.error(error);
          throw new Error(error);
        } catch (error) {
          throw new Error("Failed to create account");
        }
      }
      return response.json();
    },
    onSuccess: (user) => {
      refetch();
      const redirectUrl = searchParams.get("redirect");

      if (redirectUrl) {
        router.push(decodeURIComponent(redirectUrl));
      } else {
        router.push("/");
      }
    },
  });

  const handleCreateAccount = useCallback(async () => {
    if (!challenge) return;

    const credential = await createCredential({
      challenge: hexToBytes(challenge),
      user: {
        name: username,
      },
    });
    createAccountMutation.mutate({ credential, username });
  }, [challenge, createAccountMutation]);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {(error as Error).message}</div>;

  return (
    <div>
      <h1>Sign Up</h1>
      <div>
        <label htmlFor="username">Username</label>
        <input
          type="text"
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter your username"
        />
      </div>
      <button
        onClick={handleCreateAccount}
        disabled={createAccountMutation.isPending || !challenge || !username}
      >
        {createAccountMutation.isPending
          ? "Creating Account..."
          : "Create Account"}
      </button>
      {createAccountMutation.isError && (
        <div>Error: {(createAccountMutation.error as Error).message}</div>
      )}

      <Link
        href={{
          pathname: "/sign-up",
          query: { redirect: searchParams.get("redirect") },
        }}
      >
        Login
      </Link>
    </div>
  );
}
