"use client";

import { smartWallet } from "@/libs/smart-wallet";
import { walletConnect } from "@/libs/wallet-connect/service/wallet-connect";
import { useMe } from "@/providers/MeProvider";
import { SCWKeyManager } from "@/utils/scw-sdk/SCWKeyManager";
import {
  decryptContent,
  encryptContent,
  exportKeyToHexString,
  importKeyFromHexString,
  RPCRequest,
  RPCResponse,
} from "@/utils/scw-sdk/cipher";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { stringToHex } from "viem";
import { replacer, reviver } from "../../utils/scw-sdk/json";

const keyManager = new SCWKeyManager();

async function encryptMessage({ id, content }: { id: string; content: any }) {
  const secret = await keyManager.getSharedSecret();

  if (!secret) {
    throw new Error("Shared secret not derived");
  }

  const encrypted = await encryptContent(content, secret);

  return {
    requestId: id,
    sender: await exportKeyToHexString("public", await keyManager.getOwnPublicKey()),
    content: {
      encrypted,
    },
  };
}

function sendPlaintextMessage({ id, content }: { id: string; content: any }) {
  return {
    requestId: id,
    content: { plaintext: JSON.stringify(content) },
  };
}

type Params = {
  callbackUrl: string;
  message: string;
};

export default function Page() {
  const me = useMe();
  const params = useSearchParams();
  const router = useRouter();
  const hasHandledMessage = useRef(false);

  const message = params.get("message");
  const callbackUrl = params.get("callbackUrl");

  const [messages, setMessages] = useState<string[]>([]);

  const addMessage = useCallback(
    (message: string) => {
      setMessages((prev) => [...prev, message]);
    },
    [setMessages],
  );

  const handleMessage = useCallback(
    async (
      rawMessage: string,
    ): Promise<
      { requestId: string; sender?: string; content: any } | { requestId: string; data: string }
    > => {
      const m = JSON.parse(rawMessage, reviver);
      let decrypted: RPCRequest | RPCResponse<unknown> | undefined;
      if (m.data.content?.encrypted) {
        const secret = await keyManager.getSharedSecret();
        if (!secret) {
          throw new Error("Shared secret not derived");
        }
        decrypted = await decryptContent(m.data.content.encrypted, secret);
      } else if (m.data.content?.plaintext) {
        decrypted = JSON.parse(m.data.content.plaintext);
      }

      decrypted && addMessage(JSON.stringify(decrypted, null, 2));

      if (m.data.event === "selectSignerType") {
        const response = { requestId: m.data.id, data: "scw" };
        return response;
      } else if (m.data.content?.handshake?.method === "eth_requestAccounts") {
        const peerPublicKey = await importKeyFromHexString("public", m.data.sender);
        await keyManager.setPeerPublicKey(peerPublicKey);
        const accountResult = await me.get();

        const chains: Record<number, string> = {};
        if (smartWallet.client.chain) {
          chains[smartWallet.client.chain.id] = smartWallet.client.chain.rpcUrls.default.http[0];
        }

        const message = {
          result: { value: [accountResult?.account] },
          data: {
            chains,
          },
        };

        return encryptMessage({
          id: m.data.id,
          content: message,
        });
      } else if (decrypted && "action" in decrypted) {
        smartWallet.init();
        if (!decrypted.action.params) {
          throw new Error("No params in action");
        }
        const result = await walletConnect.handleRequest({
          method: decrypted.action.method,
          origin: m.origin,
          params: decrypted.action.params as any,
        });

        const message = {
          result: { value: result },
        };

        return encryptMessage({
          id: m.data.id,
          content: message,
        });

        // if (decrypted.action.method !== "eth_sendTransaction") {
        //   // closePopup();
        // }
      }

      throw new Error("Unsupported message");
    },
    [me],
  );

  useEffect(() => {
    if (!message || !callbackUrl || !me.get || hasHandledMessage.current) {
      return;
    }

    hasHandledMessage.current = true;

    handleMessage(message).then((response) => {
      const url = new URL(callbackUrl);
      url.searchParams.set("message", JSON.stringify(response, replacer));
      router.push(url.toString());
    });
  }, [me, message, callbackUrl]);

  return (
    <div>
      <div>{message}</div>
      <div>{callbackUrl}</div>
      {messages.map((message, index) => {
        return <div key={index}>{message}</div>;
      })}
      {callbackUrl && <a href={callbackUrl}>Go back</a>}
    </div>
  );
}
