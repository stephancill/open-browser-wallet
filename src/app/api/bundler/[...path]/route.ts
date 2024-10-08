import { createProxyRequestHandler } from "@/lib/utils";

export const POST = createProxyRequestHandler("https://api.pimlico.io", {
  searchParams: {
    apikey: process.env.PIMLICO_API_KEY,
  },
});
