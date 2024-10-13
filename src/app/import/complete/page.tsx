"use client";

import { coinbaseSmartWalletAbi } from "@/abi/coinbaseSmartWallet";
import { useSession } from "@/providers/SessionProvider";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { encodeFunctionData, Hex, LocalAccount, padHex, toHex } from "viem";
import {
  createBundlerClient,
  toCoinbaseSmartAccount,
} from "viem/account-abstraction";
import { mnemonicToAccount } from "viem/accounts";
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
  useReadContract,
  useReadContracts,
} from "wagmi";
import { parsePublicKey } from "webauthn-p256";
import { bundlerTransports } from "../../../lib/wagmi";

export default function ImportCompletePage() {
  const { user, isLoading: isUserLoading, logout } = useSession();
  const client = usePublicClient();
  const { connectAsync } = useConnect();
  const account = useAccount();
  const { disconnect } = useDisconnect();

  useEffect(() => {
    disconnect();
  }, []);

  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [recoveryAccount, setRecoveryAccount] = useState<LocalAccount | null>(
    null
  );

  const { data: ownerCount, refetch: refetchOwnerMetadata } = useReadContract({
    abi: coinbaseSmartWalletAbi,
    address: user?.walletAddress,
    functionName: "ownerCount",
    args: [],
    query: {
      enabled: !!user?.importedAccountData,
    },
  });

  const { data: ownersResult, refetch: refetchOwners } = useReadContracts({
    contracts: !!ownerCount
      ? Array.from({ length: Number(ownerCount) }, (_, i) => ({
          abi: coinbaseSmartWalletAbi,
          address: user?.walletAddress,
          functionName: "ownerAtIndex",
          args: [i],
        }))
      : undefined,
    query: {
      enabled: !!user?.importedAccountData && !!ownerCount,
    },
  });

  const ownerIndex = useMemo(() => {
    if (!user?.passkeyPublicKey) return undefined;

    if (!user.importedAccountData) return 0; // Wallets created natively always have index 0

    const owners = ownersResult?.map((owner) => owner.result as Hex);

    return owners?.findIndex(
      (owner) =>
        owner === padHex(user.passkeyPublicKey, { size: 64 }).toLowerCase()
    );
  }, [ownersResult]);

  useEffect(() => {
    if (ownerIndex !== undefined && recoveryAccount) {
      connectSmartWallet.mutate();
    }
  }, [ownerIndex, recoveryAccount]);

  const connectSmartWallet = useMutation({
    mutationFn: async () => {
      if (!user || !client || !recoveryAccount) {
        throw new Error("Missing required data");
      }

      const smartWalletAccount = await toCoinbaseSmartAccount({
        address: user.walletAddress,
        client,
        owners: [recoveryAccount],
        // @ts-ignore -- patched into viem
        signatureOwnerIndex: ownerIndex,
      });

      const bundlerClient = createBundlerClient({
        chain: client.chain,
        account: smartWalletAccount,
        transport: bundlerTransports[client.chain.id],
        userOperation: {
          async estimateFeesPerGas(parameters) {
            const estimatedFees = await client.estimateFeesPerGas();
            return {
              ...estimatedFees,
              maxFeePerGas: BigInt(
                Math.round(Number(estimatedFees.maxFeePerGas) * 1.12) // pimlico bundler needs a buffer
              ),
              maxPriorityFeePerGas: BigInt(
                Math.round(Number(estimatedFees.maxPriorityFeePerGas) * 1.12) // pimlico bundler needs a buffer
              ),
            };
          },
        },
      });

      const parsedPublicKey = parsePublicKey(user.passkeyPublicKey);

      // Get replayable UserOp (replay safe hash + nonce)
      const preparedUserOp = await bundlerClient.prepareUserOperation({
        nonce: BigInt(8453) << BigInt(64),
        initCode: user.importedAccountData?.initCode as Hex,
        calls: [
          {
            to: user.walletAddress,
            data: encodeFunctionData({
              abi: coinbaseSmartWalletAbi,
              functionName: "addOwnerPublicKey",
              args: [toHex(parsedPublicKey.x), toHex(parsedPublicKey.y)],
            }),
          },
        ],
      });

      const hash = await client.readContract({
        abi: coinbaseSmartWalletAbi,
        functionName: "getUserOpHashWithoutChainId",
        address: user.walletAddress,
        args: [preparedUserOp],
      });

      const signature = await smartWalletAccount.sign({
        hash,
      });

      console.log({
        preparedUserOp,
        hash,
        signature,
      });

      // TODO: Look into why we're getting UserOperationExecutionError: Invalid Smart Account nonce used for User Operation.

      // const userOpHash = await bundlerClient.sendUserOperation({
      //   ...preparedUserOp,
      //   signature,
      // })
    },
    onSuccess: () => {
      console.log("Smart wallet connected successfully");
      // TODO: Handle successful connection (e.g., show success message, redirect)
    },
    onError: (error) => {
      console.error("Error connecting smart wallet:", error);
      // TODO: Handle error (e.g., show error message)
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) {
        throw new Error("User not set");
      }

      let mnemonic = recoveryPhrase;

      const words = mnemonic.trim().split(" ");

      if (words[0].toLowerCase() !== "wallet") {
        throw new Error(
          "Invalid recovery phrase. The first word should be 'wallet'."
        );
      }

      // Remove the first word "wallet"
      mnemonic = words.slice(1).join(" ");

      if (mnemonic.split(" ").length !== 12) {
        throw new Error(
          "Invalid recovery phrase. Expected 12 words (excluding 'wallet')."
        );
      }

      const recoveryOwnerAccount = mnemonicToAccount(mnemonic);

      setRecoveryAccount(recoveryOwnerAccount);
    },
    onSuccess: (data) => {
      console.log("Recovery phrase submitted successfully:", data);
      // TODO: Handle successful submission (e.g., show success message, redirect)
    },
    onError: (error) => {
      console.error("Error submitting recovery phrase:", error);
      // TODO: Handle error (e.g., show error message)
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <div>
      <h1>Complete Import</h1>
      {!account.address ? (
        <div>
          <form onSubmit={handleSubmit}>
            <label htmlFor="recoveryPhrase">
              Enter your 13-word recovery phrase:
            </label>
            <textarea
              id="recoveryPhrase"
              value={recoveryPhrase}
              onChange={(e) => setRecoveryPhrase(e.target.value)}
              rows={4}
              placeholder="Enter your 13-word recovery phrase here"
              required
            />
            <button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Submitting..." : "Submit"}
            </button>
          </form>
          {mutation.isSuccess && <p>Recovery phrase submitted successfully!</p>}
          {mutation.isError && (
            <p>Error submitting recovery phrase. Please try again.</p>
          )}
        </div>
      ) : (
        <div>
          Connected to {account.address} with owner {recoveryAccount?.address}
        </div>
      )}
    </div>
  );
}
