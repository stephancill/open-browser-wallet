"use client";

import Modal from "@/components/Modal";
import useModal from "@/hooks/modal";
import { SCWKeyManager } from "@/lib/scw-sdk/SCWKeyManager";
import {
  decryptContent,
  importKeyFromHexString,
  RPCRequest,
  RPCResponse,
} from "@/lib/scw-sdk/cipher";
import { getEncryptedMessage } from "@/lib/scw-sdk/shared";
import { transportEndpoints } from "@/lib/wagmi";
import { walletConnect, WCEvent } from "@/lib/wallet-connect";
import { useSmartWalletAccount } from "@/providers/SmartWalletAccountProvider";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";

const keyManager = new SCWKeyManager();

function closePopup() {
  // if (process.env.NODE_ENV === "development") {
  //   return;
  // }

  window.opener.postMessage({ event: "PopupUnload" }, "*");
  const parent = window.self;
  parent.opener = window.self;
  parent.close();
}

export default function Page() {
  const [pendingHandshakeId, setPendingHandshakeId] = useState<string | null>(
    null
  );
  const { address } = useAccount();
  const { isOpen, content, openModal, closeModal } = useModal();
  const { isLoading, error } = useSmartWalletAccount();
  const { data: walletClient } = useWalletClient();

  const [messageQueue, setMessageQueue] = useState<MessageEvent[]>([]);
  const processingRef = useRef(false);

  const [logs, setLogs] = useState<any[]>([]);

  const appendLog = useCallback((logEntry: any, response: boolean = false) => {
    setLogs((prevLogs) => [...prevLogs, { ...logEntry, response }]);
  }, []);

  const handleMessage = useCallback(
    async (m: MessageEvent) => {
      if (m.source !== window.opener) {
        return;
      }
      console.log("message received", m.origin, m.data);

      const data = { ...m.data };
      let decrypted: RPCRequest | RPCResponse<unknown> | undefined;
      if (data.content?.encrypted) {
        const secret = await keyManager.getSharedSecret();
        if (!secret) {
          console.error("Shared secret not derived");
          return;
        }
        decrypted = await decryptContent(data.content.encrypted, secret);
        data.content.decrypted = decrypted;
      }

      appendLog(data);

      if (m.data.event === "selectSignerType") {
        const message = { requestId: m.data.id, data: "scw" };
        window.opener.postMessage(message, "*");
        appendLog(message, true);
      } else if (m.data.content?.handshake?.method === "eth_requestAccounts") {
        const peerPublicKey = await importKeyFromHexString(
          "public",
          m.data.sender
        );
        await keyManager.setPeerPublicKey(peerPublicKey);

        openModal(
          <div>
            <div>
              <div>{m.origin}</div>
              <div>wants to connect to your account {address}</div>
            </div>
            <button
              onClick={() => {
                setPendingHandshakeId(m.data.id);
              }}
              type="submit"
            >
              Connect
            </button>
            <button
              onClick={() => {
                closePopup();
              }}
              type="submit"
            >
              Cancel
            </button>
          </div>
        );
      } else if (decrypted && "action" in decrypted) {
        await handleDecryptedAction(decrypted, m.origin, m.data.id);
      }
    },
    [appendLog]
  );

  const handleSuccessfulRecovery = async (id: string, account: string) => {
    const message = {
      result: { value: [account] },
      data: { chains: transportEndpoints },
    };

    appendLog(message, true);

    const responseContent = await getEncryptedMessage({
      id,
      content: message,
    });

    window.opener.postMessage(responseContent, "*");

    closePopup();
  };

  const handleDecryptedAction = async (
    decrypted: any,
    origin: string,
    id: string
  ) => {
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

    appendLog(message, true);

    const responseContent = await getEncryptedMessage({
      id,
      content: message,
    });

    window.opener.postMessage(responseContent, "*");

    if (decrypted.action.method !== "eth_sendTransaction") {
      closePopup();
    }
  };

  const handleSessionRequest = useCallback(
    async ({
      method,
      params,
      onSuccess,
    }: {
      method: string;
      params: any;
      onSuccess: (result: any) => void;
    }) => {
      openModal(
        <div>
          <div>
            <div>{method}</div>
            <div>{JSON.stringify(params)}</div>
          </div>
          <button
            onClick={async () => {
              const res = await walletClient?.request({
                method: method as any,
                params,
              });

              onSuccess(res);
            }}
          >
            Approve
          </button>
          <button
            onClick={() => {
              closePopup();
              closeModal();
            }}
          >
            Reject
          </button>
        </div>
      );
    },
    [walletClient]
  );

  const receiveMessage = useCallback((m: MessageEvent) => {
    setMessageQueue((prevQueue) => [...prevQueue, m]);
  }, []);

  const processMessageQueue = useCallback(async () => {
    if (
      processingRef.current ||
      messageQueue.length === 0 ||
      !address ||
      !walletClient
    ) {
      return;
    }

    processingRef.current = true;
    const message = messageQueue[0];

    try {
      await handleMessage(message);
    } catch (error) {
      console.error("Error processing message:", error);
    }

    setMessageQueue((prevQueue) => prevQueue.slice(1));
    processingRef.current = false;
  }, [messageQueue, address, walletClient, handleMessage]);

  useEffect(() => {
    processMessageQueue();
  }, [processMessageQueue]);

  useEffect(() => {
    walletConnect.on(WCEvent.SessionRequest, handleSessionRequest);
    return () => {
      walletConnect.removeListener(
        WCEvent.SessionRequest,
        handleSessionRequest
      );
    };
  }, [handleSessionRequest, walletConnect]);

  useEffect(() => {
    window.addEventListener("message", receiveMessage, false);
    window.addEventListener("beforeunload", closePopup, false);

    const message = { event: "PopupLoaded" };
    window.opener.postMessage(message, "*");
    appendLog(message, true);

    return () => {
      window.removeEventListener("message", receiveMessage);
      window.removeEventListener("beforeunload", closePopup);
    };
  }, [receiveMessage, appendLog]);

  useEffect(() => {
    if (address && walletClient && pendingHandshakeId) {
      handleSuccessfulRecovery(pendingHandshakeId, address);
      setPendingHandshakeId(null);
    }
  }, [address, walletClient, pendingHandshakeId]);

  return (
    <div className="overflow-scroll">
      {isLoading && <div>Loading...</div>}
      {error && <div>Error: {error.message}</div>}
      <div>Connected account: {address}</div>
      <Modal isOpen={isOpen} onClose={closeModal}>
        {content}
      </Modal>
      {logs.map((log, index) => (
        <div key={index}>
          {log.response ? "Response: " : ""} {JSON.stringify(log)}
        </div>
      ))}
    </div>
  );
}
