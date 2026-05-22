// Single source of truth for everything that differs between the mainnet and
// devnet builds. GHCR images can't carry .env (the Dockerfile strips it), so
// the network is pinned in code and selected per branch. Keeping it all here
// means the ONLY thing that differs between the `main` and `devnet` branches
// is the CLUSTER line below — every other file imports NETWORK and stays
// identical across branches, so feature work merges cleanly.
//
// To switch a branch's target, change CLUSTER. Nothing else.

type Cluster = "mainnet" | "devnet";

// ⬇️ The one line that differs between branches. main → "mainnet", devnet → "devnet".
const CLUSTER: Cluster = "mainnet";

interface NetworkConfig {
  /** RPC the wallet adapter + SDK reader connection use. */
  rpcEndpoint: string;
  /** Gateways tried in order (first is primary). */
  gateways: string[];
  /** Base for serving on-chain sites (`/site/<sig>/...`). */
  gatewaySiteBase: string;
  /** Solscan query suffix for tx links ("" on mainnet, "?cluster=devnet" on devnet). */
  solscanQuery: string;
}

// origin-restricted public Helius key (browser-safe; same key both clusters).
const HELIUS_KEY = "fbb113ce-eeb4-4277-8c44-7153632d175a";

const CONFIGS: Record<Cluster, NetworkConfig> = {
  mainnet: {
    rpcEndpoint: `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`,
    gateways: ["https://gateway.solanainternet.com", "https://gateway.iqlabs.dev"],
    gatewaySiteBase: "https://gateway.solanainternet.com/site",
    solscanQuery: "",
  },
  devnet: {
    rpcEndpoint: `https://devnet.helius-rpc.com/?api-key=${HELIUS_KEY}`,
    gateways: ["https://dev-gateway.iqlabs.dev"],
    gatewaySiteBase: "https://dev-gateway.iqlabs.dev/site",
    solscanQuery: "?cluster=devnet",
  },
};

export const NETWORK: NetworkConfig = CONFIGS[CLUSTER];
