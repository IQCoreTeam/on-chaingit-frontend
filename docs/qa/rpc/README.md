# Solana RPC configuration QA

Base: 6a5d1bb. The deployed git.iqlabs.dev repository creation failed before wallet signing with getAccountInfo HTTP 403. This change allows an operator to select working mainnet/devnet RPC endpoints at build time without editing source; it does not repair or change the deployed provider.

Local reconciliation against `1e971a2` preserves Zo's new keyless defaults. This PR only adds optional build-time overrides; it does not restore the removed client-side Helius key. No new signed wallet transaction is claimed for this reconciliation.

For this reconciliation, a clean `npm ci` was blocked by the pre-existing missing `bufferutil` lock entry. I temporarily used #7's lockfile only for local installation, then restored the base lockfile; no lockfile delta belongs to #8. The production build, changed-file ESLint and Prettier checks passed against the reconciled code.

Local validation used NEXT_PUBLIC_SOLANA_MAINNET_RPC_URL pointing to a loopback relay to the public mainnet RPC. The relay is QA infrastructure, not shipped in this PR. Both HTTP and WebSocket confirmation transport must be available. The user's Phantom wallet remained the signer; no private key was used.

A real Nubs Home repository was created through the local app. First CreateTable transaction HmysxNa4zNUqswLH7jKwpXqjEPRWZoM64XvBd3xJfEJczqX1UFnHn2GdtSKXNskEwWymfqxWX1q1R615s5mcfeV finalized with meta.err null at slot 447430551. This is repository setup evidence, not proof of site deployment.

Original PR QA: TypeScript, changed-file ESLint and production build passed. At that time, baseline `npm ci` failed on a missing `bufferutil` lockfile entry and installation used `npm install --ignore-scripts --package-lock=false`. No lockfile change is included. The unrelated gallery hydration/duplicate-row fix is a separate PR.
