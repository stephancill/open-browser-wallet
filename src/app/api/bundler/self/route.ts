/**
 * This route submits a user operation directly to the entry point
 */
import { NextRequest } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  getAddress,
  http,
} from "viem";
import { chains } from "@/lib/wagmi";
import { privateKeyToAccount } from "viem/accounts";
import { entryPoint06Abi, entryPoint06Address } from "viem/account-abstraction";
import { withAuth } from "@/lib/auth";
import { getTransportByChainId } from "@/lib/utils";
import { coinbaseSmartWalletAbi } from "@/abi/coinbaseSmartWallet";
import { Hex } from "webauthn-p256";
import { db } from "@/lib/db";

export const POST = withAuth(async (request: NextRequest, user) => {
  const { method, params } = await request.json();
  const chainId = request.nextUrl.searchParams.get("chainId");

  if (!process.env.BUNDLER_PRIVATE_KEY) {
    console.error("BUNDLER_PRIVATE_KEY is not set");
    return new Response("Self-bundling is not supported", { status: 500 });
  }

  if (method !== "eth_sendUserOperationSelf") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!chainId) {
    return new Response("chainId search param is required", { status: 400 });
  }

  const [userOp, entryPoint] = params;

  if (entryPoint !== entryPoint06Address) {
    return new Response("Unsupported entry point", { status: 400 });
  }

  const chain = chains.find((chain) => chain.id === parseInt(chainId));

  if (!chain) {
    return new Response("Unsupported chain", { status: 400 });
  }

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

  const handleOpsHash = await walletClient.writeContract({
    abi: entryPoint06Abi,
    address: entryPoint06Address,
    functionName: "handleOps",
    args: [[userOp], bundlerAccount.address],
  });

  // Check for ownerAdd events
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: handleOpsHash,
  });

  const userOpHash = receipt.logs.reduce<Hex | undefined>((hash, log) => {
    if (hash) return hash;
    try {
      const event = decodeEventLog({
        abi: entryPoint06Abi,
        data: log.data,
        topics: log.topics,
      });

      if (
        event.eventName === "UserOperationEvent" &&
        getAddress(event.args.sender) === getAddress(user.walletAddress)
      ) {
        return event.args.userOpHash;
      }
    } catch (error) {
      // Ignore decoding errors
    }
    return undefined;
  }, undefined);

  if (!userOpHash) {
    throw new Error("UserOperationEvent not found in transaction logs");
  }

  const addOwnerLogs = receipt.logs.filter((log) => {
    try {
      const event = decodeEventLog({
        abi: coinbaseSmartWalletAbi,
        data: log.data,
        topics: log.topics,
      });
      return (
        event.eventName === "AddOwner" &&
        getAddress(log.address) === getAddress(user.walletAddress)
      );
    } catch (error) {
      return false;
    }
  });

  const addOwnerTransactions: {
    transactionHash: Hex;
    owner: Hex;
  }[] = addOwnerLogs.map((log: any) => {
    const event = decodeEventLog({
      abi: coinbaseSmartWalletAbi,
      data: log.data,
      topics: log.topics,
    });

    if (event.eventName !== "AddOwner") {
      throw new Error("Invalid event name");
    }

    return {
      transactionHash: log.transactionHash,
      owner: event.args.owner,
    };
  });

  if (addOwnerTransactions.length > 0 && user.importedAccountData) {
    const rows = await db
      .updateTable("users")
      .set({
        importedAccountData: {
          ...user.importedAccountData,
          addOwnerTransactions: [
            ...user.importedAccountData?.addOwnerTransactions,
            ...addOwnerTransactions,
          ],
        },
      })
      .where("id", "=", user.id)
      .returningAll()
      .execute();

    console.log(`Updated ${rows.length} `);
  } else {
    console.warn("No ownerAdd events found");
  }

  if (receipt.status !== "success") {
    return Response.json({ error: "Transaction failed" }, { status: 400 });
  }

  return Response.json({
    jsonrpc: "2.0",
    id: 1,
    // Note: eth_sendUserOperation should return the userOpHash, but we return handleOps tx hash instead because of a limitation in local testing
    result: [handleOpsHash, userOpHash],
  });
});
