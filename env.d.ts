declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NEXT_PUBLIC_WC_PROJECT_ID: string;
      PIMLICO_API_KEY: string;
      REDIS_URL: string;
      DATABASE_URL: string;
      // Twilio
      TWILIO_ACCOUNT_SID: string;
      TWILIO_AUTH_TOKEN: string;
      TWILIO_VERIFY_SERVICE_SID: string;
    }
  }
}

export {};
