"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useIqpagesService, useIqpagesList } from "@/hooks/useIqpagesData";
import { useGitService } from "@/hooks/useGitData";

const GATEWAY_SITE_BASE = "https://gateway.solanainternet.com/site";

export default function PagesGallery() {
  const svc = useIqpagesService();
  const git = useGitService();
  const { data: deployments, isLoading, error } = useIqpagesList();

  const perCardQueries = useQueries({
    queries: (deployments ?? []).flatMap((d) => [
      {
        queryKey: ["iqpages", "config", d.owner, d.repoName],
        queryFn: () => svc.readConfig(d.owner, d.repoName),
        staleTime: 5 * 60_000,
      },
      {
        queryKey: ["iqpages", "profile", d.owner, d.repoName],
        queryFn: () => svc.readProfile(d.owner, d.repoName),
        staleTime: 5 * 60_000,
      },
      {
        queryKey: ["git", "latestTree", d.owner, d.repoName],
        queryFn: async () => {
          const commits = await git.getLog(d.repoName, d.owner);
          return commits[0]?.treeTxId ?? null;
        },
        staleTime: 60_000,
      },
    ]),
  });

  const cards = useMemo(() => {
    return (deployments ?? []).map((d, i) => ({
      ...d,
      config: perCardQueries[i * 3]?.data as any,
      profile: perCardQueries[i * 3 + 1]?.data as any,
      treeTxId: perCardQueries[i * 3 + 2]?.data as string | null | undefined,
    }));
  }, [deployments, perCardQueries]);

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
            <Link href="/profile" className="text-sm font-tech text-neon-cyan hover:text-white px-4 py-2 hover:bg-neon-cyan/10 transition-colors uppercase tracking-widest border border-transparent hover:border-neon-cyan hidden md:block">
              My // Profile
            </Link>
            <WalletMultiButton className="!bg-neon-cyan/10 !border !border-neon-cyan !text-neon-cyan !rounded-none !font-tech !uppercase !tracking-wider hover:!bg-neon-cyan/20 hover:!shadow-[0_0_15px_cyan]" />
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

        {isLoading && (
          <div className="text-neon-cyan font-mono">Loading deployments…</div>
        )}

        {error && (
          <div className="text-red-400 font-mono">
            Failed to load: {(error as Error).message}
          </div>
        )}

        {!isLoading && cards.length === 0 && (
          <div className="border border-cyber-border bg-cyber-panel/50 p-8 text-center text-neon-cyan/70 font-mono">
            No pages deployed yet.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map((c) => (
            <Link
              key={`${c.owner}/${c.repoName}`}
              href={`/pages/${c.owner}/${c.repoName}`}
              className="border border-cyber-border bg-cyber-panel/50 hover:border-neon-pink hover:shadow-[0_0_15px_rgba(255,0,255,0.3)] transition-all p-5 flex flex-col gap-2"
            >
              <div className="flex items-center gap-3">
                {c.profile?.icon && c.treeTxId ? (
                  <img
                    src={`${GATEWAY_SITE_BASE}/${c.treeTxId}/${c.profile.icon.replace(/^\.\//, "")}`}
                    alt=""
                    className="w-10 h-10 border border-neon-cyan/40 object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="w-10 h-10 border border-neon-cyan/40 bg-neon-cyan/5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-cyber uppercase tracking-wide text-white truncate">
                    {c.profile?.displayName || c.config?.name || c.repoName}
                  </div>
                  <div className="text-xs text-neon-cyan/60 font-mono truncate">
                    {c.owner.slice(0, 4)}…{c.owner.slice(-4)} / {c.repoName}
                  </div>
                </div>
              </div>
              <p className="text-sm text-neon-cyan/80 font-mono line-clamp-3 mt-1">
                {c.profile?.description || c.config?.description || "—"}
              </p>
              {c.config?.version && (
                <div className="text-[10px] text-neon-pink font-mono uppercase mt-auto">
                  v{c.config.version}
                </div>
              )}
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
