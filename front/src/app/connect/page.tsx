"use client";

import { useEffect, useState } from "react";
import { walletConnect } from "../../libs/wallet-connect/service/wallet-connect";
import { useMe } from "../../providers/MeProvider";
import { SCWKeyManager } from "../../utils/SCWKeyManager";
import {
  decryptContent,
  encryptContent,
  exportKeyToHexString,
  importKeyFromHexString,
  RPCRequest,
  RPCResponse,
} from "../../utils/cipher";

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

export default function Page() {
  const [messages, setMessages] = useState<any[]>([]);
  const me = useMe();

  useEffect(() => {
    console.log("page mounted");
    window.addEventListener(
      "message",
      async function (m) {
        //message was received
        if (m.origin !== "http://localhost:3001") {
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

        setMessages((prev) => [...prev, messageToAppend]);

        if (m.data.event === "selectSignerType") {
          window.opener.postMessage({ requestId: m.data.id, data: "scw" }, "*");
          console.log("Responded", { requestId: m.data.id, data: "scw" });
        } else if (m.data.content?.handshake?.method === "eth_requestAccounts") {
          const peerPublicKey = await importKeyFromHexString("public", m.data.sender);
          await keyManager.setPeerPublicKey(peerPublicKey);
          const accountResult = await me.get();
          const message = {
            result: { value: accountResult?.account },
          };
          await sendEncryptedMessage({ id: m.data.id, content: message });

          var daddy = window.self;
          daddy.opener = window.self;
          daddy.close();
        } else if (decrypted && "action" in decrypted) {
          const result = await walletConnect.handleRequest({
            method: decrypted.action.method,
            origin: m.origin,
            params: decrypted.action.params as any,
          });
          await sendEncryptedMessage({ id: m.data.id, content: result });
        }
      },
      false,
    );

    window.opener.postMessage({ event: "PopupLoaded" }, "*");
  }, [setMessages]);

  return (
    <div className="overflow-scroll">
      {messages.map((message, index) => {
        return <div key={index}>{JSON.stringify(message)}</div>;
      })}
    </div>
  );
}
