// Single source of truth for network config. Solana clusters are selected per
// branch (CLUSTER line). EVM networks are user-selectable at runtime via the
// network selector UI — each maps to an SDK NetworkToken passed to setNetwork().
//
// Solana: CLUSTER pin keeps branch behaviour identical (feature merges cleanly).
// EVM:    added for the evm-port; the multi-chain gateway (gateway.iqlabs.dev)
//         serves all EVM networks via ?network=<evmnet>.

import type { NetworkToken } from "@iqlabs-official/git-sdk";

export type SolanaCluster = "mainnet" | "devnet";
export type ChainFamily = "solana" | "eth";

// ⬇️ The one line that differs between branches. main → "mainnet", devnet → "devnet".
const CLUSTER: SolanaCluster = "mainnet";

export interface NetworkConfig {
  family: ChainFamily;
  /** SDK token for setNetwork(). */
  token: NetworkToken;
  /** Gateways tried in order (first is primary). */
  gateways: string[];
  /** Base for serving on-chain sites (`/site/<sig>/...`). */
  gatewaySiteBase: string;
  /** RPC the Solana wallet adapter uses (undefined on EVM). */
  rpcEndpoint?: string;
  /** Solscan query suffix for tx links (Solana only). */
  solscanQuery?: string;
  /** Block explorer base for EVM tx links. */
  explorerBase?: string;
  /** EVM chain id (hex, e.g. "0xaa36a7") for wallet_switchEthereumChain. */
  chainIdHex?: string;
  /** wallet_addEthereumChain params, for chains MetaMask may not know. */
  chainParams?: {
    chainId: string;
    chainName: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    rpcUrls: string[];
    blockExplorerUrls?: string[];
  };
  /** Human-readable label for the network selector. */
  label: string;
}

const HELIUS_KEY = "fbb113ce-eeb4-4277-8c44-7153632d175a";
const MULTICHAIN_GATEWAY = "https://gateway.iqlabs.dev";

export const NETWORK_CONFIGS: Record<string, NetworkConfig> = {
  mainnet: {
    family: "solana",
    token: "mainnet",
    label: "Solana Mainnet",
    rpcEndpoint: `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`,
    gateways: [MULTICHAIN_GATEWAY],
    gatewaySiteBase: `${MULTICHAIN_GATEWAY}/site`,
    solscanQuery: "",
  },
  devnet: {
    family: "solana",
    token: "devnet",
    label: "Solana Devnet",
    rpcEndpoint: `https://devnet.helius-rpc.com/?api-key=${HELIUS_KEY}`,
    gateways: ["https://dev-gateway.iqlabs.dev"],
    gatewaySiteBase: "https://dev-gateway.iqlabs.dev/site",
    solscanQuery: "?cluster=devnet",
  },
  sepolia: {
    family: "eth",
    token: "sepolia",
    label: "Ethereum Sepolia",
    gateways: [MULTICHAIN_GATEWAY],
    gatewaySiteBase: `${MULTICHAIN_GATEWAY}/site`,
    explorerBase: "https://sepolia.etherscan.io/tx/",
    chainIdHex: "0xaa36a7", // 11155111
  },
  monad: {
    family: "eth",
    token: "monad",
    label: "Monad",
    gateways: [MULTICHAIN_GATEWAY],
    gatewaySiteBase: `${MULTICHAIN_GATEWAY}/site`,
    explorerBase: "https://explorer.monad.xyz/tx/",
    chainIdHex: "0x8f", // 143
    chainParams: {
      chainId: "0x8f",
      chainName: "Monad",
      nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
      rpcUrls: ["https://rpc.monad.xyz"],
      blockExplorerUrls: ["https://explorer.monad.xyz"],
    },
  },
  monadTestnet: {
    family: "eth",
    token: "monadTestnet",
    label: "Monad Testnet",
    gateways: [MULTICHAIN_GATEWAY],
    gatewaySiteBase: `${MULTICHAIN_GATEWAY}/site`,
    explorerBase: "https://testnet.monadexplorer.com/tx/",
    chainIdHex: "0x279f", // 10143
    chainParams: {
      chainId: "0x279f",
      chainName: "Monad Testnet",
      nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
      rpcUrls: ["https://testnet-rpc.monad.xyz"],
      blockExplorerUrls: ["https://testnet.monadexplorer.com"],
    },
  },
};

/** The branch-pinned default network key — the SSR/first-render default before
 *  localStorage restores the user's last choice. */
export const DEFAULT_NETWORK_KEY: string = CLUSTER;

/** The default network for this build. Branch-pinned for Solana deploys;
 *  users can override at runtime via the network selector.
 *  @deprecated read the active network from `useNetwork()` instead — this is
 *  the build-fixed default only, kept for the few non-React call sites. */
export const NETWORK: NetworkConfig = NETWORK_CONFIGS[CLUSTER];
