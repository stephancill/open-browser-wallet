import { createProxyRequestHandler } from "@/lib/utils";

export const POST = createProxyRequestHandler(
  (req) =>
    `https://api.pimlico.io/v2/${req.nextUrl.searchParams.get("chainId")}/rpc?apikey=${process.env.PIMLICO_API_KEY}`,
  {
    searchParams: {
      apikey: process.env.PIMLICO_API_KEY,
    },
  }
);

// export const POST = createProxyRequestHandler((req) => "http://localhost:3009");
