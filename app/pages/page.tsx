"use client";

// iqpages gallery — light. Each card shows just what the deployment row
// already gives us (owner + repo). Heavy metadata (iqpages.json /
// iqprofile.json — those live in the repo's git tree and require
// readLatestCommit + loadTree + loadBlob = many RPC calls per card) is
// deferred to the detail page so RPC providers don't see a spike of N×K
// requests when the list happens to have a few rows.

import { useIqpagesList } from "@/hooks/useIqpagesData";
import { useOwnerRepos } from "@/hooks/useGitData";
import { useWallet } from "@solana/wallet-adapter-react";
import { NetworkSelector } from "@/app/components/NetworkSelector";
import { Globe, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const PAGE_SIZE = 30;

export default function PagesGallery() {
  const wallet = useWallet();
  const myAddr = wallet.publicKey?.toBase58();
  const { data: deployments, isLoading, error } = useIqpagesList();

  const [visible, setVisible] = useState(PAGE_SIZE);
  const visibleDeployments = (deployments ?? []).slice(0, visible);

  // "Deploy from your repos" — connected wallet's public repos that aren't
  // already in the deployments list.
  const myReposQuery = useOwnerRepos(myAddr);
  const deployedSet = useMemo(
    () => new Set((deployments ?? []).filter((d) => d.owner === myAddr).map((d) => d.repo)),
    [deployments, myAddr],
  );
  const undeployedRepos = useMemo(
    () => (myReposQuery.data ?? []).filter((r) => r.isPublic && !deployedSet.has(r.name)),
    [myReposQuery.data, deployedSet],
  );

  return (
    <div className="min-h-screen bg-cyber-bg text-foreground font-sans relative overflow-x-hidden">
      <div className="scanline"></div>

      <nav className="border-b border-cyber-border bg-cyber-bg/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-4">
              <div className="w-10 h-10 border border-neon-pink bg-neon-pink/10 flex items-center justify-center shadow-[0_0_10px_rgba(255,0,255,0.3)]">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" className="text-neon-pink">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
              <span className="text-2xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-neon-pink to-neon-cyan neon-text-pink font-cyber uppercase">
                SolGit
              </span>
            </Link>
            <span className="text-xs text-neon-cyan font-mono border border-neon-cyan px-1 uppercase opacity-60">Pages</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/pages" className="text-sm font-tech text-neon-pink hover:text-white px-4 py-2 hover:bg-neon-pink/10 transition-colors uppercase tracking-widest border border-neon-pink hidden md:block">
              Pages
            </Link>
            {myAddr && (
              <Link href={`/${myAddr}`} className="text-sm font-tech text-neon-cyan hover:text-white px-4 py-2 hover:bg-neon-cyan/10 transition-colors uppercase tracking-widest border border-transparent hover:border-neon-cyan hidden md:block">
                My // Repos
              </Link>
            )}
            <NetworkSelector />
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-12 relative z-10">
        <div className="border-b border-cyber-border pb-4 mb-8">
          <h1 className="text-3xl font-bold font-cyber uppercase tracking-widest text-white neon-text-cyan">
            IQ Pages
          </h1>
          <p className="text-sm text-neon-cyan/60 font-mono mt-2">
            On-chain web apps deployed on IQ Labs
          </p>
        </div>

        {isLoading && <div className="text-neon-cyan font-mono">Loading deployments…</div>}
        {error && (
          <div className="text-red-400 font-mono">
            Failed to load: {(error as Error).message}
          </div>
        )}

        {myAddr && undeployedRepos.length > 0 && (
          <section className="mb-10 cyber-card p-6 border-neon-pink/40 bg-black/40">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 border border-neon-pink bg-neon-pink/10 flex items-center justify-center text-neon-pink">
                <Plus size={18} />
              </div>
              <div>
                <h2 className="text-lg font-cyber uppercase tracking-widest text-neon-pink">
                  Deploy from your repos
                </h2>
                <p className="text-xs text-white/50 font-mono">
                  Public repos owned by you that aren't deployed yet — pick one to configure & deploy.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {undeployedRepos.map((r) => (
                <Link
                  key={r.name}
                  href={`/${myAddr}/${r.name}/pages-setup`}
                  className="flex items-center justify-between gap-3 px-4 py-3 border border-cyber-border hover:border-neon-pink hover:bg-neon-pink/5 transition-colors font-mono text-sm"
                >
                  <span className="font-cyber uppercase text-white truncate">{r.name}</span>
                  <span className="text-[10px] text-neon-pink font-tech tracking-wider">DEPLOY →</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {!isLoading && visibleDeployments.length === 0 && (
          <div className="border border-cyber-border bg-cyber-panel/50 p-8 text-center text-neon-cyan/70 font-mono">
            No pages deployed yet.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleDeployments.map((d) => (
            <Link
              key={`${d.owner}/${d.repo}`}
              href={`/pages/${d.owner}/${d.repo}`}
              className="border border-cyber-border bg-cyber-panel/50 hover:border-neon-pink hover:shadow-[0_0_15px_rgba(255,0,255,0.3)] transition-all p-5 flex flex-col gap-2"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 border border-neon-cyan/40 bg-neon-cyan/5 flex items-center justify-center text-neon-cyan">
                  <Globe size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-cyber uppercase tracking-wide text-white truncate">
                    {d.repo}
                  </div>
                  <div className="text-xs text-neon-cyan/60 font-mono truncate">
                    {d.owner.slice(0, 4)}…{d.owner.slice(-4)}
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-neon-pink font-mono uppercase mt-auto">
                {new Date(d.deployedAt).toLocaleDateString()}
              </div>
            </Link>
          ))}
        </div>

        {(deployments?.length ?? 0) > visible && (
          <div className="mt-6 text-center">
            <button
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
              className="px-6 py-2 border border-cyber-border text-neon-cyan/70 hover:text-neon-cyan hover:border-neon-cyan font-tech uppercase text-xs tracking-widest transition-all"
            >
              Load_More ({Math.min(PAGE_SIZE, (deployments?.length ?? 0) - visible)})
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
