"use client";

import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "../../../providers/SessionProvider";

export default function VerifyPhonePage() {
  const { user } = useSession();
  const [verificationCode, setVerificationCode] = useState("");
  const [isCodeSent, setIsCodeSent] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  const sendVerificationMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/sign-up/phone-verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phoneNumber: user?.phoneNumber }),
      });
      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error || "Failed to send verification code");
      }
      return response.json();
    },
    onSuccess: () => {
      setIsCodeSent(true);
    },
  });

  const verifyCodeMutation = useMutation({
    mutationFn: async ({ code }: { code: string }) => {
      const response = await fetch("/api/sign-up/phone-verify", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phoneNumber: user?.phoneNumber, code }),
      });
      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error || "Failed to verify code");
      }
      return response.json();
    },
    onSuccess: (data) => {
      if (data.valid) {
        const redirectUrl = searchParams.get("redirect") || "/";
        router.push(redirectUrl);
      }
    },
  });

  const handleSendVerification = useCallback(() => {
    sendVerificationMutation.mutate();
  }, [sendVerificationMutation, user?.phoneNumber]);

  const handleVerifyCode = useCallback(() => {
    verifyCodeMutation.mutate({ code: verificationCode });
  }, [verifyCodeMutation, verificationCode]);

  return (
    <div>
      <h1>Verify Phone Number</h1>
      <div>
        <label htmlFor="phoneNumber">Phone Number</label>
        <input
          type="tel"
          id="phoneNumber"
          value={user?.phoneNumber ?? "Loading..."}
          // onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="Enter your phone number"
          disabled={true}
        />
      </div>
      {!isCodeSent && (
        <button
          onClick={handleSendVerification}
          disabled={sendVerificationMutation.isPending || !user?.phoneNumber}
        >
          {sendVerificationMutation.isPending
            ? "Sending Code..."
            : "Send Verification Code"}
        </button>
      )}
      {isCodeSent && (
        <>
          <div>
            <label htmlFor="verificationCode">Verification Code</label>
            <input
              type="text"
              id="verificationCode"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              placeholder="Enter verification code"
            />
          </div>
          <button
            onClick={handleVerifyCode}
            disabled={verifyCodeMutation.isPending || !verificationCode}
          >
            {verifyCodeMutation.isPending ? "Verifying..." : "Verify Code"}
          </button>
        </>
      )}
      {(sendVerificationMutation.isError || verifyCodeMutation.isError) && (
        <div>
          Error:{" "}
          {
            (
              (sendVerificationMutation.error ||
                verifyCodeMutation.error) as Error
            ).message
          }
        </div>
      )}
      <Link href="/sign-up">Back to Sign Up</Link>
    </div>
  );
}
