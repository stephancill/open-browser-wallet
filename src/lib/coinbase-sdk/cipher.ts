export interface SerializedEthereumRpcError {
  code: number; // must be an integer
  message: string;
  data?: unknown;
  stack?: string;
}

export type RPCResponse<T> = {
  result:
    | {
        value: T; // JSON-RPC result
      }
    | {
        error: SerializedEthereumRpcError;
      };
  data?: {
    // optional data
    chains?: { [key: number]: string };
    capabilities?: Record<`0x${string}`, Record<string, unknown>>;
  };
};

const mapping = {
  handshake: ["eth_requestAccounts"],
  sign: [
    "eth_ecRecover",
    "personal_sign",
    "personal_ecRecover",
    "eth_signTransaction",
    "eth_sendTransaction",
    "eth_signTypedData_v1",
    "eth_signTypedData_v3",
    "eth_signTypedData_v4",
    "eth_signTypedData",
    "wallet_addEthereumChain",
    "wallet_switchEthereumChain",
    "wallet_watchAsset",
    "wallet_getCapabilities",
    "wallet_sendCalls",
    "wallet_showCallsStatus",
  ],
  state: [
    // internal state
    "eth_chainId",
    "eth_accounts",
    "eth_coinbase",
    "net_version",
  ],
  deprecated: ["eth_sign", "eth_signTypedData_v2"],
  unsupported: ["eth_subscribe", "eth_unsubscribe"],
  fetch: [],
} as const;

export type MethodCategory = keyof typeof mapping;
export type Method<C extends MethodCategory = MethodCategory> =
  (typeof mapping)[C][number];

export interface RequestArguments {
  readonly method: Method | string;
  readonly params?: readonly unknown[] | object;
}

export type RPCRequest = {
  action: RequestArguments; // JSON-RPC call
  chainId: number;
};

export type EncryptedData = {
  iv: ArrayBuffer;
  cipherText: ArrayBuffer;
};

function hexStringToUint8Array(hexString: string): Uint8Array {
  return new Uint8Array(
    hexString.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );
}

export function uint8ArrayToHex(value: Uint8Array) {
  return [...value].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    ["deriveKey"]
  );
}

export async function deriveSharedSecret(
  ownPrivateKey: CryptoKey,
  peerPublicKey: CryptoKey
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    {
      name: "ECDH",
      public: peerPublicKey,
    },
    ownPrivateKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encrypt(
  sharedSecret: CryptoKey,
  plainText: string
): Promise<EncryptedData> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherText = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    sharedSecret,
    new TextEncoder().encode(plainText)
  );

  return { iv, cipherText: new Uint8Array(cipherText) };
}

export async function decrypt(
  sharedSecret: CryptoKey,
  { iv, cipherText }: EncryptedData
): Promise<string> {
  const plainText = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(iv as any),
    },
    sharedSecret,
    Buffer.from(new Uint8Array(cipherText))
  );

  return new TextDecoder().decode(plainText);
}

function getFormat(keyType: "public" | "private") {
  switch (keyType) {
    case "public":
      return "spki";
    case "private":
      return "pkcs8";
  }
}

export async function exportKeyToHexString(
  type: "public" | "private",
  key: CryptoKey
): Promise<string> {
  const format = getFormat(type);
  const exported = await crypto.subtle.exportKey(format, key);
  return uint8ArrayToHex(new Uint8Array(exported));
}

export async function importKeyFromHexString(
  type: "public" | "private",
  hexString: string
): Promise<CryptoKey> {
  const format = getFormat(type);
  const arrayBuffer = hexStringToUint8Array(hexString).buffer;
  return await crypto.subtle.importKey(
    format,
    arrayBuffer,
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    type === "private" ? ["deriveKey"] : []
  );
}

export async function encryptContent<T>(
  content: RPCRequest | RPCResponse<T>,
  sharedSecret: CryptoKey
): Promise<EncryptedData> {
  const serialized = JSON.stringify(content, (_, value) => {
    if (!(value instanceof Error)) return value;

    const error = value as Error & { code?: unknown };
    return {
      ...(error.code ? { code: error.code } : {}),
      message: error.message,
    };
  });
  return encrypt(sharedSecret, serialized);
}

export async function decryptContent<R extends RPCRequest | RPCResponse<U>, U>(
  encryptedData: EncryptedData,
  sharedSecret: CryptoKey
): Promise<R> {
  return JSON.parse(await decrypt(sharedSecret, encryptedData));
}
