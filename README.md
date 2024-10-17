# Open Browser Wallet

A lightweight, but fully featured passkey-based ethereum wallet built on Coinbase Smart Wallet contracts.

## Features
- Sign up, log in with passkey
- Authenticated sessions
- Connect to apps with Coinbase Wallet SDK, Mobile Wallet Protocol, and WalletConnect
- Supports most common wallet features (sign messages, sign transactions, etc.)
- Multichain support

### Planned

- [ ] Paymaster support
- [ ] Phone number login example
- [ ] No backend example
- [ ] Payment intents
- [ ] Account recovery

## Development

Copy the `.env.sample` file to `.env.local` and fill in the missing values.

```
cp .env.sample .env.local
```

Run the docker services (PostgreSQL, Redis)

```
docker compose up -d
```

Install dependencies and setup the database.

```
pnpm install
pnpm run migrate
```

Run the Next.js app

```
pnpm run dev
```

### Fork testing

To run a self-bundler for testing, run the following command:

```
anvil --fork-url https://mainnet.base.org --block-time 2
```

```
docker compose up -d rundler
```



## Looking for the old repo?

https://github.com/stephancill/open-browser-wallet-old
