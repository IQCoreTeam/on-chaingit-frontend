"use client";

// react-query bindings around `@iqlabs-official/git-sdk` + the local gateway
// reader. Reads go through `lib/gateway/reader` (gateway-first, SDK fallback).
// Writes are wired to fire `notifyGateway` via `GitClient`'s `onWrite` hook.

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GitClient } from "@iqlabs-official/git-sdk/browser";
import type { EthNetwork } from "@iqlabs-official/git-sdk";
import { PublicKey } from "@solana/web3.js";
import { BrowserProvider } from "ethers";
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
import { useMemo, useState, useEffect } from "react";

/** GitClient bound to the connected wallet. `onWrite` fires once per row
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

/** GitClient bound to an injected EVM wallet (window.ethereum).
 *  Returns null until the user has connected and accounts are available.
 *  Recreates the client whenever `network` changes. */
export function useEthGitClient(network: EthNetwork = "sepolia"): GitClient | null {
  const [client, setClient] = useState<GitClient | null>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eth = typeof window !== "undefined" && (window as any).ethereum;
    if (!eth) return;
    const provider = new BrowserProvider(eth);
    let cancelled = false;
    provider.getSigner().then((signer) => {
      if (cancelled) return;
      setClient(new GitClient({ chain: "eth", signer, network }));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [network]);

  return client;
}

export function useRegistry(options?: { limit?: number; before?: string }) {
  return useQuery({
    queryKey: ["registry", options?.limit ?? null, options?.before ?? null],
    queryFn: () => readRegistryPage(options),
    staleTime: 60_000,
  });
}

export function useOwnerRepos(owner: string | undefined) {
  return useQuery({
    queryKey: ["repos", owner],
    queryFn: () => readOwnerRepos(owner!),
    staleTime: 60_000,
    enabled: !!owner,
  });
}

export function useCommits(owner: string | undefined, repoName: string | undefined) {
  return useQuery({
    queryKey: ["commits", owner, repoName],
    queryFn: () => readCommitHistory(owner!, repoName!),
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
  if (PUBKEY_RE.test(s)) return resolvePubkey(s);
  return { kind: "invalid" };
}

/** Dispatch a /[ident] segment (a .sol domain, a commit-table PDA, or an owner
 *  wallet) to a repo view or an owner repo list. */
export function useGitEntry(ident: string | undefined) {
  return useQuery<GitEntry>({
    queryKey: ["git-entry", ident],
    queryFn: () => resolveEntry(ident!),
    staleTime: 5 * 60_000,
    enabled: !!ident,
  });
}

export function useFileTree(treeTxId: string | undefined) {
  return useQuery({
    queryKey: ["tree", treeTxId],
    queryFn: () => loadTree(treeTxId!),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    enabled: !!treeTxId,
  });
}

export function useFileContent(txId: string | undefined) {
  return useQuery({
    queryKey: ["blob", txId],
    queryFn: () => loadBlob(txId!),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    enabled: !!txId,
  });
}

export function useInvalidateRepo() {
  const qc = useQueryClient();
  return (owner: string, repoName: string) => {
    qc.invalidateQueries({ queryKey: ["repos", owner] });
    qc.invalidateQueries({ queryKey: ["commits", owner, repoName] });
    qc.invalidateQueries({ queryKey: ["registry"] });
  };
}
