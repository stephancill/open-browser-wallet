"use client";

import { coinbaseSmartWalletAbi } from "@/abi/coinbaseSmartWallet";
import { bigintReplacer, getTransportByChainId } from "@/lib/utils";
import { bundlerTransports } from "@/lib/wagmi";
import { useSession } from "@/providers/SessionProvider";
import { useSmartWalletAccount } from "@/providers/SmartWalletAccountProvider";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  Hex,
  LocalAccount,
  padHex,
  parseSignature,
  size,
  toHex,
} from "viem";
import {
  createBundlerClient,
  entryPoint06Address,
  formatUserOperationRequest,
  toCoinbaseSmartAccount,
} from "viem/account-abstraction";
import { mnemonicToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { useDisconnect } from "wagmi";
import { parsePublicKey } from "webauthn-p256";

export function wrapSignature(parameters: {
  ownerIndex?: number | undefined;
  signature: Hex;
}) {
  const { ownerIndex = 0 } = parameters;
  const signatureData = (() => {
    if (size(parameters.signature) !== 65) return parameters.signature;
    const signature = parseSignature(parameters.signature);
    return encodePacked(
      ["bytes32", "bytes32", "uint8"],
      [signature.r, signature.s, signature.yParity === 0 ? 27 : 28]
    );
  })();
  return encodeAbiParameters(
    [
      {
        components: [
          {
            name: "ownerIndex",
            type: "uint8",
          },
          {
            name: "signatureData",
            type: "bytes",
          },
        ],
        type: "tuple",
      },
    ],
    [
      {
        ownerIndex,
        signatureData,
      },
    ]
  );
}

export default function ImportCompletePage() {
  const { user } = useSession();
  const { disconnect } = useDisconnect();
  const router = useRouter();
  const { refetchOwners, owners, passkeyOwnerIndex } = useSmartWalletAccount();

  useEffect(() => {
    disconnect();
  }, []);

  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [recoveryAccount, setRecoveryAccount] = useState<LocalAccount | null>(
    null
  );

  const recoveryOwnerIndex = useMemo(() => {
    if (!recoveryAccount?.address || !owners) return undefined;

    return owners.findIndex(
      (owner) =>
        owner === padHex(recoveryAccount.address, { size: 32 }).toLowerCase()
    );
  }, [owners, recoveryAccount]);

  useEffect(() => {
    if (passkeyOwnerIndex !== undefined && passkeyOwnerIndex >= 0) {
      router.push("/");
    }
  }, [passkeyOwnerIndex]);

  const addPasskeyOwner = useMutation({
    mutationFn: async () => {
      if (!user || !recoveryAccount || !recoveryAccount.sign) {
        throw new Error("Missing required data");
      }

      // We deploy all new owners on base first
      const client = createPublicClient({
        chain: base,
        transport: getTransportByChainId(base.id),
      });

      const smartWalletAccount = await toCoinbaseSmartAccount({
        address: user.walletAddress,
        client,
        owners: [recoveryAccount],
        // @ts-ignore -- patched into viem
        signatureOwnerIndex: recoveryOwnerIndex,
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

      const stubSignature = await smartWalletAccount.getStubSignature();
      const nonce = await smartWalletAccount.getNonce({
        key: BigInt(8453),
      });

      const preparedUserOpWithGasFees =
        await bundlerClient.prepareUserOperation({
          callData: encodeFunctionData({
            abi: coinbaseSmartWalletAbi,
            functionName: "executeWithoutChainIdValidation",
            args: [
              [
                encodeFunctionData({
                  abi: coinbaseSmartWalletAbi,
                  functionName: "addOwnerPublicKey",
                  args: [toHex(parsedPublicKey.x), toHex(parsedPublicKey.y)],
                }),
              ],
            ],
          }),
          sender: smartWalletAccount.address,
          nonce: nonce,
          signature: stubSignature,
          initCode: "0x",
        });

      const preparedUserOp = {
        ...preparedUserOpWithGasFees,
      };

      preparedUserOp.maxFeePerGas = BigInt(0);
      preparedUserOp.maxPriorityFeePerGas = BigInt(0);
      preparedUserOp.callGasLimit = BigInt(1000000);
      preparedUserOp.preVerificationGas = BigInt(1000000);
      preparedUserOp.verificationGasLimit = BigInt(1000000);

      const hash = await client.readContract({
        abi: coinbaseSmartWalletAbi,
        functionName: "getUserOpHashWithoutChainId",
        address: user.walletAddress,
        args: [preparedUserOp],
      });

      const signature = await recoveryAccount.sign({ hash });
      const wrappedSignature = wrapSignature({
        signature,
        ownerIndex: recoveryOwnerIndex,
      });

      console.log(
        "userOp",
        JSON.stringify(
          {
            ...preparedUserOp,
            signature: wrappedSignature,
          },
          bigintReplacer
        )
      );

      const rpcParameters = formatUserOperationRequest({
        ...preparedUserOp,
        signature: wrappedSignature,
      });

      const {
        result: [userOpHash, handleOpsHash],
      } = await fetch(`/api/bundler/self?chainId=${client.chain.id}`, {
        method: "POST",
        body: JSON.stringify({
          method: "eth_sendUserOperationSelf",
          params: [rpcParameters, entryPoint06Address],
        }),
      }).then((res) => res.json());

      console.log("userOpHash", userOpHash);
      console.log("handleOpsHash", handleOpsHash);

      // TODO: Maybe wait for transaction receipt?
      // const txReceipt = await client.waitForTransactionReceipt({
      //   hash: handleOpsHash,
      // });
      // console.log("txReceipt", txReceipt);
    },
    onSuccess: () => {
      console.log("Owner added successfully");
      refetchOwners();
    },
    onError: (error) => {
      console.error("Error connecting smart wallet:", error);
      // Error handling is now done in the component render
    },
  });

  const loadRecoveryAccount = useMutation({
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
    loadRecoveryAccount.mutate();
  };

  return (
    <div>
      <h1>Complete Import</h1>
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
          <button type="submit" disabled={loadRecoveryAccount.isPending}>
            {loadRecoveryAccount.isPending ? "Submitting..." : "Submit"}
          </button>
        </form>
        {owners && (
          <div>
            <div>Owners ({owners.length}):</div>
            {owners.map((owner, index) => (
              <div key={index}>{owner}</div>
            ))}
          </div>
        )}

        <br />

        {recoveryAccount?.address && (
          <div>
            <div>Recovery account: {recoveryAccount.address}</div>
            <div>Index: {recoveryOwnerIndex}</div>
            {recoveryOwnerIndex !== undefined && recoveryOwnerIndex >= 0 && (
              <button
                onClick={() => addPasskeyOwner.mutate()}
                disabled={addPasskeyOwner.isPending}
              >
                {addPasskeyOwner.isPending ? "Adding..." : "Add Passkey Owner"}
              </button>
            )}
            {recoveryOwnerIndex === -1 && (
              <div>Recovery account is not an owner</div>
            )}
            {addPasskeyOwner.isError && (
              <div style={{ color: "red" }}>
                Error adding passkey owner:{" "}
                {addPasskeyOwner.error?.message || "An unknown error occurred"}
              </div>
            )}
          </div>
        )}
        {loadRecoveryAccount.isError && (
          <p>Loading recovery account. Please try again.</p>
        )}
      </div>
    </div>
  );
}
