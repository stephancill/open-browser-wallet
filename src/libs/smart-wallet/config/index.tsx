import { fallback, http } from "viem";

// const publicRpc = http("https://goerli.base.org");
// const localhost = http("http://localhost:8545");
const stackUpBundlerRpcUrl = http(process.env.NEXT_PUBLIC_RPC_ENDPOINT);

export const transport = stackUpBundlerRpcUrl;
