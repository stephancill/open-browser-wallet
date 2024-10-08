import { redis } from "@/lib/redis";
import { toHex } from "viem";
import { CHALLENGE_DURATION_SECONDS } from "@/lib/constants";

export async function POST(req: Request) {
  const { nonce } = await req.json();

  const challenge = toHex(crypto.getRandomValues(new Uint8Array(32)));

  // Set the challenge with a 60-second expiration
  await redis.setex(
    `challenge:${nonce}`,
    CHALLENGE_DURATION_SECONDS,
    challenge
  );

  return Response.json({
    challenge,
  });
}
