import { NextRequest } from "next/server";
import { verify } from "webauthn-p256";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { Hex } from "viem";
import { lucia } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { credential, nonce } = await req.json();

  const {
    signature,
    webauthn,
    raw: { id: credentialId },
  } = credential;

  const challenge = (await redis.get(`challenge:${nonce}`)) as Hex | null;

  if (!challenge) {
    return Response.json({ error: "Challenge not found" }, { status: 404 });
  }

  const user = await db
    .selectFrom("users")
    .where("passkeyId", "=", credentialId)
    .selectAll()
    .executeTakeFirst();

  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const verifyResult = await verify({
    hash: challenge,
    publicKey: user.passkeyPublicKey,
    signature,
    webauthn,
  });

  if (!verifyResult) {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  const session = await lucia.createSession(user.id, {});

  return Response.json(
    {
      success: true,
      user,
      session,
    },
    {
      headers: {
        "Set-Cookie": lucia.createSessionCookie(session.id).serialize(),
      },
    }
  );
}
