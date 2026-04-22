"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import { Box, RefreshCw, Star, User } from "lucide-react";
import { GitChainService } from "@/services/git/git-chain-service";
import { Repository } from "@/services/git/types";

function isPubkey(s: string | undefined): s is string {
  if (!s) return false;
  try {
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
}

function shortWallet(w: string) {
  return `${w.slice(0, 4)}…${w.slice(-4)}`;
}

export default function WalletReposPage() {
  const params = useParams<{ wallet: string }>();
  const walletParam = params?.wallet ? decodeURIComponent(params.wallet) : undefined;
  const validWallet = isPubkey(walletParam) ? walletParam : null;

  const { connection } = useConnection();
  const wallet = useWallet();

  const [repos, setRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(false);
  const [starCounts, setStarCounts] = useState<Record<string, number>>({});

  const walletPubkey = wallet?.publicKey?.toBase58() ?? null;
  const gitService = useMemo(
    () => new GitChainService(connection, wallet as any),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connection, walletPubkey],
  );

  const fetchRepos = async () => {
    if (!validWallet) return;
    try {
      setLoading(true);
      const list = await gitService.listRepos(validWallet);
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRepos(list);

      const allStars = await gitService.fetchAllStars();
      const counts: Record<string, number> = {};
      allStars.forEach((s) => {
        counts[s.repoName] = (counts[s.repoName] || 0) + 1;
      });
      setStarCounts(counts);
    } catch (e) {
      console.error("Failed to fetch repos for wallet", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepos();
    const interval = setInterval(fetchRepos, 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gitService, validWallet]);

  return (
    <div className="min-h-screen bg-cyber-bg text-foreground font-sans relative overflow-x-hidden">
      <div className="scanline"></div>

      {/* Navbar */}
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
            <Link href="/profile" className="text-sm font-tech text-neon-cyan hover:text-white px-4 py-2 hover:bg-neon-cyan/10 transition-colors uppercase tracking-widest border border-transparent hover:border-neon-cyan hidden md:block">
              My // Profile
            </Link>
            <WalletMultiButton className="!bg-neon-cyan/10 !border !border-neon-cyan !text-neon-cyan !rounded-none !font-tech !uppercase !tracking-wider hover:!bg-neon-cyan/20 hover:!shadow-[0_0_15px_cyan]" />
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-12 relative z-10">
        {!validWallet ? (
          <div className="h-64 flex items-center justify-center border border-dashed border-white/10 bg-white/5 font-tech text-neon-pink">
            [ INVALID_WALLET_ADDRESS ]
          </div>
        ) : (
          <>
            {/* Owner header */}
            <div className="flex items-center justify-between border-b border-cyber-border pb-4 mb-6">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 border border-neon-cyan bg-neon-cyan/10 flex items-center justify-center">
                  <User size={20} className="text-neon-cyan" />
                </div>
                <div>
                  <div className="text-[10px] font-tech uppercase tracking-widest text-white/40">
                    Repositories owned by
                  </div>
                  <div className="font-mono text-neon-cyan text-sm break-all">
                    {validWallet}
                  </div>
                </div>
              </div>
              <button
                onClick={fetchRepos}
                className="p-2 border border-cyber-border hover:border-neon-cyan text-white/60 hover:text-neon-cyan transition-all"
                title="Refresh"
              >
                <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
              </button>
            </div>

            {loading && repos.length === 0 ? (
              <div className="h-64 flex items-center justify-center border border-dashed border-white/10 bg-white/5 animate-pulse font-tech text-neon-cyan">
                [ SCANNING CHAIN ... ]
              </div>
            ) : repos.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center border border-dashed border-white/10 bg-white/[0.02]">
                <div className="mb-4 text-neon-pink animate-pulse">
                  <Box size={48} />
                </div>
                <span className="text-white/40 font-tech uppercase tracking-widest">
                  {shortWallet(validWallet)} has no repos yet.
                </span>
              </div>
            ) : (
              <div className="grid gap-6">
                {repos.map((repo) => (
                  <Link
                    href={`/${repo.owner}/${repo.name}`}
                    key={`${repo.owner}-${repo.name}`}
                    className="block group cyber-card p-6 transition-all hover:translate-x-1 hover:border-neon-pink"
                  >
                    <div className="absolute top-0 right-0 p-2 opacity-100 flex flex-col items-end gap-1">
                      <span className="text-[10px] font-mono text-neon-cyan/50">
                        ID: {repo.name.toUpperCase().slice(0, 3)}
                      </span>
                      {(starCounts[repo.name] || 0) > 0 && (
                        <div className="flex items-center gap-1 text-neon-yellow text-xs font-bold font-tech border border-neon-yellow/30 px-2 py-0.5 bg-neon-yellow/5">
                          <Star size={10} className="fill-neon-yellow" />
                          {starCounts[repo.name]}
                        </div>
                      )}
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
                          {wallet.publicKey && repo.owner === wallet.publicKey.toBase58() && (
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
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
