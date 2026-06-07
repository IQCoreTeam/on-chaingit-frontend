"use client";

// react-query bindings around `@iqlabs-official/git-sdk` + the local gateway
// reader. Reads go through `lib/gateway/reader` (gateway-first, SDK fallback).
// Writes are wired to fire `notifyGateway` via `GitClient`'s `onWrite` hook.

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  GitClient,
  commitTableRef,
  // SDK chain-neutral readers — route per the active network (setNetwork):
  // Solana → PDA path, EVM → ?network= gateway path. Used on EVM networks
  // where the local Solana-PDA reader can't address the data.
  readCommitHistory as sdkReadCommitHistory,
  readOwnerRepos as sdkReadOwnerRepos,
  readRegistryPage as sdkReadRegistryPage,
  loadTree as sdkLoadTree,
  loadBlob as sdkLoadBlob,
} from "@iqlabs-official/git-sdk/browser";
import type { EthNetwork } from "@iqlabs-official/git-sdk";
import { PublicKey } from "@solana/web3.js";
import {
  loadBlob,
  loadTree,
  notifyGateway,
  readCommitHistory,
  readCommitHistoryByPda,
  readOwnerRepos,
  readRegistryPage,
  fetchSnsResolution,
  fetchTableMeta,
} from "@/lib/gateway/reader";
import { useMemo } from "react";
import { useNetwork } from "@/app/components/NetworkProvider";
import { useEvmWallet } from "@/app/components/EvmWalletProvider";

/** GitClient bound to the connected Solana wallet. `onWrite` fires once per row
 *  write (createRepo + commit) so the gateway hears about it instantly. */
export function useGitClient(): GitClient | null {
  const { connection } = useConnection();
  const wallet = useWallet();
  return useMemo(() => {
    if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) {
      return null;
    }
    const owner = wallet.publicKey.toBase58();
    return new GitClient({
      connection,
      signer: {
        publicKey: wallet.publicKey,
        signTransaction: wallet.signTransaction,
        signAllTransactions: wallet.signAllTransactions,
      },
      onWrite: ({ tablePda, sig, row }) => notifyGateway(tablePda, sig, row, owner),
    });
  }, [connection, wallet]);
}

/** GitClient bound to the shared EVM wallet (EvmWalletProvider) + the active
 *  EVM network. Null until the active network is an EVM one and a wallet is
 *  connected. */
export function useEthGitClient(): GitClient | null {
  const { network } = useNetwork();
  const { signer, connected } = useEvmWallet();
  return useMemo(() => {
    if (network.family !== "eth" || !connected || !signer) return null;
    return new GitClient({
      chain: "eth",
      signer,
      network: network.token as EthNetwork,
    });
  }, [network.family, network.token, signer, connected]);
}

/** The GitClient for whichever chain is active. The 3 write pages call this so
 *  they never branch on chain themselves. Both underlying hooks run every
 *  render (hooks rules); we just pick by the active network family. */
export function useActiveGitClient(): GitClient | null {
  const { network } = useNetwork();
  const solanaClient = useGitClient();
  const ethClient = useEthGitClient();
  return network.family === "solana" ? solanaClient : ethClient;
}

export function useRegistry(options?: { limit?: number; before?: string }) {
  const { networkKey, network } = useNetwork();
  const isEth = network.family === "eth";
  return useQuery({
    queryKey: ["registry", networkKey, options?.limit ?? null, options?.before ?? null],
    // EVM: SDK reader (gateway-first, ?network=, RPC fallback). Solana: the
    // local PDA reader. Both already chain-route via setNetwork.
    queryFn: () => (isEth ? sdkReadRegistryPage(options) : readRegistryPage(options)),
    staleTime: 60_000,
  });
}

export function useOwnerRepos(owner: string | undefined) {
  const { networkKey, network } = useNetwork();
  const isEth = network.family === "eth";
  return useQuery({
    queryKey: ["repos", networkKey, owner],
    queryFn: () => (isEth ? sdkReadOwnerRepos(owner!) : readOwnerRepos(owner!)),
    staleTime: 60_000,
    enabled: !!owner,
  });
}

export function useCommits(owner: string | undefined, repoName: string | undefined) {
  const { networkKey, network } = useNetwork();
  const isEth = network.family === "eth";
  return useQuery({
    queryKey: ["commits", networkKey, owner, repoName],
    queryFn: () =>
      isEth
        ? sdkReadCommitHistory(commitTableRef(owner!, repoName!))
        : readCommitHistory(owner!, repoName!),
    staleTime: 30_000,
    enabled: !!owner && !!repoName,
  });
}

/** Commits keyed by the commit-table PDA — for .sol / PDA entry where we don't
 *  have owner/repo. Same Commit[] shape as useCommits. */
export function useCommitsByPda(pda: PublicKey | undefined) {
  return useQuery({
    queryKey: ["commits", "pda", pda?.toBase58()],
    queryFn: () => readCommitHistoryByPda(pda!),
    staleTime: 30_000,
    enabled: !!pda,
  });
}

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

/** What a /[ident] segment resolves to. */
export type GitEntry =
  | { kind: "repo"; pda: PublicKey; owner: string; repo: string }
  | { kind: "owner"; owner: string }
  | { kind: "invalid" };

// Resolve a raw pubkey: a commit-table PDA (its meta name is git_commits:O:R)
// renders one repo; anything else is treated as an owner wallet. The gateway
// caches both the hit and the miss, so this is cheap on repeat.
async function resolvePubkey(p: string): Promise<GitEntry> {
  const meta = await fetchTableMeta(p);
  const name = meta?.name ?? "";
  if (name.startsWith("git_commits:")) {
    const [, owner, repo] = name.split(":");
    return { kind: "repo", pda: new PublicKey(p), owner, repo };
  }
  return { kind: "owner", owner: p };
}

async function resolveEntry(ident: string): Promise<GitEntry> {
  const s = ident.trim();
  if (s.toLowerCase().endsWith(".sol")) {
    const { owner, record } = await fetchSnsResolution(s);
    const target = record ?? owner;
    return target ? resolvePubkey(target) : { kind: "invalid" };
  }
  // EVM address (0x + 40 hex chars) — treat as owner directly, no PDA lookup.
  if (EVM_ADDR_RE.test(s)) return { kind: "owner", owner: s };
  if (PUBKEY_RE.test(s)) return resolvePubkey(s);
  return { kind: "invalid" };
}

/** Dispatch a /[ident] segment (a .sol domain, a commit-table PDA, or an owner
 *  wallet) to a repo view or an owner repo list. */
export function useGitEntry(ident: string | undefined) {
  const { networkKey } = useNetwork();
  return useQuery<GitEntry>({
    queryKey: ["git-entry", networkKey, ident],
    queryFn: () => resolveEntry(ident!),
    staleTime: 5 * 60_000,
    enabled: !!ident,
  });
}

export function useFileTree(treeTxId: string | undefined) {
  const { networkKey, network } = useNetwork();
  const isEth = network.family === "eth";
  return useQuery({
    queryKey: ["tree", networkKey, treeTxId],
    queryFn: () => (isEth ? sdkLoadTree(treeTxId!) : loadTree(treeTxId!)),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    enabled: !!treeTxId,
  });
}

export function useFileContent(txId: string | undefined) {
  const { networkKey, network } = useNetwork();
  const isEth = network.family === "eth";
  return useQuery({
    queryKey: ["blob", networkKey, txId],
    queryFn: () => (isEth ? sdkLoadBlob(txId!) : loadBlob(txId!)),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    enabled: !!txId,
  });
}

export function useInvalidateRepo() {
  const qc = useQueryClient();
  // Match by prefix after the networkKey segment — predicate keeps this robust
  // to the networkKey now sitting in every read queryKey.
  return (owner: string, repoName: string) => {
    qc.invalidateQueries({
      predicate: (q) => {
        const k = q.queryKey as unknown[];
        if (k[0] === "registry") return true;
        if (k[0] === "repos" && k[2] === owner) return true;
        if (k[0] === "commits" && k[2] === owner && k[3] === repoName) return true;
        return false;
      },
    });
  };
}
