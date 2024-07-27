"use client";

import { smartWallet } from "@/libs/smart-wallet";
import { walletConnect } from "@/libs/wallet-connect/service/wallet-connect";
import { SCWKeyManager } from "@/utils/scw-sdk/SCWKeyManager";
import {
  decryptContent,
  encryptContent,
  exportKeyToHexString,
  importKeyFromHexString,
  RPCRequest,
  RPCResponse,
} from "@/utils/scw-sdk/cipher";
import { Button } from "@radix-ui/themes";
import { useCallback, useEffect, useState } from "react";
import { usePublicKeyRecovery } from "../../hooks/usePublicKeyRecover";
import { useMe } from "../../providers/MeProvider";
import { useModal } from "../../providers/ModalProvider";

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
  const [pendingHandshake, setPendingHandshake] = useState<{
    id: string;
    messagesToLog: any[];
  } | null>(null);
  const { open: openModal, isOpen: isModalOpen } = useModal();

  const [logs, setLogs] = useState<any[]>([]);

  const { me } = useMe();
  const { isLoading, error, needsSecondSignature, initiateRecovery, completeRecovery } =
    usePublicKeyRecovery();

  const appendLog = useCallback((logEntry: any) => {
    setLogs((prevLogs) => [...prevLogs, logEntry]);
  }, []);

  const handleRecovery = useCallback(
    async (id: string, messagesToLog: any[]) => {
      await initiateRecovery();
      if (!needsSecondSignature && me) {
        await handleSuccessfulRecovery(id, messagesToLog, me.account);
      } else {
        setPendingHandshake({ id, messagesToLog });
      }
    },
    [initiateRecovery, needsSecondSignature, me],
  );

  const handleCompleteRecovery = useCallback(async () => {
    await completeRecovery();
  }, [completeRecovery]);

  const handleMessage = useCallback(
    async (m: MessageEvent) => {
      if (m.source !== window.opener) {
        return;
      }
      console.log("message received", m.origin, m.data);

      const messageToLog = { ...m.data };
      let decrypted: RPCRequest | RPCResponse<unknown> | undefined;
      if (messageToLog.content?.encrypted) {
        const secret = await keyManager.getSharedSecret();
        if (!secret) {
          console.error("Shared secret not derived");
          return;
        }
        decrypted = await decryptContent(messageToLog.content.encrypted, secret);
        messageToLog.content.decrypted = decrypted;
      }

      const messagesToLog = [messageToLog];

      if (m.data.event === "selectSignerType") {
        const message = { requestId: m.data.id, data: "scw" };
        window.opener.postMessage(message, "*");
        messagesToLog.push({ ...message, response: true });
      } else if (m.data.content?.handshake?.method === "eth_requestAccounts") {
        const peerPublicKey = await importKeyFromHexString("public", m.data.sender);
        await keyManager.setPeerPublicKey(peerPublicKey);

        await handleRecovery(m.data.id, messagesToLog);
      } else if (decrypted && "action" in decrypted) {
        await handleDecryptedAction(decrypted, m.origin, m.data.id, messagesToLog);
      }

      messagesToLog.forEach(appendLog);
    },
    [handleRecovery, appendLog],
  );

  const handleSuccessfulRecovery = async (id: string, messagesToLog: any[], account: string) => {
    const chains: Record<number, string> = {};
    if (smartWallet.client.chain) {
      chains[smartWallet.client.chain.id] = smartWallet.client.chain.rpcUrls.default.http[0];
    }

    const message = {
      result: { value: [account] },
      data: { chains },
    };

    messagesToLog.push({ ...message, response: true });
    await sendEncryptedMessage({
      id,
      content: message,
    });

    closePopup();
    messagesToLog.forEach(appendLog);
  };

  const handleDecryptedAction = async (
    decrypted: any,
    origin: string,
    id: string,
    messagesToLog: any[],
  ) => {
    smartWallet.init();
    if (!decrypted.action.params) {
      console.error("No params in action");
      return;
    }

    const result = await walletConnect.handleRequest({
      method: decrypted.action.method,
      origin,
      params: decrypted.action.params as any,
    });

    const message = {
      result: { value: result },
    };

    messagesToLog.push({ ...message, response: true });

    await sendEncryptedMessage({
      id,
      content: message,
    });

    if (decrypted.action.method !== "eth_sendTransaction") {
      closePopup();
    }

    messagesToLog.forEach(appendLog);
  };

  useEffect(() => {
    console.log("page mounted");
    window.addEventListener("message", handleMessage, false);

    const message = { event: "PopupLoaded" };
    window.opener.postMessage(message, "*");
    appendLog({ ...message, response: true });

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [handleMessage, appendLog]);

  useEffect(() => {
    if (me && pendingHandshake) {
      handleSuccessfulRecovery(pendingHandshake.id, pendingHandshake.messagesToLog, me.account);
      setPendingHandshake(null);
    }
  }, [me, pendingHandshake]);

  useEffect(() => {
    if (!isModalOpen && needsSecondSignature) {
      openModal(
        <div>
          <Button onClick={handleCompleteRecovery} variant="outline" size="3" type="submit">
            Complete Connection
          </Button>
        </div>,
      );
    }
  }, [needsSecondSignature, isModalOpen, openModal]);

  return (
    <div className="overflow-scroll">
      {isLoading && <div>Loading...</div>}
      {error && <div>Error: {error}</div>}
      {logs.map((log, index) => (
        <div key={index}>
          {log.response ? "Response: " : ""} {JSON.stringify(log)}
        </div>
      ))}
    </div>
  );
}
