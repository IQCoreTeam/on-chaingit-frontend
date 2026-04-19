"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { toast } from "sonner";
import { Globe, Loader } from "lucide-react";
import {
  useIqpagesConfig,
  useIqpagesDeployed,
  useIqpagesService,
} from "@/hooks/useIqpagesData";
import { useRepo } from "@/hooks/useGitData";

interface Props {
  ownerAddress: string;
  repoName: string;
}

export default function PagesStatusPanel({ ownerAddress, repoName }: Props) {
  const wallet = useWallet();
  const svc = useIqpagesService();
  const { data: deployed, isLoading, refetch } = useIqpagesDeployed(ownerAddress, repoName);
  const { data: config } = useIqpagesConfig(ownerAddress, repoName);
  const { data: repo } = useRepo(repoName);
  const [deploying, setDeploying] = useState(false);

  const isOwner = wallet.publicKey?.toBase58() === ownerAddress;
  const isPublicRepo = repo?.isPublic === true;

  async function handleDeploy() {
    if (!isOwner) {
      toast.error("Only the repo owner can deploy to IQ Pages.");
      return;
    }
    if (!isPublicRepo) {
      toast.error("Only public repos can be deployed as IQ Pages.");
      return;
    }
    if (!config) {
      toast.error("iqpages.json missing. Add it via Pages Setup first.");
      return;
    }
    if (!confirm("Deploy this repo as IQ Pages? This charges 0.2 SOL.")) return;

    setDeploying(true);
    try {
      const sig = await svc.deploy(repoName);
      toast.success("Deployed!", { description: `tx: ${sig.slice(0, 16)}…` });
      refetch();
    } catch (e) {
      toast.error("Deploy failed", { description: (e as Error).message });
    } finally {
      setDeploying(false);
    }
  }

  return (
    <div className="cyber-card p-8 border-neon-pink/50 bg-black/40">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded border border-neon-pink bg-neon-pink/10 flex items-center justify-center text-neon-pink shadow-[0_0_15px_rgba(255,0,255,0.3)]">
          <Globe size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white font-cyber tracking-wide">IQ PAGES</h2>
          <p className="text-sm text-white/50 font-mono">Official on-chain app deployment</p>
        </div>
      </div>

      {isLoading && (
        <div className="text-white/60 font-mono text-sm">Checking deployment status…</div>
      )}

      {!isLoading && deployed && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-neon-green">
            <div className="w-2 h-2 bg-neon-green rounded-full animate-pulse"></div>
            Deployed on IQ Pages
          </div>
          <Link
            href={`/pages/${ownerAddress}/${repoName}`}
            className="flex-1 py-3 cyber-button-primary text-center flex items-center justify-center gap-2"
          >
            <Globe size={16} /> VIEW_ON_PAGES →
          </Link>
        </div>
      )}

      {!isLoading && !deployed && (
        <div className="flex flex-col gap-4">
          {!isPublicRepo && (
            <div className="p-3 border border-neon-pink/50 bg-neon-pink/5 text-neon-pink text-sm font-mono">
              Only public repos can be deployed as IQ Pages. Change visibility to public in the repo settings first.
            </div>
          )}
          <p className="text-sm text-white/70 font-mono">
            {config
              ? "Ready to deploy. This charges 0.2 SOL and registers the app on-chain."
              : "iqpages.json not found. Add it before deploying."}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            {isOwner && config && isPublicRepo && (
              <button
                onClick={handleDeploy}
                disabled={deploying}
                className="flex-1 py-3 cyber-button-primary text-center flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {deploying ? <Loader size={16} className="animate-spin" /> : <Globe size={16} />}
                {deploying ? "DEPLOYING…" : "DEPLOY_0.2_SOL"}
              </button>
            )}
            {isOwner && (
              <Link
                href={`/${ownerAddress}/${repoName}/pages-setup`}
                className="flex-1 py-3 border border-neon-cyan text-neon-cyan text-center font-tech uppercase tracking-widest hover:bg-neon-cyan/10"
              >
                {config ? "EDIT_CONFIG" : "ADD_FILES"}
              </Link>
            )}
            {!isOwner && (
              <div className="text-xs text-white/40 font-mono">
                Connect as repo owner to deploy.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
