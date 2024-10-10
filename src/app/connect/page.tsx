"use client";

import Modal from "@/components/Modal";
import useModal from "@/hooks/modal";
import { handleMessage } from "@/lib/coinbase-sdk/shared";
import { transportEndpoints } from "@/lib/wagmi";
import { useSmartWalletAccount } from "@/providers/SmartWalletAccountProvider";
import { useCallback, useEffect, useRef, useState } from "react";
import { EIP1193RequestFn, EIP1474Methods } from "viem";
import { useAccount, useWalletClient } from "wagmi";

function closePopup() {
  window.opener.postMessage({ event: "PopupUnload" }, "*");
  const parent = window.self;
  parent.opener = window.self;
  parent.close();
}

export default function Page() {
  const { address } = useAccount();
  const { isOpen, content, openModal, closeModal } = useModal();
  const { isLoading, error } = useSmartWalletAccount();
  const { data: walletClient } = useWalletClient();

  const [messageQueue, setMessageQueue] = useState<MessageEvent[]>([]);
  const processingRef = useRef(false);

  /**
   * Handle the request from the wallet
   */
  const handleSessionRequest = useCallback<EIP1193RequestFn<EIP1474Methods>>(
    async ({ method, params }) => {
      return new Promise((resolve, reject) => {
        openModal(
          <div>
            <div>
              <div>{method}</div>
              <div>{JSON.stringify(params)}</div>
            </div>
            <button
              onClick={async () => {
                try {
                  // TODO: Fix types
                  const res = await walletClient?.request({
                    method: method as any,
                    params: params as any,
                  });
                  resolve(res as any);
                  closeModal();
                } catch (error) {
                  reject(error);
                  closeModal();
                }
              }}
            >
              Approve
            </button>
            <button
              onClick={() => {
                reject(new Error("User rejected the request"));
                closePopup();
                closeModal();
              }}
            >
              Reject
            </button>
          </div>
        );
      });
    },
    [walletClient, openModal, closeModal]
  );

  const receiveMessage = useCallback((m: MessageEvent) => {
    if (m.source === window.opener) {
      setMessageQueue((prevQueue) => [...prevQueue, m]);
    }
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

    if (message.source === window.opener) {
      try {
        handleMessage({
          data: message.data,
          transportEndpoints,
          providerRequest: handleSessionRequest,
        }).then(({ result: response, data, method }) => {
          if (response) {
            window.opener.postMessage(response, "*");
            if (data.event !== "selectSignerType") {
              closePopup();
            }
          }
        });
      } catch (error) {
        console.error("Error processing message:", error);
      }
    }

    setMessageQueue((prevQueue) => prevQueue.slice(1));
    processingRef.current = false;
  }, [messageQueue, address, walletClient, handleMessage]);

  useEffect(() => {
    processMessageQueue();
  }, [processMessageQueue]);

  useEffect(() => {
    window.addEventListener("message", receiveMessage, false);
    window.addEventListener("beforeunload", closePopup, false);

    const message = { event: "PopupLoaded" };
    window.opener.postMessage(message, "*");

    return () => {
      window.removeEventListener("message", receiveMessage);
      window.removeEventListener("beforeunload", closePopup);
    };
  }, [receiveMessage]);

  return (
    <div>
      {isLoading && <div>Loading...</div>}
      {error && <div>Error: {error.message}</div>}
      <div>Connected account: {address}</div>
      <Modal isOpen={isOpen} onClose={closeModal}>
        {content}
      </Modal>
    </div>
  );
}
