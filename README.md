# Airtime Wallet

A lightweight, but fully featured passkey-based ethereum wallet built on Coinbase Smart Wallet contracts.

## Features
- Sign up, log in with passkey
- Authenticated sessions
- Connect to apps with Coinbase Wallet SDK, Mobile Wallet Protocol, and WalletConnect
- Supports most common wallet features (sign messages, sign transactions, etc.)
- Multichain support
- Paymaster support
- Phone number verification
- A store based on [Onchain Merchant](https://github.com/stephancill/onchain-merchant) with offchain fulfillment

## Development

Copy the `.env.sample` file to `.env.local` and fill in the missing values.

```
cp .env.sample .env.local
```

Run the docker services (PostgreSQL, Redis)

```
docker compose up -d
```

Install dependencies and run the Next.js app

```
pnpm install
pnpm run dev
```

## Looking for the old repo?

https://github.com/stephancill/open-browser-wallet-old
