"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Hex, hexToBytes } from "viem";
import { createCredential } from "webauthn-p256";
import { CHALLENGE_DURATION_SECONDS } from "@/lib/constants";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "../../components/Button";
import { createUUID } from "../../lib/utils";
import { useSession } from "../../providers/SessionProvider";

export default function SignUpPage() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneError, setPhoneError] = useState("");
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
        name: phoneNumber,
      },
    });
    createAccountMutation.mutate({ credential, phoneNumber });
  }, [challenge, createAccountMutation, phoneNumber]);

  const isPhoneValid = useMemo(() => {
    const phoneRegex = /^\+\d{1,2}\d{9}$/;
    return phoneRegex.test(phoneNumber);
  }, [phoneNumber]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPhoneNumber(value);
    if (value && !isPhoneValid) {
      setPhoneError("Phone number must start with + followed by 10-11 digits");
    } else {
      setPhoneError("");
    }
  };

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {(error as Error).message}</div>;

  return (
    <div className="flex flex-col min-h-[calc(100dvh-65px)]">
      <div className="text-3xl font-bold">Airtime Wallet</div>
      <div className="flex flex-col gap-8 mt-[80px]">
        <div className="flex flex-col gap-2">
          <label className="text-lg" htmlFor="phoneNumber">
            Sign up with phone number
          </label>
          <input
            type="tel"
            id="phoneNumber"
            value={phoneNumber}
            onChange={handlePhoneChange}
            placeholder="+27"
            className={`border ${
              phoneError ? "border-red-500" : "border-gray-300"
            } rounded-md p-4 text-lg`}
          />
          {phoneError && <p className="text-red-500 text-sm">{phoneError}</p>}
        </div>
        <div className="flex flex-col gap-2 items-center">
          <Button
            onClick={handleCreateAccount}
            disabled={
              createAccountMutation.isPending || !challenge || !isPhoneValid
            }
          >
            {createAccountMutation.isPending
              ? "Creating Account..."
              : "Create Account"}
          </Button>
          {createAccountMutation.isError && (
            <div>Error: {(createAccountMutation.error as Error).message}</div>
          )}

          <Link
            href={{
              pathname: "/login",
              query: { redirect: searchParams.get("redirect") },
            }}
            className="text-gray-500"
          >
            Already have an account? Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
