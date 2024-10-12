import { useEffect, useState } from "react";
import { erc20Abi, formatUnits } from "viem";
import {
  useAccount,
  useBalance,
  useReadContract,
  useReadContracts,
} from "wagmi";
import { truncateAddress } from "../lib/utils";
import { Copy, Check, Send } from "lucide-react";
import { Button } from "./Button";

const trackedTokens = [
  {
    name: "USDC",
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    chainId: 8453,
    decimals: 6,
  },
] as const;

const token = {
  name: "USDC",
  address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  chainId: 8453,
  decimals: 6,
} as const;

export function WalletView() {
  const account = useAccount();
  const [copied, setCopied] = useState(false);

  const {
    data: tokenBalance,
    isLoading: isLoadingBalances,
    error: errorBalances,
  } = useReadContract({
    address: token.address,
    chainId: token.chainId,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: account.address ? [account.address] : undefined,
    query: {
      refetchInterval: 1000,
    },
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(account.address ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!account.address) return null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-center justify-between">
        {tokenBalance !== undefined ? (
          <div className="text-[60px] font-bold">
            ${parseFloat(formatUnits(tokenBalance, token.decimals)).toFixed(2)}
          </div>
        ) : isLoadingBalances ? (
          <div>Loading...</div>
        ) : (
          <div>Error: {errorBalances?.message}</div>
        )}
        <button
          className="flex items-center text-gray-500 gap-2 border-none"
          onClick={handleCopy}
        >
          <div>{truncateAddress(account.address)}</div>
          <div>{copied ? <Check size={16} /> : <Copy size={16} />}</div>
        </button>
      </div>
      <div>
        <Button>
          <div className="text-xl">Send</div>
          <div>
            <Send size={18} />
          </div>
        </Button>
      </div>
    </div>
  );
}
