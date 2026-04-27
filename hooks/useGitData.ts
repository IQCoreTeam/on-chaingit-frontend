"use client";

// react-query bindings around `@iqlabs-official/git-sdk` + the local gateway
// reader. Reads go through `lib/gateway/reader` (gateway-first, SDK fallback).
// Writes are wired to fire `notifyGateway` via `GitClient`'s `onWrite` hook.

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GitClient } from "@iqlabs-official/git-sdk/browser";
import {
  loadBlob,
  loadTree,
  notifyGateway,
  readCommitHistory,
  readOwnerRepos,
  readRegistryPage,
} from "@/lib/gateway/reader";
import { useMemo } from "react";

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
