import { withAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  bigintReplacer,
  getBundlerTransportByChainId,
  getTransportByChainId,
  getUserOpsFromTransaction,
} from "@/lib/utils";
import { createPublicClient, decodeAbiParameters, Hex } from "viem";
import { createBundlerClient } from "viem/account-abstraction";
import { base } from "viem/chains";

function unwrapSignature(wrappedSignature: Hex): {
  ownerIndex: number;
  signature: Hex;
} {
  const [decoded] = decodeAbiParameters(
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
    wrappedSignature
  );

  const { ownerIndex, signatureData } = decoded;

  return {
    ownerIndex,
    signature: signatureData,
  };
}

export const POST = withAuth(async (req, user) => {
  if (!user.importedAccountData) {
    return Response.json(
      { error: "User does not have imported account data" },
      { status: 400 }
    );
  }

  const baseBundlerClient = createBundlerClient({
    chain: base,
    transport: getBundlerTransportByChainId(base.id),
  });

  const basePublicClient = createPublicClient({
    chain: base,
    transport: getTransportByChainId(base.id),
  });

  const updatedAddOwnerTransactions = await Promise.all(
    user.importedAccountData.addOwnerTransactions.map(
      async (ownerAddTransaction) => {
        if (ownerAddTransaction.userOp) {
          return ownerAddTransaction;
        }

        const userOpsResponses = await getUserOpsFromTransaction({
          bundlerClient: baseBundlerClient,
          // @ts-ignore -- idk
          client: basePublicClient,
          transactionHash: ownerAddTransaction.transactionHash,
          sender: user.walletAddress,
        });

        // There will only be one replayable userOp per account per transaction on the root chain
        const userOpResponse = userOpsResponses.find(
          (userOpResponse) =>
            userOpResponse.userOperation.callData.startsWith("0x2c2abd1e") && // executeWithoutChainIdValidation
            userOpResponse.userOperation.maxFeePerGas === BigInt(0) // Can only replay with 0 fees
        );

        if (!userOpResponse) {
          throw new Error("No replayable userOp found");
        }

        return {
          ...ownerAddTransaction,
          userOp: {
            ...userOpResponse.userOperation,
            initCode: "0x" as Hex,
            paymasterAndData: "0x" as Hex,
          },
        };
      }
    )
  );

  // Divide up into chunks such that no chunk has a userOp that depends on another userOp in the same chunk
  const ownersAndSignatures = updatedAddOwnerTransactions
    .map((tx, index) =>
      tx.userOp
        ? {
            signatureData: unwrapSignature(tx.userOp.signature),
            owner: tx.owner,
            ownerIndex: index + 1,
            tx,
          }
        : undefined
    )
    .filter(Boolean);

  const groups = ownersAndSignatures.reduce(
    (acc, signature) => {
      const signerOwnerIndex = signature!.signatureData.ownerIndex;

      if (
        acc[acc.length - 1].find((s: any) => s!.ownerIndex === signerOwnerIndex)
      ) {
        acc.push([signature]);
        return acc;
      }
      acc[acc.length - 1].push(signature);
      return acc;
    },
    [[]] as (typeof ownersAndSignatures)[]
  );

  const ownerAddSequence = groups.map((group) =>
    group.map((s) => s!.ownerIndex)
  );

  // for (const group of groups) {
  //   console.log(
  //     "group",
  //     group.map((s) => s!.ownerIndex)
  //   );

  //   console.log(
  //     "encoded",
  //     encodeFunctionData({
  //       abi: entryPoint06Abi,
  //       functionName: "handleOps",
  //       args: [
  //         group
  //           .filter(
  //             (item) =>
  //               item?.tx.userOp?.maxFeePerGas === BigInt(0) ||
  //               item?.tx.userOp?.maxFeePerGas === numberToHex(0)
  //           )
  //           .map((item) => item?.tx.userOp),
  //         bundlerAccount.address,
  //       ],
  //     })
  //   );
  // }

  // Store fetched userOps
  await db
    .updateTable("users")
    .set({
      importedAccountData: {
        ...user.importedAccountData,
        addOwnerTransactions: updatedAddOwnerTransactions.map((tx) => ({
          ...tx,
          userOp: tx.userOp
            ? JSON.parse(JSON.stringify(tx.userOp, bigintReplacer))
            : undefined,
        })),
        ownerAddSequence,
      },
    })
    .where("id", "=", user.id)
    .execute();

  return Response.json({
    owners: JSON.parse(
      JSON.stringify(updatedAddOwnerTransactions, bigintReplacer)
    ),
  });
});
