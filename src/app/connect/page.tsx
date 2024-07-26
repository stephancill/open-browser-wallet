"use client";

import { useEffect, useState } from "react";
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
import { smartWallet } from "@/libs/smart-wallet";

const keyManager = new SCWKeyManager();

async function sendEncryptedMessage({ id, content }: { id: string; content: any }) {
  const secret = await keyManager.getSharedSecret();

  if (!secret) {
    console.error("Shared secret not derived");
    return;
  }

  const encrypted = await encryptContent(content, secret);

  window.opener.postMessage(
    {
      requestId: id,
      sender: await exportKeyToHexString("public", await keyManager.getOwnPublicKey()),
      content: { encrypted },
    },
    "*",
  );
}

function closePopup() {
  if (process.env.NODE_ENV === "development") {
    return;
  }
  window.opener.postMessage("PopupUnload", "*");
  const parent = window.self;
  parent.opener = window.self;
  parent.close();
}

export default function Page() {
  const [messages, setMessages] = useState<any[]>([]);
  const me = useMe();

  useEffect(() => {
    console.log("page mounted");
    window.addEventListener(
      "message",
      async function (m) {
        if (m.source !== this.window.opener) {
          return;
        }
        console.log("message received", m.origin, m.data);

        const messageToAppend = { ...m.data };
        let decrypted: RPCRequest | RPCResponse<unknown> | undefined;
        if (messageToAppend.content?.encrypted) {
          const secret = await keyManager.getSharedSecret();
          if (!secret) {
            console.error("Shared secret not derived");
            return;
          }
          decrypted = await decryptContent(messageToAppend.content.encrypted, secret);
          messageToAppend.content.decrypted = decrypted;
        }

        const messagesToAppend = [messageToAppend];

        if (m.data.event === "selectSignerType") {
          const message = { requestId: m.data.id, data: "scw" };
          window.opener.postMessage(message, "*");
          messagesToAppend.push({ ...message, response: true });
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

          messagesToAppend.push({ ...message, response: true });
          await sendEncryptedMessage({
            id: m.data.id,
            content: message,
          });

          closePopup();
        } else if (decrypted && "action" in decrypted) {
          smartWallet.init();
          if (!decrypted.action.params) {
            console.error("No params in action");
            return;
          }

          const result = await walletConnect.handleRequest({
            method: decrypted.action.method,
            origin: m.origin,
            params: decrypted.action.params as any,
          });

          const message = {
            result: { value: result },
          };

          messagesToAppend.push({ ...message, response: true });

          await sendEncryptedMessage({
            id: m.data.id,
            content: message,
          });

          if (decrypted.action.method !== "eth_sendTransaction") {
            closePopup();
          }
        }

        setMessages((prev) => [...prev, ...messagesToAppend]);
      },
      false,
    );

    const message = { event: "PopupLoaded" };
    window.opener.postMessage(message, "*");
    setMessages([{ ...message, response: true }]);
  }, [setMessages]);

  return (
    <div className="overflow-scroll">
      {messages.map((message, index) => {
        return (
          <div key={index}>
            {message.response ? "Response: " : ""} {JSON.stringify(message)}
          </div>
        );
      })}
    </div>
  );
}
