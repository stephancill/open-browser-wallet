"use client";

import { walletConnect } from "@/libs/wallet-connect/service/wallet-connect";
import { useMe } from "@/providers/MeProvider";
import { createWalletClient, viemConnector } from "@farcaster/auth-kit";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseAbi, stringToHex } from "viem";
import { useReadContract } from "wagmi";

export default function Page() {
  const { me, get: getMe } = useMe();
  const params = useSearchParams();
  const hasHandledMessage = useRef(false);

  const { data: fid } = useReadContract({
    address: "0x00000000Fc6c5F01Fc30151999387Bb99A9f489b",
    abi: parseAbi(["function idOf(address) view returns (uint256)"]),
    functionName: "idOf",
    args: me?.account ? [me.account] : undefined,
    chainId: 10,
  });

  const [messages, setMessages] = useState<string[]>([]);

  const addMessage = useCallback(
    (message: string) => {
      setMessages((prev) => [...prev, message]);
    },
    [setMessages],
  );

  const getSignature = useCallback(async () => {
    const channelToken = params.get("channelToken");
    const nonce = params.get("nonce");
    const siweUri = params.get("siweUri");
    const domain = params.get("domain");

    if (!channelToken || !nonce || !siweUri || !domain || !fid) {
      return;
    }

    const ethereum = viemConnector();
    const farcasterWalletClient = createWalletClient({
      ethereum,
      relay: process.env.NEXT_PUBLIC_FARCASTER_RELAY,
    });

    const { message } = farcasterWalletClient.buildSignInMessage({
      fid: Number(fid),
      nonce,
      domain,
      uri: siweUri,
      address: me?.account,
    });

    const signature = await walletConnect.handleRequest({
      method: "personal_sign",
      origin: domain,
      params: [stringToHex(message), me?.account],
    });

    const authenticateParams = {
      message,
      signature,
      fid: Number(fid),
    };

    await farcasterWalletClient.authenticate({
      channelToken,
      authKey: "example",
      ...authenticateParams,
    });

    return signature;
  }, [params, fid, me?.account]);

  useEffect(() => {
    if (!params || hasHandledMessage.current || !fid || !me?.account) {
      return;
    }

    hasHandledMessage.current = true;

    getSignature();
  }, [me?.account, params, fid, getSignature]);

  useEffect(() => {
    getMe();
  }, []);

  return (
    <div>
      {messages.map((message, index) => {
        return <div key={index}>{message}</div>;
      })}
    </div>
  );
}
