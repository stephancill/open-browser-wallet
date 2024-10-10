import { Address, EIP1193Provider } from "viem";
import {
  decryptContent,
  encryptContent,
  exportKeyToHexString,
  importKeyFromHexString,
  RPCRequest,
  RPCResponse,
} from "./cipher";
import { SCWKeyManager } from "./SCWKeyManager";

const keyManager = new SCWKeyManager();

export async function getEncryptedMessage({
  id,
  content,
}: {
  id: string;
  content: any;
}) {
  const secret = await keyManager.getSharedSecret();

  if (!secret) {
    throw new Error("Shared secret not derived");
  }

  const encrypted = await encryptContent(content, secret);

  const messageBody = {
    id,
    requestId: id,
    timestamp: new Date().getTime(),
    sender: await exportKeyToHexString(
      "public",
      await keyManager.getOwnPublicKey()
    ),
    content: {
      encrypted,
    },
  };

  return messageBody;
}

export async function handleMessage({
  data,
  transportEndpoints,
  providerRequest,
}: {
  data: {
    id: string;
    sender: string;
    sdkVersion: string;
    timestamp: string;
    event: string;
    content: any;
  };
  transportEndpoints?: Record<number, string>;
  providerRequest?: EIP1193Provider["request"];
}) {
  let decrypted: RPCRequest | RPCResponse<unknown> | undefined;
  if (data.content?.encrypted) {
    const secret = await keyManager.getSharedSecret();
    if (!secret) {
      console.error("Shared secret not derived");
      return;
    }
    decrypted = await decryptContent(data.content.encrypted, secret);
    data.content.decrypted = decrypted;
  }

  if (data.event === "selectSignerType") {
    return { requestId: data.id, data: "scw" };
  } else if (data.content?.handshake?.method === "eth_requestAccounts") {
    const peerPublicKey = await importKeyFromHexString("public", data.sender);
    await keyManager.setPeerPublicKey(peerPublicKey);

    const accounts = await providerRequest?.({
      method: "eth_requestAccounts",
    });

    const response = {
      result: { value: accounts },
      data: {
        chains: transportEndpoints,
      },
    };

    return getEncryptedMessage({ id: data.id, content: response });
  } else if (decrypted && "action" in decrypted) {
    const result = await providerRequest?.({
      method: decrypted.action.method as any,
      params: decrypted.action.params as any,
    });

    const response = {
      result: { value: result },
    };

    return getEncryptedMessage({ id: data.id, content: response });
  }
}
