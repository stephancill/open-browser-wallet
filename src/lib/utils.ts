import { NextRequest, NextResponse } from "next/server";
import {
  Address,
  createPublicClient,
  decodeEventLog,
  Hex,
  http,
  toHex,
} from "viem";
import { BundlerClient, entryPoint06Abi } from "viem/account-abstraction";
import { SignReturnType, WebAuthnData } from "webauthn-p256";
import { coinbaseSmartWalletAbi } from "../abi/coinbaseSmartWallet";

export function createProxyRequestHandler(
  targetUrl: string | ((req: NextRequest) => string),
  {
    searchParams = {},
    headers = {},
  }: {
    searchParams?: Record<string, string>;
    headers?: Record<string, string>;
  } = {}
) {
  return async function handler(
    req: NextRequest,
    context: { params?: { path: string[] } }
  ): Promise<NextResponse> {
    const url = new URL(
      typeof targetUrl === "function" ? targetUrl(req) : targetUrl
    );

    url.pathname = [
      ...url.pathname.split("/").slice(1),
      ...(context?.params?.path ?? []),
    ].join("/");

    url.search = req.nextUrl.search;

    Object.entries(searchParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    const newReqHeaders = new Headers(req.headers);
    newReqHeaders.delete("host");

    Object.entries(headers).forEach(([key, value]) => {
      newReqHeaders.set(key, value);
    });

    try {
      const response = await fetch(url, {
        method: req.method,
        headers: newReqHeaders,
        body: req.method === "POST" ? await req.text() : undefined,
      });

      const data = await response.text();

      const newResHeaders = new Headers(response.headers);
      newResHeaders.delete("host");
      newResHeaders.delete("content-encoding");

      return new NextResponse(data, {
        status: response.status,
        statusText: response.statusText,
        headers: newResHeaders,
      });
    } catch (error) {
      console.error("Proxy error:", error);
      return new NextResponse("Internal Server Error", { status: 500 });
    }
  };
}

export function getTransportByChainId(chainId: number) {
  // TODO: Find a better way to do this
  const env: any = {
    ...process.env,
    NEXT_PUBLIC_EVM_RPC_URL_8453: process.env.NEXT_PUBLIC_EVM_RPC_URL_8453,
  };

  const url = env[`NEXT_PUBLIC_EVM_RPC_URL_${chainId}`];
  if (url) {
    return http(url);
  } else {
    return http();
  }
}

export function getBundlerTransportByChainId(chainId: number) {
  const url = process.env[`EVM_BUNDLER_RPC_URL_${chainId}`];
  if (url) {
    return http(url);
  } else {
    return http();
  }
}

export function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function bigintReplacer(key: string, value: any) {
  if (typeof value === "bigint") {
    return toHex(value);
  }
  return value;
}

export function createUUID() {
  var s = [];
  var hexDigits = "0123456789abcdef";
  for (var i = 0; i < 36; i++) {
    s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
  }
  s[14] = "4"; // bits 12-15 of the time_hi_and_version field to 0010
  // @ts-ignore
  s[19] = hexDigits.substr((s[19] & 0x3) | 0x8, 1); // bits 6-7 of the clock_seq_hi_and_reserved to 01
  s[8] = s[13] = s[18] = s[23] = "-";
  return s.join("");
}

export function serializeSignReturnType(credential: SignReturnType) {
  const credentialToSend: {
    signature: Hex;
    webauthn: WebAuthnData;
    raw: { id: string };
  } = {
    signature: credential.signature,
    webauthn: {
      authenticatorData: credential.webauthn.authenticatorData,
      challengeIndex: credential.webauthn.challengeIndex,
      clientDataJSON: credential.webauthn.clientDataJSON,
      typeIndex: credential.webauthn.typeIndex,
      userVerificationRequired: credential.webauthn.userVerificationRequired,
    },
    raw: {
      id: credential.raw.id,
    },
  };

  return credentialToSend;
}

export async function getUserOpsFromTransaction({
  client,
  bundlerClient,
  transactionHash,
  sender,
}: {
  client: ReturnType<typeof createPublicClient>;
  bundlerClient: BundlerClient;
  transactionHash: `0x${string}`;
  sender?: Address;
}) {
  const deployReceipt = await client.getTransactionReceipt({
    hash: transactionHash,
  });

  const userOpEventLogs = deployReceipt.logs.filter((log) => {
    try {
      const event = decodeEventLog({
        abi: entryPoint06Abi,
        data: log.data,
        topics: log.topics,
      });
      return event.eventName === "UserOperationEvent";
    } catch (error) {
      return false;
    }
  });

  const userOps = await Promise.all(
    userOpEventLogs.map(async (log) => {
      const decodedEvent = decodeEventLog({
        abi: entryPoint06Abi,
        data: log.data,
        topics: log.topics,
      });

      if (decodedEvent.eventName !== "UserOperationEvent") {
        return null;
      }

      if (sender && decodedEvent.args.sender !== sender) {
        return null;
      }

      const userOp = await bundlerClient.getUserOperation({
        hash: decodedEvent.args.userOpHash,
      });

      return userOp;
    })
  );

  const filteredUserOps = userOps.filter((userOp) => userOp !== null);

  return filteredUserOps;
}

/**
 * Gets transactions that emitted an "AddOwner" event for the given address in ascending order (oldest first)
 */
export async function getAddOwnerTransactions({
  chainId,
  address,
}: {
  chainId: number;
  address: Address;
}) {
  const response = await fetch(
    `https://scope.sh/api/logs?chain=${chainId}&address=${address}&cursor=0&limit=21&sort=asc`
  );
  const data = await response.json();

  const addOwnerLogs = data.logs.filter((log: any) => {
    try {
      const event = decodeEventLog({
        abi: coinbaseSmartWalletAbi,
        data: log.data,
        topics: log.topics,
      });
      return event.eventName === "AddOwner";
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

  return addOwnerTransactions;
}
