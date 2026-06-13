"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { NetworkSelector } from "@/app/components/NetworkSelector";
import {
  useIqpagesConfig,
  useIqpagesProfile,
  useIqpagesDeployed,
  useLatestTreeTxId,
} from "@/hooks/useIqpagesData";
import { useNetwork } from "@/app/components/NetworkProvider";
import { pdaForCommitTable } from "@/lib/gateway/reader";

const BROWSER_BASE = "https://browser.iqlabs.dev";

function openWithDyor(owner: string, repoName: string, url: string) {
  const key = `dyor-ack-${owner}/${repoName}`;
  if (typeof window === "undefined") return;
  if (!localStorage.getItem(key)) {
    const ok = confirm(
      "This is a third-party application. IQ Labs does not audit code hosted on IQ Pages. Review before interacting with your wallet.",
    );
    if (!ok) return;
    localStorage.setItem(key, "1");
  }
  window.open(url, "_blank");
}

function pdaUrl(owner: string | undefined, repo: string | undefined): string | null {
  if (!owner || !repo) return null;
  try {
    return `${BROWSER_BASE}/${pdaForCommitTable(owner, repo).toBase58()}`;
  } catch {
    return null;
  }
}

export default function PageDetail() {
  const params = useParams<{ owner: string; repo: string }>();
  const owner = params?.owner;
  const repoName = params?.repo;

  const { data: deployed, isLoading: loadingDeployed } = useIqpagesDeployed(owner, repoName);
  const { data: config, isLoading: loadingConfig } = useIqpagesConfig(owner, repoName);
  const { data: profile } = useIqpagesProfile(owner, repoName);
  const { data: treeTxId } = useLatestTreeTxId(owner, repoName);
  const { network } = useNetwork();

  if (!owner || !repoName) return null;

  const isLoading = loadingDeployed || loadingConfig;
  // Open App points at the commit-table PDA on browser.iqlabs.dev, which
  // resolves the owner's latest commit + entry itself — so the link doesn't
  // depend on us having loaded treeTxId/config first.
  const liveUrl = pdaUrl(owner, repoName);
  const iconUrl = profile?.icon && treeTxId
    ? `${network.gatewaySiteBase}/${treeTxId}/${profile.icon.replace(/^\.\//, "")}`
    : null;

  return (
    <div className="min-h-screen bg-cyber-bg text-foreground font-sans relative overflow-x-hidden">
      <div className="scanline"></div>

      <nav className="border-b border-cyber-border bg-cyber-bg/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/pages" className="text-sm font-tech text-neon-cyan uppercase tracking-widest hover:text-white">
            ← All Pages
          </Link>
          <NetworkSelector />
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-12 relative z-10">
        {isLoading && <div className="text-neon-cyan font-mono">Loading…</div>}

        {!isLoading && !deployed && (
          <div className="border border-cyber-border bg-cyber-panel/50 p-8 text-center text-neon-cyan/70 font-mono">
            This repo is not deployed as IQ Pages.
          </div>
        )}

        {!isLoading && deployed && (
          <div className="flex flex-col gap-6">
            <div className="flex items-start gap-4 border-b border-cyber-border pb-6">
              {iconUrl ? (
                <img
                  src={iconUrl}
                  alt=""
                  className="w-16 h-16 border border-neon-cyan/40 object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div className="w-16 h-16 border border-neon-cyan/40 bg-neon-cyan/5" />
              )}
              <div className="flex-1">
                <h1 className="text-3xl font-bold font-cyber uppercase tracking-widest text-white neon-text-cyan">
                  {profile?.displayName || config?.name || repoName}
                </h1>
                <p className="text-sm text-neon-cyan/80 font-mono mt-1">
                  {profile?.description || config?.description || "—"}
                </p>
                {config?.version && (
                  <div className="text-xs text-neon-pink font-mono uppercase mt-2">
                    v{config.version}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => liveUrl && openWithDyor(owner, repoName, liveUrl)}
                disabled={!liveUrl}
                className="self-start border border-neon-pink bg-neon-pink/10 text-neon-pink font-tech uppercase tracking-widest px-6 py-3 hover:bg-neon-pink/20 hover:shadow-[0_0_15px_rgba(255,0,255,0.3)] transition-all disabled:opacity-40"
              >
                Open App →
              </button>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm font-mono mt-4">
                <div className="border border-cyber-border p-4">
                  <div className="text-neon-cyan/60 text-xs uppercase mb-1">Deployer</div>
                  <div className="text-white break-all">{owner}</div>
                </div>
                <div className="border border-cyber-border p-4">
                  <div className="text-neon-cyan/60 text-xs uppercase mb-1">Repo</div>
                  <Link
                    href={`/${owner}/${repoName}`}
                    className="text-neon-cyan hover:text-white break-all"
                  >
                    {repoName} →
                  </Link>
                </div>
                {config?.entry && (
                  <div className="border border-cyber-border p-4 md:col-span-2">
                    <div className="text-neon-cyan/60 text-xs uppercase mb-1">Live URL</div>
                    <div className="text-white break-all">{liveUrl}</div>
                  </div>
                )}
                {profile?.routes?.profile && (
                  <div className="border border-cyber-border p-4 md:col-span-2">
                    <div className="text-neon-cyan/60 text-xs uppercase mb-1">Profile route</div>
                    <div className="text-white break-all font-mono">{profile.routes.profile}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
