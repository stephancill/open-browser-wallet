import { NextRequest, NextResponse } from "next/server";
import { fallback, http } from "viem";

export function createProxyRequestHandler(
  targetUrl: string,
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
    const url = new URL(targetUrl);

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
  if (process.env[`EVM_RPC_URL_${chainId}`]) {
    console.log(
      `Using custom RPC URL for chain ${chainId}`,
      process.env[`EVM_RPC_URL_${chainId}`]
    );
    return fallback([http(process.env[`EVM_RPC_URL_${chainId}`]), http()]);
  } else {
    return http();
  }
}
