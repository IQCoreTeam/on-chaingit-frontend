"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { toast } from "sonner";
import { GitChainService } from "@/services/git/git-chain-service";
import {
  IQPAGES_TEMPLATE,
  IQPROFILE_TEMPLATE,
  validateIqpagesConfig,
  validateIqprofileConfig,
} from "@/services/iqpages/iqpages-service";
import { useIqpagesConfig, useIqpagesProfile } from "@/hooks/useIqpagesData";

export default function PagesSetup() {
  const params = useParams<{ wallet: string; repo: string }>();
  const router = useRouter();
  const walletAdapter = useWallet();
  const { connection } = useConnection();

  const owner = params?.wallet;
  const repoName = params?.repo;
  const isOwner = walletAdapter.publicKey?.toBase58() === owner;

  const { data: existingConfig } = useIqpagesConfig(owner, repoName);
  const { data: existingProfile } = useIqpagesProfile(owner, repoName);

  const [iqpagesJson, setIqpagesJson] = useState("");
  const [iqprofileJson, setIqprofileJson] = useState("");
  const [includeProfile, setIncludeProfile] = useState(false);
  const [iqpagesError, setIqpagesError] = useState<string | null>(null);
  const [iqprofileError, setIqprofileError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Prefill once on first existingConfig/profile load
  useEffect(() => {
    if (initialized) return;
    if (existingConfig === undefined) return; // still loading
    setIqpagesJson(
      existingConfig ? JSON.stringify(existingConfig, null, 2) : IQPAGES_TEMPLATE,
    );
    if (existingProfile) {
      setIqprofileJson(JSON.stringify(existingProfile, null, 2));
      setIncludeProfile(true);
    } else {
      setIqprofileJson(IQPROFILE_TEMPLATE);
    }
    setInitialized(true);
  }, [existingConfig, existingProfile, initialized]);

  useEffect(() => {
    if (!iqpagesJson) return;
    try {
      validateIqpagesConfig(JSON.parse(iqpagesJson));
      setIqpagesError(null);
    } catch (e) {
      setIqpagesError((e as Error).message);
    }
  }, [iqpagesJson]);

  useEffect(() => {
    if (!includeProfile) { setIqprofileError(null); return; }
    try {
      validateIqprofileConfig(JSON.parse(iqprofileJson));
      setIqprofileError(null);
    } catch (e) {
      setIqprofileError((e as Error).message);
    }
  }, [iqprofileJson, includeProfile]);

  async function handleCommit() {
    if (!owner || !repoName) return;
    if (!isOwner) {
      toast.error("Only the repo owner can edit Pages config.");
      return;
    }
    if (iqpagesError || (includeProfile && iqprofileError)) {
      toast.error("Fix validation errors first.");
      return;
    }

    setCommitting(true);
    try {
      // TODO(iqpages): current GitChainService.commit reads files from
      // process.cwd() which does not exist in browser. This path is a
      // placeholder until browser-side commit-with-content is wired up.
      toast.message("Commit-from-browser is not yet wired up. See TODO in page.", {
        description: "For now, commit iqpages.json/iqprofile.json locally via iq-git-cli.",
      });
      console.log("Would commit:", {
        iqpagesJson,
        iqprofileJson: includeProfile ? iqprofileJson : null,
      });
    } finally {
      setCommitting(false);
    }
  }

  if (!owner || !repoName) return null;

  return (
    <div className="min-h-screen bg-cyber-bg text-foreground font-sans relative overflow-x-hidden">
      <div className="scanline"></div>

      <nav className="border-b border-cyber-border bg-cyber-bg/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href={`/${owner}/${repoName}`} className="text-sm font-tech text-neon-cyan uppercase tracking-widest hover:text-white">
            ← {repoName}
          </Link>
          <WalletMultiButton className="!bg-neon-cyan/10 !border !border-neon-cyan !text-neon-cyan !rounded-none !font-tech !uppercase !tracking-wider hover:!bg-neon-cyan/20 hover:!shadow-[0_0_15px_cyan]" />
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-12 relative z-10">
        <div className="border-b border-cyber-border pb-4 mb-8">
          <h1 className="text-3xl font-bold font-cyber uppercase tracking-widest text-white neon-text-cyan">
            IQ Pages Setup
          </h1>
          <p className="text-sm text-neon-cyan/60 font-mono mt-2">
            Configure {owner.slice(0, 4)}…{owner.slice(-4)} / {repoName}
          </p>
        </div>

        {!isOwner && (
          <div className="border border-neon-pink/50 bg-neon-pink/5 text-neon-pink p-4 font-mono text-sm mb-6">
            Connect the wallet that owns this repo to edit its Pages config.
          </div>
        )}

        <section className="mb-8">
          <h2 className="text-lg font-cyber uppercase tracking-widest text-neon-cyan mb-3">
            iqpages.json (required)
          </h2>
          <textarea
            value={iqpagesJson}
            onChange={(e) => setIqpagesJson(e.target.value)}
            className="w-full h-48 bg-black border border-cyber-border p-3 font-mono text-sm text-white focus:outline-none focus:border-neon-cyan"
            spellCheck={false}
          />
          {iqpagesError && (
            <div className="text-red-400 text-xs font-mono mt-2">{iqpagesError}</div>
          )}
        </section>

        <section className="mb-8">
          <label className="flex items-center gap-2 text-sm font-mono text-white/80 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeProfile}
              onChange={(e) => setIncludeProfile(e.target.checked)}
            />
            Add iqprofile.json for Profile Net integration
          </label>
          {includeProfile && (
            <>
              <textarea
                value={iqprofileJson}
                onChange={(e) => setIqprofileJson(e.target.value)}
                className="w-full h-56 bg-black border border-cyber-border p-3 font-mono text-sm text-white focus:outline-none focus:border-neon-cyan"
                spellCheck={false}
              />
              {iqprofileError && (
                <div className="text-red-400 text-xs font-mono mt-2">{iqprofileError}</div>
              )}
            </>
          )}
        </section>

        <div className="flex gap-3">
          <button
            onClick={handleCommit}
            disabled={
              !isOwner ||
              committing ||
              !!iqpagesError ||
              (includeProfile && !!iqprofileError)
            }
            className="py-3 px-6 cyber-button-primary disabled:opacity-40"
          >
            {committing ? "Committing…" : "Commit to repo"}
          </button>
          <Link
            href={`/${owner}/${repoName}`}
            className="py-3 px-6 border border-cyber-border text-white/70 font-tech uppercase tracking-widest hover:border-neon-cyan hover:text-neon-cyan"
          >
            Cancel
          </Link>
        </div>

        <div className="mt-8 p-4 border border-dashed border-white/20 text-xs font-mono text-white/50">
          <p className="mb-1">Note: in-browser commit is a work in progress.</p>
          <p>For now, add <code className="text-neon-cyan">iqpages.json</code> (and optionally <code className="text-neon-cyan">iqprofile.json</code>) to your repo locally and commit via <code className="text-neon-cyan">iq-git-cli</code>, then come back here to deploy.</p>
        </div>
      </main>
    </div>
  );
}
