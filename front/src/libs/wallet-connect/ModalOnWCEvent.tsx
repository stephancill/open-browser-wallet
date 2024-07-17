"use client";

import WCNotSupportedModal from "@/components/WCNotSupportedModal";
import WCSendTransactionModal from "@/components/WCSendTransactionModal";
import { useModal } from "@/providers/ModalProvider";
import React, { useEffect } from "react";
import { EthSendEventPayload, WCEvent, walletConnect } from "./service/wallet-connect";
import WCSignModal from "../../components/WCSignModal";

export function ModalOnWCEvent({ children }: { children: React.ReactNode }) {
  const { open } = useModal();

  useEffect(() => {
    function handleEthSendTransaction({
      params,
      origin,
      onSuccess,
      onReject,
    }: EthSendEventPayload) {
      open(
        <WCSendTransactionModal params={params} origin={origin} onSuccess={onSuccess} />,
        onReject,
      );
    }

    function handleMethodNotSupported(method: string) {
      open(<WCNotSupportedModal method={method} />);
    }

    function handleEthSign({ method, params, origin, onSuccess, onReject }: EthSendEventPayload) {
      open(
        <WCSignModal
          schema={{
            Method: method as any,
            Parameters: params as any,
          }}
          origin={origin}
          onSuccess={onSuccess}
        />,
        onReject,
      );
    }

    walletConnect.on(WCEvent.MethodNotSupported, handleMethodNotSupported);
    walletConnect.on(WCEvent.EthSendTransaction, handleEthSendTransaction);
    walletConnect.on(WCEvent.Sign, handleEthSign);
    return () => {
      walletConnect.removeListener(WCEvent.MethodNotSupported, handleMethodNotSupported);
      walletConnect.removeListener(WCEvent.EthSendTransaction, handleEthSendTransaction);
      walletConnect.removeListener(WCEvent.Sign, handleEthSign);
    };
  }, [open]);

  return <>{children}</>;
}
