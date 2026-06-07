"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { NetworkSelector } from "@/app/components/NetworkSelector";
import { toast } from "sonner";
import { useActiveGitClient, useFileTree, useCommits, useInvalidateRepo } from "@/hooks/useGitData";
import { useIqpagesConfig, useIqpagesProfile, useIqpagesService } from "@/hooks/useIqpagesData";
import { loadBlob } from "@iqlabs-official/git-sdk/browser";
import {
  IQPAGES_CONSTANTS,
  validateIqpagesConfig,
  validateIqprofileConfig,
} from "@/services/iqpages/iqpages-service";

function encodeBase64Text(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export default function PagesSetup() {
  const params = useParams<{ wallet: string; repo: string }>();
  const walletAdapter = useWallet();
  const owner = params?.wallet;
  const repoName = params?.repo;
  const isOwner = walletAdapter.publicKey?.toBase58() === owner;
  const client = useActiveGitClient();
  const iqpagesSvc = useIqpagesService();
  const invalidate = useInvalidateRepo();
  const { data: commits } = useCommits(owner, repoName);
  const headTreeId = commits?.[0]?.treeTxId;
  const { data: tree } = useFileTree(headTreeId);

  const { data: existingConfig } = useIqpagesConfig(owner, repoName);
  const { data: existingProfile } = useIqpagesProfile(owner, repoName);

  const [iqpagesJson, setIqpagesJson] = useState("");
  const [iqprofileJson, setIqprofileJson] = useState("");
  const [includeProfile, setIncludeProfile] = useState(false);
  const [iqpagesError, setIqpagesError] = useState<string | null>(null);
  const [iqprofileError, setIqprofileError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [initialized, setInitialized] = useState(false);
  // Prefilled-from-chain configs start locked so a stray click can't
  // overwrite them. The user explicitly hits "Edit" to enable the textarea;
  // "Cancel" reverts to the on-chain value.
  const [iqpagesLocked, setIqpagesLocked] = useState(false);
  const [iqprofileLocked, setIqprofileLocked] = useState(false);

  // Prefill only when a config already exists in the repo's commit. When it
  // doesn't, leave the textarea empty so the placeholder template is visible
  // — the user fills it (or pastes their own) before committing.
  useEffect(() => {
    if (initialized) return;
    if (existingConfig === undefined) return; // still loading
    if (existingConfig) {
      setIqpagesJson(JSON.stringify(existingConfig, null, 2));
      setIqpagesLocked(true);
    }
    if (existingProfile) {
      setIqprofileJson(JSON.stringify(existingProfile, null, 2));
      setIncludeProfile(true);
      setIqprofileLocked(true);
    }
    setInitialized(true);
  }, [existingConfig, existingProfile, initialized]);

  function unlockIqpages() {
    setIqpagesLocked(false);
  }
  function cancelIqpagesEdit() {
    if (existingConfig) setIqpagesJson(JSON.stringify(existingConfig, null, 2));
    setIqpagesLocked(true);
  }
  function unlockIqprofile() {
    setIqprofileLocked(false);
  }
  function cancelIqprofileEdit() {
    if (existingProfile) setIqprofileJson(JSON.stringify(existingProfile, null, 2));
    setIqprofileLocked(true);
  }

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
    if (!client) {
      toast.error("Wallet not connected");
      return;
    }

    setCommitting(true);
    try {
      // Build the next commit's scan map: every existing blob carried over
      // unchanged + iqpages.json (and optionally iqprofile.json) overwritten.
      const scan: Record<string, string> = {};
      if (tree) {
        for (const [path, entry] of Object.entries(tree)) {
          if (path === IQPAGES_CONSTANTS.CONFIG_FILENAME) continue;
          if (path === IQPAGES_CONSTANTS.PROFILE_FILENAME && includeProfile) continue;
          scan[path] = await loadBlob(entry.txId);
        }
      }
      scan[IQPAGES_CONSTANTS.CONFIG_FILENAME] = encodeBase64Text(iqpagesJson);
      if (includeProfile) {
        scan[IQPAGES_CONSTANTS.PROFILE_FILENAME] = encodeBase64Text(iqprofileJson);
      }

      const commit = await client.commit(repoName, "iqpages config update", scan);
      invalidate(owner, repoName);
      // Re-lock so the next click is "Deploy", not "another commit". The
      // refetch from invalidate() will pull the new existingConfig and the
      // textareas already mirror it.
      setIqpagesLocked(true);
      if (includeProfile) setIqprofileLocked(true);
      toast.success(`Committed ${commit.id.slice(0, 8)}…`);
    } catch (e) {
      console.warn("Pages config commit failed", e);
      toast.error("Commit failed: " + (e instanceof Error ? e.message : String(e)));
      throw e;
    } finally {
      setCommitting(false);
    }
  }

  async function handleDeploy() {
    if (!owner || !repoName || !isOwner) return;

    // Deploy reads iqpages.json from the latest commit. If the file isn't in
    // that commit yet, the deploy will fail with a confusing on-chain error
    // — surface it before sending any tx.
    if (!existingConfig) {
      toast.error(
        "iqpages.json isn't in this repo yet. Fill it in above and click 'Commit to repo' first.",
        { duration: 6000 },
      );
      return;
    }

    // The user typed changes into the (unlocked) textarea but never committed
    // them. Deploying now would pin the *previous* commit, which is almost
    // certainly not what they want.
    if (!iqpagesLocked || (includeProfile && !iqprofileLocked)) {
      toast.error(
        "You have uncommitted edits. Click 'Commit to repo' first, then Deploy.",
        { duration: 6000 },
      );
      return;
    }

    setCommitting(true);
    try {
      const sig = await iqpagesSvc.deploy(repoName);
      toast.success(`Deployed: ${sig.slice(0, 12)}…`);
    } catch (e) {
      console.warn("Deploy failed", e);
      toast.error(e instanceof Error ? e.message : "Deploy failed");
      throw e;
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
          <NetworkSelector />
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
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-cyber uppercase tracking-widest text-neon-cyan">
              iqpages.json (required)
            </h2>
            {existingConfig && (
              iqpagesLocked ? (
                <button
                  onClick={unlockIqpages}
                  className="text-xs font-tech uppercase tracking-widest text-neon-pink border border-neon-pink/50 px-3 py-1 hover:bg-neon-pink/10"
                >
                  Edit
                </button>
              ) : (
                <button
                  onClick={cancelIqpagesEdit}
                  className="text-xs font-tech uppercase tracking-widest text-white/60 border border-cyber-border px-3 py-1 hover:border-white/40"
                >
                  Cancel edit
                </button>
              )
            )}
          </div>
          <textarea
            value={iqpagesJson}
            onChange={(e) => setIqpagesJson(e.target.value)}
            readOnly={iqpagesLocked}
            placeholder={`{\n  "name": "${repoName ?? "my-app"}",\n  "version": "1.0.0",\n  "description": "Short description",\n  "entry": "index.html"\n}`}
            className={`w-full h-48 bg-black border p-3 font-mono text-sm placeholder-white/30 focus:outline-none ${iqpagesLocked ? "border-cyber-border text-white/60 cursor-not-allowed" : "border-cyber-border text-white focus:border-neon-cyan"}`}
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
              {existingProfile && (
                <div className="flex justify-end mb-2">
                  {iqprofileLocked ? (
                    <button
                      onClick={unlockIqprofile}
                      className="text-xs font-tech uppercase tracking-widest text-neon-pink border border-neon-pink/50 px-3 py-1 hover:bg-neon-pink/10"
                    >
                      Edit
                    </button>
                  ) : (
                    <button
                      onClick={cancelIqprofileEdit}
                      className="text-xs font-tech uppercase tracking-widest text-white/60 border border-cyber-border px-3 py-1 hover:border-white/40"
                    >
                      Cancel edit
                    </button>
                  )}
                </div>
              )}
              <textarea
                value={iqprofileJson}
                onChange={(e) => setIqprofileJson(e.target.value)}
                readOnly={iqprofileLocked}
                placeholder={`{\n  "displayName": "${repoName ?? "My App"}",\n  "description": "Short description",\n  "icon": "./icon.png",\n  "routes": {\n    "profile": "/?profile={walletAddress}"\n  }\n}`}
                className={`w-full h-56 bg-black border p-3 font-mono text-sm placeholder-white/30 focus:outline-none ${iqprofileLocked ? "border-cyber-border text-white/60 cursor-not-allowed" : "border-cyber-border text-white focus:border-neon-cyan"}`}
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
              (includeProfile && !!iqprofileError) ||
              // Nothing was actually edited — commit would be a no-op.
              (iqpagesLocked && (!includeProfile || iqprofileLocked))
            }
            className="py-3 px-6 cyber-button-primary disabled:opacity-40"
          >
            {committing ? "Working…" : "Commit to repo"}
          </button>
          <button
            onClick={handleDeploy}
            disabled={!isOwner || committing}
            className="py-3 px-6 border border-neon-green text-neon-green font-tech uppercase tracking-widest hover:bg-neon-green/10 disabled:opacity-40"
          >
            Deploy
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
