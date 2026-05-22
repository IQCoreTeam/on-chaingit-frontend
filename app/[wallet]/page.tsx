"use client";

// /[ident] — dispatches the URL segment: a .sol domain or a commit-table PDA
// renders a single repo (RepoView), an owner wallet renders that wallet's repo
// list. Resolution is in useGitEntry (gateway /sns + /table/meta, both cached).

import { useGitEntry, useOwnerRepos, useCommitsByPda } from "@/hooks/useGitData";
import { useIqpagesDeployed } from "@/hooks/useIqpagesData";
import { RepoView } from "@/app/components/RepoView";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Box, RefreshCw, User } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import type { PublicKey } from "@solana/web3.js";

const PAGE_SIZE = 30;
const shortWallet = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

export default function IdentPage() {
  const params = useParams<{ wallet: string }>();
  const ident = params?.wallet ? decodeURIComponent(params.wallet) : undefined;
  const entry = useGitEntry(ident);

  if (entry.isLoading || !entry.data) {
    return (
      <div className="min-h-screen bg-cyber-bg flex items-center justify-center">
        <span className="font-tech text-neon-cyan animate-pulse">[ RESOLVING {ident} ... ]</span>
      </div>
    );
  }

  if (entry.data.kind === "repo") {
    return <RepoEntry pda={entry.data.pda} owner={entry.data.owner} repo={entry.data.repo} />;
  }
  if (entry.data.kind === "owner") {
    return <OwnerRepoList owner={entry.data.owner} />;
  }
  return (
    <div className="min-h-screen bg-cyber-bg flex items-center justify-center">
      <span className="font-tech text-neon-pink">[ INVALID_IDENTIFIER ]</span>
    </div>
  );
}

// A .sol / commit-table PDA entry: read-only repo view keyed by the PDA.
function RepoEntry({ pda, owner, repo }: { pda: PublicKey; owner: string; repo: string }) {
  const commitsQuery = useCommitsByPda(pda);
  const deployedQuery = useIqpagesDeployed(owner, repo);
  return (
    <RepoView
      repoLabel={repo}
      owner={owner}
      commits={commitsQuery.data ?? []}
      commitsLoading={commitsQuery.isLoading}
      deployed={deployedQuery.data ?? false}
    />
  );
}

// An owner wallet: that wallet's repo list (the original wallet page).
function OwnerRepoList({ owner }: { owner: string }) {
  const wallet = useWallet();
  const myAddr = wallet.publicKey?.toBase58();
  const { data: repos, isFetching, refetch } = useOwnerRepos(owner);
  const [visible, setVisible] = useState(PAGE_SIZE);

  return (
    <div className="min-h-screen bg-cyber-bg text-foreground font-sans relative overflow-x-hidden">
      <div className="scanline"></div>

      <nav className="border-b border-cyber-border bg-cyber-bg/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-4">
            <div className="w-10 h-10 border border-neon-pink bg-neon-pink/10 flex items-center justify-center shadow-[0_0_10px_rgba(255,0,255,0.3)]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" className="text-neon-pink">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>
            <span className="text-2xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-neon-pink to-neon-cyan neon-text-pink font-cyber uppercase">
              SolGit
            </span>
            <span className="text-xs text-neon-cyan font-mono border border-neon-cyan px-1 uppercase opacity-60">v0.9.beta</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/pages" className="text-sm font-tech text-neon-pink hover:text-white px-4 py-2 hover:bg-neon-pink/10 transition-colors uppercase tracking-widest border border-transparent hover:border-neon-pink hidden md:block">
              Pages
            </Link>
            {myAddr && (
              <Link href={`/${myAddr}`} className="text-sm font-tech text-neon-cyan hover:text-white px-4 py-2 hover:bg-neon-cyan/10 transition-colors uppercase tracking-widest border border-transparent hover:border-neon-cyan hidden md:block">
                My // Repos
              </Link>
            )}
            <WalletMultiButton className="!bg-neon-cyan/10 !border !border-neon-cyan !text-neon-cyan !rounded-none !font-tech !uppercase !tracking-wider hover:!bg-neon-cyan/20 hover:!shadow-[0_0_15px_cyan]" />
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-12 relative z-10">
        <div className="flex items-center justify-between border-b border-cyber-border pb-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 border border-neon-cyan bg-neon-cyan/10 flex items-center justify-center">
              <User size={20} className="text-neon-cyan" />
            </div>
            <div>
              <div className="text-[10px] font-tech uppercase tracking-widest text-white/40">
                Repositories owned by
              </div>
              <div className="font-mono text-neon-cyan text-sm break-all">{owner}</div>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            className="p-2 border border-cyber-border hover:border-neon-cyan text-white/60 hover:text-neon-cyan transition-all"
            title="Refresh"
          >
            <RefreshCw size={20} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>

        {isFetching && (!repos || repos.length === 0) ? (
          <div className="h-64 flex items-center justify-center border border-dashed border-white/10 bg-white/5 animate-pulse font-tech text-neon-cyan">
            [ SCANNING CHAIN ... ]
          </div>
        ) : !repos || repos.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center border border-dashed border-white/10 bg-white/[0.02]">
            <div className="mb-4 text-neon-pink animate-pulse">
              <Box size={48} />
            </div>
            <span className="text-white/40 font-tech uppercase tracking-widest">
              {shortWallet(owner)} has no repos yet.
            </span>
          </div>
        ) : (
          <div className="grid gap-6">
            {repos.slice(0, visible).map((repo) => (
              <Link
                href={`/${owner}/${repo.name}`}
                key={repo.name}
                className="block group cyber-card p-6 transition-all hover:translate-x-1 hover:border-neon-pink relative"
              >
                <div className="absolute top-0 right-0 p-2">
                  <span className="text-[10px] font-mono text-neon-cyan/50">
                    ID: {repo.name.toUpperCase().slice(0, 3)}
                  </span>
                </div>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-4 mb-2">
                      <h3 className="text-xl font-bold text-white font-cyber tracking-wide group-hover:text-neon-pink transition-colors">
                        {repo.name}
                      </h3>
                      <span
                        className={`text-[10px] font-tech uppercase tracking-wider px-2 py-0.5 border ${
                          repo.isPublic
                            ? "border-neon-green text-neon-green bg-neon-green/10"
                            : "border-neon-yellow text-neon-yellow bg-neon-yellow/10"
                        }`}
                      >
                        {repo.isPublic ? "PUB" : "PVT"}
                      </span>
                      {myAddr === owner && (
                        <span className="text-[10px] font-tech uppercase tracking-wider px-2 py-0.5 border border-neon-cyan text-neon-cyan bg-neon-cyan/10">
                          OWNER
                        </span>
                      )}
                    </div>
                    <p className="text-white/60 text-sm font-mono max-w-xl border-l-2 border-white/10 pl-3">
                      {repo.description || "NO_DATA_AVAILABLE"}
                    </p>
                  </div>
                  <div className="text-right text-xs text-white/30 space-y-1 font-tech">
                    <div className="text-neon-cyan/50">
                      T: {new Date(repo.timestamp).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </Link>
            ))}

            {repos.length > visible && (
              <button
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
                className="self-center mt-2 px-6 py-2 border border-cyber-border text-neon-cyan/70 hover:text-neon-cyan hover:border-neon-cyan font-tech uppercase text-xs tracking-widest transition-all"
              >
                Load_More ({Math.min(PAGE_SIZE, repos.length - visible)})
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
