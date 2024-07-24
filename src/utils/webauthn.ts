import { concatBytes, utf8ToBytes } from "@noble/curves/abstract/utils";
import { secp256r1 } from "@noble/curves/p256";
import { Hex, hexToBytes } from "viem";
import { bytesToHex, parseSignature, serializePublicKey } from "webauthn-p256";

type Point = { signatureHex: Hex; messageHash: Hex };

export function recoverPublicKey([point1, point2]: [Point, Point]): Hex | undefined {
  const signatureParsed1 = parseSignature(point1.signatureHex);
  const candidate1 = new secp256r1.Signature(signatureParsed1.r, signatureParsed1.s)
    .addRecoveryBit(1)
    .recoverPublicKey(point1.messageHash.slice(2));
  const candidate2 = new secp256r1.Signature(signatureParsed1.r, signatureParsed1.s)
    .addRecoveryBit(0)
    .recoverPublicKey(point1.messageHash.slice(2));

  const signatureParsed2 = parseSignature(point2.signatureHex);
  const candidate3 = new secp256r1.Signature(signatureParsed2.r, signatureParsed2.s)
    .addRecoveryBit(1)
    .recoverPublicKey(point2.messageHash.slice(2));
  const candidate4 = new secp256r1.Signature(signatureParsed2.r, signatureParsed2.s)
    .addRecoveryBit(0)
    .recoverPublicKey(point2.messageHash.slice(2));

  const candidates = [
    serializePublicKey(candidate1),
    serializePublicKey(candidate3),
    serializePublicKey(candidate2),
    serializePublicKey(candidate4),
  ];

  // Return the candidate that occurs twice in the list
  return firstDuplicate(candidates);
}

function firstDuplicate<T>(arr: T[]): T | undefined {
  const seen = new Set<T>();
  for (const s of arr) {
    if (seen.has(s)) {
      return s;
    }
    seen.add(s);
  }
  return undefined; // If no duplicates found
}

export async function getMessageHash(webauthn: any): Promise<Hex | never> {
  const {
    authenticatorData,
    challengeIndex: challengeIndexRaw,
    clientDataJSON,
    typeIndex: typeIndexRaw,
    userVerificationRequired,
  } = webauthn;

  const typeIndex = typeIndexRaw || clientDataJSON.indexOf('"type"');
  const challengeIndex = challengeIndexRaw || clientDataJSON.indexOf('"challenge"');

  const authenticatorDataBytes = hexToBytes(authenticatorData);

  // Check length of `authenticatorData`.
  if (authenticatorDataBytes.length < 37) throw new Error("Invalid authenticatorData");

  const flag = authenticatorDataBytes[32]!;

  // Verify that the UP bit of the flags in authData is set.
  if ((flag & 0x01) !== 0x01) throw new Error("Invalid authenticatorData");

  // If user verification was determined to be required, verify that
  // the UV bit of the flags in authData is set. Otherwise, ignore the
  // value of the UV flag.
  if (userVerificationRequired && (flag & 0x04) !== 0x04)
    throw new Error("Invalid authenticatorData");

  // If the BE bit of the flags in authData is not set, verify that
  // the BS bit is not set.
  if ((flag & 0x08) !== 0x08 && (flag & 0x10) === 0x10)
    throw new Error("Invalid authenticatorData");

  // Check that response is for an authentication assertion
  const type = '"type":"webauthn.get"';
  if (type !== clientDataJSON.slice(Number(typeIndex), type.length + 1))
    throw new Error("Invalid clientDataJSON");

  // Check that hash is in the clientDataJSON.
  const match = clientDataJSON.slice(Number(challengeIndex)).match(/^"challenge":"(.*?)"/);
  if (!match) throw new Error("Invalid clientDataJSON");

  // Validate the challenge in the clientDataJSON.
  const [_, challenge] = match;

  const clientDataJSONHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", utf8ToBytes(clientDataJSON)),
  );
  const messageHash = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      concatBytes(hexToBytes(authenticatorData), clientDataJSONHash),
    ),
  );

  return bytesToHex(messageHash);
}
