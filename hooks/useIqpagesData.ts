"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import { readLatestCommit } from "@/lib/gateway/reader";
import { useMemo } from "react";
import type { GitSigner } from "@iqlabs-official/git-sdk/browser";
import { IqpagesService } from "@/services/iqpages/iqpages-service";
import { useNetwork } from "@/app/components/NetworkProvider";
import { useEvmWallet } from "@/app/components/EvmWalletProvider";

/** IqpagesService wired with the active chain's signer. Reads work without a
 *  wallet; deploy() requires the matching wallet connected. */
export function useIqpagesService() {
  const { network } = useNetwork();
  const wallet = useWallet();
  const evm = useEvmWallet();
  return useMemo(() => {
    let signer: GitSigner | null = null;
    if (network.family === "solana") {
      if (wallet.publicKey && wallet.signTransaction && wallet.signAllTransactions) {
        signer = {
          publicKey: wallet.publicKey,
          signTransaction: wallet.signTransaction,
          signAllTransactions: wallet.signAllTransactions,
        };
      }
    } else if (evm.connected && evm.signer) {
      signer = evm.signer;
    }
    return new IqpagesService(signer);
  }, [network.family, wallet, evm.connected, evm.signer]);
}

export function useIqpagesList() {
  const svc = useIqpagesService();
  const { networkKey } = useNetwork();
  return useQuery({
    queryKey: ["iqpages", networkKey, "list"],
    queryFn: () => svc.listAll(),
    staleTime: 60_000,
  });
}

export function useIqpagesConfig(owner: string | undefined, repoName: string | undefined) {
  const svc = useIqpagesService();
  const { networkKey } = useNetwork();
  return useQuery({
    queryKey: ["iqpages", networkKey, "config", owner, repoName],
    queryFn: () => svc.readConfig(owner!, repoName!),
    staleTime: 5 * 60_000,
    enabled: !!owner && !!repoName,
  });
}

export function useIqpagesProfile(owner: string | undefined, repoName: string | undefined) {
  const svc = useIqpagesService();
  const { networkKey } = useNetwork();
  return useQuery({
    queryKey: ["iqpages", networkKey, "profile", owner, repoName],
    queryFn: () => svc.readProfile(owner!, repoName!),
    staleTime: 5 * 60_000,
    enabled: !!owner && !!repoName,
  });
}

export function useIqpagesDeployed(owner: string | undefined, repoName: string | undefined) {
  const svc = useIqpagesService();
  const { networkKey } = useNetwork();
  return useQuery({
    queryKey: ["iqpages", networkKey, "deployed", owner, repoName],
    queryFn: () => svc.isDeployed(owner!, repoName!),
    staleTime: 60_000,
    enabled: !!owner && !!repoName,
  });
}

/** Latest commit's treeTxId — used to build gateway / site URLs. */
export function useLatestTreeTxId(owner: string | undefined, repoName: string | undefined) {
  return useQuery({
    queryKey: ["git", "latestTree", owner, repoName],
    queryFn: async () => (await readLatestCommit(owner!, repoName!))?.treeTxId ?? null,
    staleTime: 60_000,
    enabled: !!owner && !!repoName,
  });
}
