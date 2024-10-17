import { withAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  bigintReplacer,
  getBundlerTransportByChainId,
  getTransportByChainId,
  getUserOpsFromTransaction,
} from "@/lib/utils";
import { chains } from "@/lib/wagmi";
import {
  createPublicClient,
  createWalletClient,
  decodeAbiParameters,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  Hex,
  numberToHex,
  parseSignature,
  serializeSignature,
  size,
} from "viem";
import {
  createBundlerClient,
  entryPoint06Abi,
  entryPoint06Address,
  formatUserOperationRequest,
} from "viem/account-abstraction";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

function wrapSignature(parameters: {
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

  if (size(signatureData) === 65) {
    return {
      ownerIndex,
      signature: signatureData,
    };
  }

  const parsedSignature = parseSignature(signatureData);

  const signature = serializeSignature(parsedSignature);

  // const signature = encodeSignature({
  //   r,
  //   s,
  //   v: v === 27 ? 0 : 1,
  // });

  return {
    ownerIndex,
    signature,
  };
}

export const POST = withAuth(async (req, user) => {
  // The chain to replay on
  const chainId = req.nextUrl.searchParams.get("chainId");

  if (!user.importedAccountData) {
    return Response.json(
      { error: "User does not have imported account data" },
      { status: 400 }
    );
  }

  if (!process.env.BUNDLER_PRIVATE_KEY) {
    console.error("BUNDLER_PRIVATE_KEY is not set");
    return new Response("Self-bundling is not supported", { status: 500 });
  }

  if (!chainId) {
    return new Response("chainId search param is required", { status: 400 });
  }

  const chain = chains.find((chain) => chain.id === parseInt(chainId));

  if (!chain) {
    return new Response("Unsupported chain", { status: 400 });
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

        // There will only be one replayable userOp per account per transaction
        const userOpResponse = userOpsResponses.find(
          (userOpResponse) =>
            userOpResponse.userOperation.callData.startsWith("0x2c2abd1e") // executeWithoutChainIdValidation
          // userOpResponse.userOperation.maxFeePerGas === BigInt(0) // Can only replay with 0 fees
        );

        if (!userOpResponse) {
          throw new Error("No replayable userOp found");
        }

        const serializedUserOp = formatUserOperationRequest(
          userOpResponse.userOperation
        );

        return {
          ...ownerAddTransaction,
          serializedUserOp,
          userOp: {
            ...userOpResponse.userOperation,
            initCode: "0x" as Hex,
            paymasterAndData: "0x" as Hex,
          },
        };
      }
    )
  );

  // Replay all on target chain
  const bundlerAccount = privateKeyToAccount(process.env.BUNDLER_PRIVATE_KEY);

  const walletClient = createWalletClient({
    chain,
    transport: getTransportByChainId(chain.id),
    account: bundlerAccount,
  });

  const publicClient = createPublicClient({
    chain,
    transport: getTransportByChainId(chain.id),
  });

  const initCode = user.importedAccountData.initCode;

  const deployUpToIndex = updatedAddOwnerTransactions.findIndex(
    (tx) =>
      tx.userOp?.maxFeePerGas !== BigInt(0) &&
      tx.userOp?.maxFeePerGas !== numberToHex(0)
  );

  console.log(
    "encoded deploy tx",
    initCode.slice(0, 42) as `0x${string}`,
    "0x" + initCode.slice(42)
  );

  console.log(
    "adding owners",
    updatedAddOwnerTransactions
      .filter(
        (tx) =>
          tx.userOp?.maxFeePerGas === BigInt(0) ||
          tx.userOp?.maxFeePerGas === numberToHex(0)
      )
      // .slice(0, deployUpToIndex)
      .map((tx) => tx.owner)
  );

  // Cut up into chunks such that no chunk has a userOp that depends on another userOp in the same chunk
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

  console.log("groups", groups);

  for (const group of groups) {
    console.log(
      "group",
      group.map((s) => s!.ownerIndex)
    );

    console.log("sending to ", entryPoint06Address);

    console.log(
      "encoded",
      encodeFunctionData({
        abi: entryPoint06Abi,
        functionName: "handleOps",
        args: [
          group
            .filter(
              (item) =>
                item?.tx.userOp?.maxFeePerGas === BigInt(0) ||
                item?.tx.userOp?.maxFeePerGas === numberToHex(0)
            )
            .map((item) => item?.tx.userOp),
          bundlerAccount.address,
        ],
      })
    );
  }

  // const deployTx = await walletClient.sendTransaction({
  //   to: initCode.slice(0, 42) as `0x${string}`,
  //   data: ("0x" + initCode.slice(42)) as `0x${string}`,
  // });

  // const handleOpsHash = await walletClient.writeContract({
  //   abi: entryPoint06Abi,
  //   address: entryPoint06Address,
  //   functionName: "handleOps",
  //   args: [
  //     updatedAddOwnerTransactions
  //       .map((tx) => tx.userOp)
  //       .slice(0, deployUpToIndex),
  //     bundlerAccount.address,
  //   ],
  // });

  // Check for ownerAdd events
  // const hash = await publicClient.waitForTransactionReceipt({
  //   hash: handleOpsHash,
  // });

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
      },
    })
    .where("id", "=", user.id)
    .execute();

  return Response.json({
    owners: JSON.parse(
      JSON.stringify(updatedAddOwnerTransactions, bigintReplacer)
    ),
    // hash: handleOpsHash,
  });
});
