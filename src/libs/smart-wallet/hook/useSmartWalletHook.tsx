import { useEffect, useState } from "react";
import { smartWallet } from "../service/smart-wallet";
import { Hash } from "viem";
import { PUBLIC_CLIENT } from "@/constants";

export function useSmartWalletHook() {
  const [address, setAddress] = useState<Hash | null>(null);

  async function init(address: Hash) {
    smartWallet.init();
    setAddress(address);
  }

  useEffect(() => {
    if (!address) return;

    PUBLIC_CLIENT.watchEvent({
      address: address,
      onLogs: (logs: any) => {},
    });
  }, [address]);

  return {
    address,
    init,
  };
}
