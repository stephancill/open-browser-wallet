import { walletConnect, WCEvent } from "../lib/wallet-connect";

import { useCallback, useEffect } from "react";
import { useWalletConnect } from "../providers/WalletConnectProvider";
import { EIP1193RequestFn, EIP1474Methods } from "viem";
import useModal from "../hooks/modal";
import Modal from "./Modal";
import { useAccount, useWalletClient } from "wagmi";
import { ConnectApp } from "./ConnectApp";

export function WalletConnectView() {
  const { isOpen, content: modalContent, openModal, closeModal } = useModal();
  const { data: walletClient, refetch } = useWalletClient();
  const account = useAccount();

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
              <pre>{JSON.stringify(params, null, 2)}</pre>
            </div>
            <button
              onClick={async () => {
                console.log("method", method);
                console.log("params", params);
                try {
                  // TODO: Fix types
                  const res = await walletClient?.request({
                    method: method as any,
                    params: params as any,
                  });

                  console.log("res", res);

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
                closeModal();
              }}
            >
              Reject
            </button>
          </div>
        );
      });
    },
    [account, walletClient, openModal, closeModal]
  );

  useEffect(() => {
    function handleWcSessionRequest({
      method,
      params,
      origin,
      onSuccess,
      onReject,
    }: {
      method: string;
      params: any[];
      origin: string;
      onSuccess: (args: any) => void;
      onReject: () => Promise<void>;
    }) {
      handleSessionRequest({
        method: method as any,
        params: params as any,
      })
        .then((returnValue) => {
          console.log("returnValue", returnValue);
          onSuccess(returnValue);
        })
        .catch((error) => {
          console.log("error", error);
          onReject();
        });
    }

    walletConnect.on(WCEvent.SessionRequest, handleWcSessionRequest);
    return () => {
      walletConnect.removeListener(
        WCEvent.SessionRequest,
        handleSessionRequest
      );
    };
  }, [open, walletClient]);

  return (
    <div>
      <ConnectApp />
      <Modal isOpen={isOpen} onClose={closeModal}>
        {modalContent}
      </Modal>
    </div>
  );
}
