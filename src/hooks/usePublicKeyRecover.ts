import React, { useState, useCallback } from "react";
import { bytesToHex, hashMessage, Hex } from "viem";
import { sign } from "webauthn-p256";
import {
  getMessageHash,
  getCandidatePublicKeys,
  isPublicKeyCached,
  cachePublicKey,
  recoverPublicKey,
} from "../utils/crypto";
import { getUser } from "../libs/factory/getUser";
import { Me, useMe } from "../providers/MeProvider";

type SignatureAndMessage = {
  messageHash: Hex;
  signatureHex: Hex;
};

export const usePublicKeyRecovery = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSecondSignature, setNeedsSecondSignature] = useState(false);
  const [firstSignature, setFirstSignature] = useState<SignatureAndMessage | null>(null);
  const { setMe } = useMe();

  const initiateRecovery = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const randomChallenge = bytesToHex(
        Uint8Array.from(Math.random().toString(), (c) => c.charCodeAt(0)),
      );
      const messageHash = hashMessage(randomChallenge);
      const { signature, webauthn } = await sign({ hash: messageHash });
      const webauthnHash = await getMessageHash(webauthn);

      const signatureAndMessage = {
        messageHash: webauthnHash,
        signatureHex: signature,
      };

      setFirstSignature(signatureAndMessage);

      // Check if we can recover the public key from local storage
      const [candidate1, candidate2] = getCandidatePublicKeys(signatureAndMessage);
      if (isPublicKeyCached(candidate1)) {
        await completeRecoveryWithKey(candidate1);
      } else if (isPublicKeyCached(candidate2)) {
        await completeRecoveryWithKey(candidate2);
      } else {
        setNeedsSecondSignature(true);
      }
    } catch (e) {
      setError("Failed to initiate recovery: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const completeRecoveryWithKey = async (publicKey: Hex) => {
    try {
      cachePublicKey(publicKey);
      const user = await getUser(publicKey);

      // TODO: Json RPC error
      if (!user?.account === undefined) {
        throw new Error("User not found");
      }

      const meData: Me = {
        keyId: user.id as Hex,
        pubKey: user.pubKey,
        account: user.account,
      };
      setMe(meData);
      setNeedsSecondSignature(false);
    } catch (e) {
      throw new Error(
        "Failed to complete recovery with key: " + (e instanceof Error ? e.message : String(e)),
      );
    }
  };

  const completeRecovery = useCallback(async () => {
    if (!firstSignature || !needsSecondSignature) {
      setError("Second signature not needed or first signature not available.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const randomChallenge = bytesToHex(
        Uint8Array.from(Math.random().toString(), (c) => c.charCodeAt(0)),
      );
      const message2 = hashMessage(randomChallenge);
      const { signature: signature2, webauthn: webauthn2 } = await sign({
        hash: message2,
      });
      const messageHash2 = await getMessageHash(webauthn2);

      const publicKey = recoverPublicKey([
        firstSignature,
        { signatureHex: signature2, messageHash: messageHash2 },
      ]);

      if (publicKey) {
        await completeRecoveryWithKey(publicKey);
      } else {
        throw new Error("Public key recovery failed");
      }
    } catch (e) {
      setError("Failed to complete recovery: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsLoading(false);
    }
  }, [firstSignature, needsSecondSignature]);

  return {
    isLoading,
    error,
    needsSecondSignature,
    initiateRecovery,
    completeRecovery,
  };
};
