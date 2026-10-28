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
const CLUSTER: Cluster = "devnet";

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
// Keyless, CORS-open public RPCs: the browser calls these directly, so no
// API key may live here (a key in a client bundle is public).

const CONFIGS: Record<Cluster, NetworkConfig> = {
  mainnet: {
    rpcEndpoint: "https://solana-rpc.publicnode.com",
    gateways: ["https://gateway.solanainternet.com", "https://gateway.iqlabs.dev"],
    gatewaySiteBase: "https://gateway.solanainternet.com/site",
    solscanQuery: "",
  },
  devnet: {
    rpcEndpoint: "https://api.devnet.solana.com",
    gateways: ["https://dev-gateway.iqlabs.dev"],
    gatewaySiteBase: "https://dev-gateway.iqlabs.dev/site",
    solscanQuery: "?cluster=devnet",
  },
};

export const NETWORK: NetworkConfig = CONFIGS[CLUSTER];
