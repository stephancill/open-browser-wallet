# Open Browser Wallet

This is a passkey-based browser wallet similar to keys.coinbase.com that is compatible with the Coinbase Smart Wallet SDK provider. It is a fork of this [smart wallet project by passkeys-4337](https://github.com/passkeys-4337/smart-wallet).

## Key modifications

- Added support for connecting via the Coinbase Smart Wallet SDK provider
- Migrated to the [coinbase/smart-wallet](https://github.com/coinbase/smart-wallet) contracts
- No backend required - public keys are recovered by signing two distinct messages (modular backend to be added in the future)

## Usage

The smart wallet will be deployed when the first transaction is created. Currently this requires the smart wallet to have some funds to pay for the deployment. Paymaster support is planned for the future.

## Development

Clone the repository and fill out the `.env` file with the necessary environment variables.

```
cp .env.local.example .env.local
```

Install dependencies

```
pnpm install
```

Start the development server

```
pnpm run dev
```

Visit `http://localhost:3005` in your browser

Clone and run the playground at [stephancill/coinbase-wallet-sdk-playground](https://github.com/stephancill/coinbase-wallet-sdk-playground) to test connecting to the wallet.
