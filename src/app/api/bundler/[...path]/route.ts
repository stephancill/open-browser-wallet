import { createProxyRequestHandler } from "@/lib/utils";

// TODO: make the target URL a transformation of the request URL
export const POST = createProxyRequestHandler("https://api.pimlico.io", {
  searchParams: {
    apikey: process.env.PIMLICO_API_KEY,
  },
});
