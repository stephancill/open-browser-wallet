declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NEXT_PUBLIC_WC_PROJECT_ID: string;
      PIMLICO_API_KEY: string;
      REDIS_URL: string;
      DATABASE_URL: string;
      /** Private key used to submit user operations directly to the entry point */
      BUNDLER_PRIVATE_KEY: `0x${string}` | undefined;
      /** EVM RPC URL for a specific chain */
      [`NEXT_PUBLIC_EVM_RPC_URL_${number}`]: string | undefined;
      [`EVM_BUNDLER_RPC_URL_${number}`]: string | undefined;
    }
  }
}

export {};
