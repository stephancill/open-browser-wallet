import { lucia } from "@/lib/auth";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { NextRequest } from "next/server";
import { Address, createPublicClient, getAddress, Hex, http } from "viem";
import {
  createBundlerClient,
  toCoinbaseSmartAccount,
  toWebAuthnAccount,
} from "viem/account-abstraction";
import { base } from "viem/chains";
import { COINBASE_SMART_WALLET_PROXY_BYTECODE } from "@/lib/constants";
import {
  getAddOwnerTransactions,
  getUserOpsFromTransaction,
} from "@/lib/utils";
import { UserRow } from "@/types/db";

export async function POST(req: NextRequest) {
  const {
    username,
    passkeyId,
    passkeyPublicKey,
    nonce,
    walletAddress: walletAddressRaw,
  } = await req.json();

  // Validate the challenge
  const challenge = (await redis.get(`challenge:${nonce}`)) as Hex | null;

  if (!challenge) {
    return Response.json({ error: "Challenge not found" }, { status: 404 });
  }

  // Check if the username is already taken
  const existingUser = await db
    .selectFrom("users")
    .where("username", "=", username)
    .selectAll()
    .executeTakeFirst();

  if (existingUser) {
    return Response.json({ error: "Username already exists" }, { status: 400 });
  }

  const baseClient = createPublicClient({
    chain: base,
    transport: http(),
  });

  let walletAddress: Address;
  let importedAccountData: UserRow["importedAccountData"] | undefined;

  if (walletAddressRaw) {
    console.log(
      "wallet address raw",
      walletAddressRaw,
      getAddress(walletAddressRaw)
    );

    walletAddress = getAddress(walletAddressRaw);
    const code = await baseClient.getCode({
      address: walletAddress,
    });

    const isCoinbaseSmartWallet = code === COINBASE_SMART_WALLET_PROXY_BYTECODE;

    if (!isCoinbaseSmartWallet) {
      return Response.json(
        { error: "Wallet is not a Coinbase Smart Wallet" },
        { status: 400 }
      );
    }

    // TODO: Check implementation code at storage

    const [deployTransaction, ...addOwnerTransactions] =
      await getAddOwnerTransactions({
        address: walletAddress,
        chainId: base.id,
      });

    const bundlerClient = createBundlerClient({
      chain: base,
      transport: http(
        `https://api.pimlico.io/v2/${base.id}/rpc?apikey=${process.env.PIMLICO_API_KEY}`
      ),
    });

    // TODO: Simulate all userOps to see which one results in deployed contract, for now we assume it's the first one (might be possible to do offline)
    const deployUserOp = (
      await getUserOpsFromTransaction({
        bundlerClient,
        // @ts-ignore -- idk
        client: baseClient,
        transactionHash: deployTransaction.transactionHash,
      })
    ).find((userOp) => userOp.userOperation.initCode);

    if (!deployUserOp) {
      return Response.json(
        { error: "Failed to get deploy user op" },
        { status: 500 }
      );
    }

    const initCode = deployUserOp.userOperation.initCode!;

    importedAccountData = {
      addOwnerTransactions,
      initCode,
    };
  } else {
    const account = await toCoinbaseSmartAccount({
      owners: [
        toWebAuthnAccount({
          credential: {
            id: passkeyId,
            publicKey: passkeyPublicKey,
          },
        }),
      ],
      client: baseClient,
    });
    walletAddress = account.address;
  }

  // Create the new user
  const newUser = await db
    .insertInto("users")
    .values({
      username,
      passkeyId,
      passkeyPublicKey,
      walletAddress,
      importedAccountData,
    })
    .returningAll()
    .executeTakeFirst();

  if (!newUser) {
    return Response.json({ error: "Failed to create user" }, { status: 500 });
  }

  // Delete the used challenge
  await redis.del(`challenge:${nonce}`);

  const session = await lucia.createSession(newUser.id, {});

  return Response.json(
    {
      success: true,
      user: newUser,
      session,
    },
    {
      headers: {
        "Set-Cookie": lucia.createSessionCookie(session.id).serialize(),
      },
    }
  );
}
