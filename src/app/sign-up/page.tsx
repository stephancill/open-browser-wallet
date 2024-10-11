"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Hex, hexToBytes } from "viem";
import { createCredential } from "webauthn-p256";
import { CHALLENGE_DURATION_SECONDS } from "@/lib/constants";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function SignUpPage() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [nonce] = useState(() => crypto.randomUUID());

  const router = useRouter();
  const searchParams = useSearchParams();

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
      phoneNumber,
    }: {
      credential: {
        id: string;
        publicKey: Hex;
      };
      phoneNumber: string;
    }) => {
      const response = await fetch("/api/sign-up", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phoneNumber,
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
        name: phoneNumber,
      },
    });
    createAccountMutation.mutate({ credential, phoneNumber });
  }, [challenge, createAccountMutation, phoneNumber]);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {(error as Error).message}</div>;

  return (
    <div>
      <h1>Sign Up</h1>
      <div>
        <label htmlFor="phoneNumber">Phone Number</label>
        <input
          type="tel"
          id="phoneNumber"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="Enter your phone number"
        />
      </div>
      <button
        onClick={handleCreateAccount}
        disabled={createAccountMutation.isPending || !challenge || !phoneNumber}
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
