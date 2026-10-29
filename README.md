# git-frontend

Next.js starter with Tailwind CSS and `@solana/kit` for wallet connection and Solana hooks.

## Getting Started

```shell
npx -y create-solana-dapp@latest -t solana-foundation/templates/kit/git-frontend
```

```shell
npm install
npm run dev
```

## Solana RPC configuration

Set `NEXT_PUBLIC_SOLANA_MAINNET_RPC_URL` and/or `NEXT_PUBLIC_SOLANA_DEVNET_RPC_URL` before building to override the corresponding Solana endpoint. The selected endpoint is shared by the wallet connection and SDK. When unset, mainnet uses publicnode and devnet uses the public Solana RPC; EVM networks are unaffected.

These values are included in the browser bundle. Use a browser-authorized endpoint or a controlled RPC proxy, not a private server credential. Restart the development server after changing `.env.local`.
