import { createProxyRequestHandler } from "@/lib/utils";

// TODO: make the target URL a transformation of the request URL
export const POST = createProxyRequestHandler(
  `https://api.developer.coinbase.com/rpc/v1/base/${process.env.CDP_API_KEY}`
);
