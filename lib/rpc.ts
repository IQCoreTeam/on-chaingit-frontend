// Single source of truth for the Solana RPC endpoint on this branch.
//
// GHCR images never carry env (.dockerignore strips .env*) and the SDK's
// connection helper falls back to api.mainnet-beta when no RPC env is set,
// so we pin the endpoint here and push it into the SDK at *module load*
// (not just on React render) — see `setSdkRpc()` callers — so server-side
// and pre-render code paths use it too.
//
// devnet branch: devnet endpoint. (main branch pins the mainnet one.)
import iqlabs from "iqlabs-sdk";

export const RPC_ENDPOINT =
  "https://devnet.helius-rpc.com/?api-key=fbb113ce-eeb4-4277-8c44-7153632d175a";

let pinned = false;

/** Pin RPC_ENDPOINT into iqlabs-sdk's connection singleton (idempotent). */
export function setSdkRpc(): void {
  if (pinned) return;
  iqlabs.setRpcUrl(RPC_ENDPOINT);
  pinned = true;
}

// Pin eagerly on import so any SDK call (incl. server-side / pre-render)
// sees the endpoint without waiting for the Providers component to render.
setSdkRpc();
