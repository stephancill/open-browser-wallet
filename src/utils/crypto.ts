import { concatBytes, utf8ToBytes } from "@noble/curves/abstract/utils";
import { secp256r1 } from "@noble/curves/p256";
import { hashMessage, Hex, hexToBytes } from "viem";
import { bytesToHex, parseSignature, serializePublicKey, sign, WebAuthnData } from "webauthn-p256";
import { LOCAL_STORAGE_KEY_PUBKEYS } from "../libs/smart-wallet/service/userOps";

type SignatureAndMessage = { signatureHex: Hex; messageHash: Hex };

/**
 * Finds the candidate public keys for two pairs of signatures and messages and returns the correct one.
 * @param param0 Signature and message pairs
 * @returns The recovered public key or undefined if the public key could not be recovered
 */
function recoverPublicKey([input1, input2]: [SignatureAndMessage, SignatureAndMessage]):
  | Hex
  | undefined {
  // Return the candidate public key that appears twice
  return firstDuplicate([...getCandidatePublicKeys(input1), ...getCandidatePublicKeys(input2)]);
}

/**
 * Returns the two candidate public keys for a given signature and message.
 * @param input Signature and message pair
 * @returns The two candidate public keys
 */
function getCandidatePublicKeys(input: SignatureAndMessage) {
  const signatureParsed = parseSignature(input.signatureHex);
  const candidate1 = new secp256r1.Signature(signatureParsed.r, signatureParsed.s)
    .addRecoveryBit(1)
    .recoverPublicKey(input.messageHash.slice(2));
  const candidate2 = new secp256r1.Signature(signatureParsed.r, signatureParsed.s)
    .addRecoveryBit(0)
    .recoverPublicKey(input.messageHash.slice(2));

  return [serializePublicKey(candidate1), serializePublicKey(candidate2)];
}

/**
 * Recovers the public key from a signature and message pair by requesting an additional signature and caches it in local storage.
 * @param input Signature and message pair
 * @returns The recovered public key or undefined if the public key could not be recovered
 */
export async function recoverPublicKeyWithCache(input: SignatureAndMessage) {
  const [candidate1, candidate2] = getCandidatePublicKeys(input);

  // Check if the public key is in the local storage
  const savedKeys = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_PUBKEYS) || "{}");
  if (isPublicKeyCached(candidate1)) return candidate1;
  if (isPublicKeyCached(candidate2)) return candidate2;

  const randomChallenge = bytesToHex(
    Uint8Array.from(Math.random().toString(), (c) => c.charCodeAt(0)),
  );
  const message2 = hashMessage(randomChallenge);
  const { signature: signature2, webauthn: webauthn2 } = await sign({
    hash: message2,
  });
  const messageHash2 = await getMessageHash(webauthn2);

  const publicKey = recoverPublicKey([
    input,
    { signatureHex: signature2, messageHash: messageHash2 },
  ]);

  if (publicKey) {
    // Save key to local storage
    cachePublicKey(publicKey);
  }

  return publicKey;
}

function isPublicKeyCached(publicKey: Hex) {
  const savedKeys = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_PUBKEYS) || "{}");
  if (savedKeys[publicKey]) console.log("cached", publicKey);
  return savedKeys[publicKey];
}

function cachePublicKey(publicKey: Hex) {
  const savedKeys = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_PUBKEYS) || "{}");
  savedKeys[publicKey] = true;
  localStorage.setItem(LOCAL_STORAGE_KEY_PUBKEYS, JSON.stringify(savedKeys));
}

/**
 * Returns the message hash from a WebAuthn object.
 * Source: webauthn-p256/verify.ts
 * @param webauthn Response from WebAuthn API
 * @returns The message hash
 */
export async function getMessageHash(
  webauthn: Omit<WebAuthnData, "typeIndex" | "challengeIndex"> & {
    challengeIndex?: number;
    typeIndex?: number;
  },
): Promise<Hex | never> {
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
