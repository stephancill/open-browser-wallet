import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { createPublicClient, Hex, http } from "viem";
import {
  toCoinbaseSmartAccount,
  toWebAuthnAccount,
} from "viem/account-abstraction";
import { base } from "viem/chains";
import { lucia } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { phoneNumber, passkeyId, passkeyPublicKey, nonce } = await req.json();

  // Validate the challenge
  const challenge = (await redis.get(`challenge:${nonce}`)) as Hex | null;

  if (!challenge) {
    return Response.json({ error: "Challenge not found" }, { status: 404 });
  }

  // Check if the phone number is already registered
  const existingUser = await db
    .selectFrom("users")
    .where("phoneNumber", "=", phoneNumber)
    .where("verifiedAt", "is not", null)
    .selectAll()
    .executeTakeFirst();

  if (existingUser) {
    return Response.json(
      { error: "Phone number already exists" },
      { status: 400 }
    );
  }

  const baseClient = createPublicClient({
    chain: base,
    transport: http(),
  });
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

  // Create the new user
  const newUser = await db
    .insertInto("users")
    .values({
      phoneNumber,
      passkeyId,
      passkeyPublicKey,
      walletAddress: account.address,
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
