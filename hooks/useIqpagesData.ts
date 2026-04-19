"use client";

import { useQuery } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMemo } from "react";
import { IqpagesService } from "@/services/iqpages/iqpages-service";
import { useGitService } from "@/hooks/useGitData";

export function useIqpagesService() {
  const { connection } = useConnection();
  const wallet = useWallet();
  return useMemo(
    () => new IqpagesService(connection, wallet as any),
    [connection, wallet]
  );
}

export function useIqpagesList() {
  const svc = useIqpagesService();
  return useQuery({
    queryKey: ["iqpages", "list"],
    queryFn: () => svc.listAll(),
    staleTime: 60_000,
  });
}

export function useIqpagesConfig(owner: string | undefined, repoName: string | undefined) {
  const svc = useIqpagesService();
  return useQuery({
    queryKey: ["iqpages", "config", owner, repoName],
    queryFn: () => svc.readConfig(owner!, repoName!),
    staleTime: 5 * 60_000,
    enabled: !!owner && !!repoName,
  });
}

export function useIqpagesProfile(owner: string | undefined, repoName: string | undefined) {
  const svc = useIqpagesService();
  return useQuery({
    queryKey: ["iqpages", "profile", owner, repoName],
    queryFn: () => svc.readProfile(owner!, repoName!),
    staleTime: 5 * 60_000,
    enabled: !!owner && !!repoName,
  });
}

export function useIqpagesDeployed(owner: string | undefined, repoName: string | undefined) {
  const svc = useIqpagesService();
  return useQuery({
    queryKey: ["iqpages", "deployed", owner, repoName],
    queryFn: () => svc.isDeployed(owner!, repoName!),
    staleTime: 60_000,
    enabled: !!owner && !!repoName,
  });
}

/**
 * Latest commit's treeTxId for a repo — used to build the gateway /site URL.
 */
export function useLatestTreeTxId(owner: string | undefined, repoName: string | undefined) {
  const git = useGitService();
  return useQuery({
    queryKey: ["git", "latestTree", owner, repoName],
    queryFn: async () => {
      const commits = await git.getLog(repoName!, owner);
      return commits[0]?.treeTxId ?? null;
    },
    staleTime: 60_000,
    enabled: !!owner && !!repoName,
  });
}
