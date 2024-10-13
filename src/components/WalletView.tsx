import { Check, Copy, Send, ExternalLink } from "lucide-react";
import { useState, useEffect } from "react";
import {
  erc20Abi,
  formatUnits,
  parseUnits,
  isAddress,
  getAddress,
  http,
} from "viem";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useEnsAddress,
  createConfig,
} from "wagmi";
import { truncateAddress } from "../lib/utils";
import { Button } from "./Button";
import { Sheet } from "react-modal-sheet";
import { useMutation } from "@tanstack/react-query";
import { mainnet } from "viem/chains";

const token = {
  name: "USDC",
  address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  chainId: 8453,
  decimals: 6,
} as const;

const ensConfig = createConfig({
  chains: [mainnet],
  transports: {
    [mainnet.id]: http(),
  },
  connectors: [],
});

export function WalletView() {
  const account = useAccount();
  const [copied, setCopied] = useState(false);
  const [isOpen, setOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const { writeContractAsync } = useWriteContract();
  const [transactionSuccess, setTransactionSuccess] = useState(false);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);

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

  const { data: ensAddress, isLoading: isEnsLoading } = useEnsAddress({
    name: recipient.includes(".") ? recipient : undefined,
    config: ensConfig,
  });

  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);

  useEffect(() => {
    if (recipient.includes(".")) {
      setResolvedAddress(ensAddress ?? null);
    } else if (isAddress(recipient)) {
      setResolvedAddress(recipient);
    } else {
      setResolvedAddress(null);
    }
  }, [recipient, ensAddress]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!account.address || !tokenBalance || !resolvedAddress)
        throw new Error("Account, balance, or recipient address not available");

      const parsedAmount = parseUnits(amount, token.decimals);
      const hash = await writeContractAsync({
        address: token.address,
        abi: erc20Abi,
        functionName: "transfer",
        args: [getAddress(resolvedAddress), parsedAmount],
      });

      return hash;
    },
    onSuccess: (hash) => {
      console.log("Transaction hash:", hash);
      setTransactionHash(hash);
      setTransactionSuccess(true);
      // Don't close the sheet or reset fields here
    },
    onError: (error) => {
      console.error("Error sending tokens:", error);
    },
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(account.address ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = () => {
    sendMutation.mutate();
  };

  const handleBackFromSuccess = () => {
    setTransactionSuccess(false);
    setTransactionHash(null);
    setOpen(false);
    setRecipient("");
    setAmount("");
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
        <Button onClick={() => setOpen(true)}>
          <div className="text-xl">Send</div>
          <div>
            <Send size={18} />
          </div>
        </Button>
      </div>

      <Sheet
        isOpen={isOpen}
        onClose={() => !sendMutation.isPending && setOpen(false)}
        className="max-w-[400px] mx-auto"
        snapPoints={[0.7]}
      >
        <Sheet.Container>
          <Sheet.Header />
          <Sheet.Content className="p-4 mb-[100px]">
            {!transactionSuccess ? (
              <div className="flex flex-col gap-6">
                <div className="text-2xl">Send</div>
                <div>
                  <input
                    type="text"
                    placeholder="Recipient Address or ENS"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    className="p-2 border rounded w-full"
                  />
                  {isEnsLoading && (
                    <div className="text-sm text-gray-500">
                      Resolving ENS...
                    </div>
                  )}
                  {resolvedAddress && recipient.includes(".") && (
                    <div className="text-sm text-gray-500">
                      Sending to {truncateAddress(resolvedAddress)}
                    </div>
                  )}
                </div>
                <input
                  type="number"
                  placeholder="Amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="p-2 border rounded"
                />
                <div className="flex flex-row gap-2">
                  <Button onClick={() => setOpen(false)} variant="secondary">
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSend}
                    disabled={
                      !resolvedAddress || !amount || sendMutation.isPending
                    }
                  >
                    {sendMutation.isPending ? "Sending..." : "Send"}
                  </Button>
                </div>
                {sendMutation.isError && (
                  <div className="text-red-500">
                    Error: {sendMutation.error.message}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                <div className="text-2xl">Send</div>
                <div className="flex justify-center">
                  <Check size={60} className="text-green-500" />
                </div>
                <div className="text-center">
                  Your transaction has been successfully sent.
                </div>
                {transactionHash && (
                  <a
                    href={`https://blockscan.com/tx/${transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 text-blue-500 hover:underline"
                  >
                    View Transaction <ExternalLink size={16} />
                  </a>
                )}
                <Button onClick={handleBackFromSuccess}>Close</Button>
              </div>
            )}
          </Sheet.Content>
        </Sheet.Container>
        <Sheet.Backdrop />
      </Sheet>
    </div>
  );
}
