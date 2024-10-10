"use client";

import Modal from "@/components/Modal";
import useModal from "@/hooks/modal";
import { AuthLayout } from "@/layouts/AuthLayout";
import { replacer } from "@/lib/coinbase-sdk/json";
import { handleMessage } from "@/lib/coinbase-sdk/shared";
import { transportEndpoints } from "@/lib/wagmi";
import { useSmartWalletAccount } from "@/providers/SmartWalletAccountProvider";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { EIP1193RequestFn, EIP1474Methods } from "viem";
import { useAccount, useWalletClient } from "wagmi";

export default function Page() {
  const params = useSearchParams();
  const router = useRouter();

  const { address } = useAccount();
  const { isOpen, content: modalContent, openModal, closeModal } = useModal();
  const { isLoading, error } = useSmartWalletAccount();
  const { data: walletClient } = useWalletClient();

  const hasHandledMessage = useRef(false);

  const id = JSON.parse(params.get("id") || "");
  const sender = JSON.parse(params.get("sender") || "");
  const sdkVersion = JSON.parse(params.get("sdkVersion") || "");
  const callbackUrl = JSON.parse(params.get("callbackUrl") || "");
  const timestamp = JSON.parse(params.get("timestamp") || "");
  const content = JSON.parse(params.get("content") || "");

  const closePopup = useCallback(() => {
    const url = new URL(callbackUrl);
    router.push(url.toString());
  }, []);

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

  useEffect(() => {
    if (
      !callbackUrl ||
      !address ||
      !walletClient ||
      hasHandledMessage.current
    ) {
      return;
    }

    const data = {
      id,
      sender,
      sdkVersion,
      timestamp,
      content,
    };

    if ("encrypted" in data.content) {
      const encrypted = data.content.encrypted;
      data.content = {
        encrypted: {
          iv: new Uint8Array(Buffer.from(encrypted.iv, "hex")),
          cipherText: new Uint8Array(Buffer.from(encrypted.cipherText, "hex")),
        },
      };
    }

    hasHandledMessage.current = true;

    handleMessage({
      data,
      transportEndpoints,
      providerRequest: handleSessionRequest,
    }).then(({ result: response, data, method }) => {
      if (response) {
        const url = new URL(callbackUrl);

        for (const [key, value] of Object.entries(response)) {
          url.searchParams.set(key, JSON.stringify(value, replacer));
        }

        router.push(url.toString());
      }
    });
  }, [address, callbackUrl, walletClient]);

  return (
    <AuthLayout>
      <div>
        {isLoading && <div>Loading...</div>}
        {error && <div>Error: {error.message}</div>}
        <div>Connected account: {address}</div>
        <Modal isOpen={isOpen} onClose={closeModal}>
          {modalContent}
        </Modal>
      </div>
    </AuthLayout>
  );
}
