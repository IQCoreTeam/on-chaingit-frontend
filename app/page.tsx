"use client";

// Home — public registry gallery + repo creation. Cyberpunk shell preserved
// from v1; data layer now goes through `@iqlabs-official/git-sdk/browser`.

import { useActiveGitClient, useInvalidateRepo, useRegistry } from "@/hooks/useGitData";
import { useWallet } from "@solana/wallet-adapter-react";
import { NetworkSelector } from "@/app/components/NetworkSelector";
import { Box, Folder, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const PAGE_FETCH = 1000;
const PAGE_SIZE = 30;

const Spinner = () => (
  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

export default function Home() {
  const wallet = useWallet();
  const myAddr = wallet.publicKey?.toBase58();
  const client = useActiveGitClient();
  const invalidate = useInvalidateRepo();
  const { data: entries, isFetching, refetch } = useRegistry({ limit: PAGE_FETCH });

  const [filter, setFilter] = useState<"all" | "mine">("all");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const filteredEntries = useMemo(() => {
    if (!entries) return [];
    if (filter === "mine") return myAddr ? entries.filter((e) => e.owner === myAddr) : [];
    return entries;
  }, [entries, filter, myAddr]);

  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoDesc, setNewRepoDesc] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [creating, setCreating] = useState(false);

  async function handleCreateRepo(e: React.FormEvent) {
    e.preventDefault();
    if (!client) {
      toast.error("Connect your wallet first");
      return;
    }
    setCreating(true);
    try {
      await client.createRepo({
        name: newRepoName.trim(),
        description: newRepoDesc.trim(),
        isPublic,
        timestamp: Date.now(),
      });
      toast.success(`Created ${newRepoName}`);
      if (myAddr) invalidate(myAddr, newRepoName);
      setNewRepoName("");
      setNewRepoDesc("");
      setIsPublic(true);
      refetch();
    } catch (err) {
      console.warn("createRepo failed", err);
      toast.error(err instanceof Error ? err.message : "Failed to create repo");
      throw err;
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-cyber-bg text-foreground font-sans relative overflow-x-hidden">
      <div className="scanline"></div>

      <nav className="border-b border-cyber-border bg-cyber-bg/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 border border-neon-pink bg-neon-pink/10 flex items-center justify-center shadow-[0_0_10px_rgba(255,0,255,0.3)]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" className="text-neon-pink">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>
            <span className="text-2xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-neon-pink to-neon-cyan neon-text-pink font-cyber uppercase">
              SolGit
            </span>
            <span className="text-xs text-neon-cyan font-mono border border-neon-cyan px-1 uppercase opacity-60">v0.9.beta</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/pages" className="text-sm font-tech text-neon-pink hover:text-white px-4 py-2 hover:bg-neon-pink/10 transition-colors uppercase tracking-widest border border-transparent hover:border-neon-pink hidden md:block">
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-8 flex flex-col gap-6">
            <div className="flex items-center justify-between border-b border-cyber-border pb-4">
              <div className="flex items-center gap-6">
                <h2 className="text-3xl font-bold font-cyber uppercase tracking-widest text-white neon-text-cyan">
                  Repositories
                </h2>
                <div className="flex bg-cyber-panel border border-cyber-border rounded-sm overflow-hidden h-8">
                  <button
                    onClick={() => setFilter("all")}
                    className={`px-4 text-xs font-bold font-tech uppercase tracking-wider transition-colors ${filter === "all" ? "bg-neon-cyan/20 text-neon-cyan" : "text-white/40 hover:text-white"}`}
                  >
                    Global
                  </button>
                  <div className="w-[1px] bg-cyber-border"></div>
                  <button
                    onClick={() => setFilter("mine")}
                    className={`px-4 text-xs font-bold font-tech uppercase tracking-wider transition-colors ${filter === "mine" ? "bg-neon-pink/20 text-neon-pink" : "text-white/40 hover:text-white"}`}
                  >
                    My Repos
                  </button>
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

            {isFetching && filteredEntries.length === 0 ? (
              <div className="h-64 flex items-center justify-center border border-dashed border-white/10 bg-white/5 animate-pulse font-tech text-neon-cyan">
                [ SYSTEMS INITIALIZING ... ]
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center border border-dashed border-white/10 bg-white/[0.02]">
                <div className="mb-4 text-neon-pink animate-pulse">
                  <Box size={48} />
                </div>
                <span className="text-white/40 font-tech uppercase tracking-widest">
                  {filter === "mine" && !myAddr ? "CONNECT_WALLET_REQUIRED" : "No signals detected."}
                </span>
              </div>
            ) : (
              <div className="grid gap-6">
                {filteredEntries.slice(0, visible).map((entry) => (
                  <Link
                    href={`/${entry.owner}/${entry.repo}`}
                    key={`${entry.owner}-${entry.repo}`}
                    className="block group cyber-card p-6 transition-all hover:translate-x-1 hover:border-neon-pink relative"
                  >
                    <div className="absolute top-0 right-0 p-2 opacity-100">
                      <span className="text-[10px] font-mono text-neon-cyan/50">
                        ID: {entry.repo.toUpperCase().slice(0, 3)}
                      </span>
                    </div>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-4 mb-2">
                          <h3 className="text-xl font-bold text-white font-cyber tracking-wide group-hover:text-neon-pink transition-colors flex items-center gap-2">
                            <Folder size={18} className="text-neon-cyan/60" />
                            {entry.repo}
                          </h3>
                          {myAddr && entry.owner === myAddr && (
                            <span className="text-[10px] font-tech uppercase tracking-wider px-2 py-0.5 border border-neon-cyan text-neon-cyan bg-neon-cyan/10">
                              OWNER
                            </span>
                          )}
                        </div>
                        <p className="text-white/60 text-sm font-mono max-w-xl border-l-2 border-white/10 pl-3">
                          {entry.description || "NO_DATA_AVAILABLE"}
                        </p>
                      </div>
                      <div className="text-right text-xs text-white/30 space-y-1 font-tech">
                        <div className="text-neon-cyan/50">T: {new Date(entry.timestamp).toLocaleDateString()}</div>
                        <div>OWNER: {entry.owner.slice(0, 4)}...{entry.owner.slice(-4)}</div>
                      </div>
                    </div>
                  </Link>
                ))}
                {filteredEntries.length > visible && (
                  <button
                    onClick={() => setVisible((v) => v + PAGE_SIZE)}
                    className="self-center mt-2 px-6 py-2 border border-cyber-border text-neon-cyan/70 hover:text-neon-cyan hover:border-neon-cyan font-tech uppercase text-xs tracking-widest transition-all"
                  >
                    Load_More ({Math.min(PAGE_SIZE, filteredEntries.length - visible)})
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="lg:col-span-4 space-y-8">
            <div className="sticky top-28">
              <div className="cyber-card-alt p-8 bg-gradient-to-br from-cyber-panel to-black">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-3 font-cyber uppercase tracking-wider text-neon-pink border-b border-neon-pink/30 pb-2">
                  <Plus size={20} />
                  Initiate_Repo
                </h3>

                {!wallet.connected ? (
                  <div className="p-4 border border-neon-yellow/50 bg-neon-yellow/5 text-neon-yellow font-tech text-sm">
                    &gt; WALL_ACCESS_DENIED <br />
                    &gt; CONNECT_WALLET_TO_PROCEED
                  </div>
                ) : (
                  <form onSubmit={handleCreateRepo} className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-neon-cyan uppercase tracking-widest ml-1">Title</label>
                      <input
                        type="text"
                        required
                        value={newRepoName}
                        onChange={(e) => setNewRepoName(e.target.value)}
                        placeholder="PROJECT_CODENAME"
                        className="w-full cyber-input"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-neon-cyan uppercase tracking-widest ml-1">Manifest</label>
                      <textarea
                        value={newRepoDesc}
                        onChange={(e) => setNewRepoDesc(e.target.value)}
                        placeholder="System parameters..."
                        className="w-full cyber-input h-24 resize-none"
                      />
                    </div>

                    <div className="flex gap-4 pt-2">
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <div className={`w-4 h-4 border transition-colors flex items-center justify-center ${isPublic ? "border-neon-green bg-neon-green/20" : "border-white/20"}`}>
                          {isPublic && <div className="w-2 h-2 bg-neon-green"></div>}
                        </div>
                        <input type="radio" className="hidden" checked={isPublic} onChange={() => setIsPublic(true)} />
                        <span className={`text-sm font-tech ${isPublic ? "text-neon-green" : "text-white/50"}`}>PUBLIC</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <div className={`w-4 h-4 border transition-colors flex items-center justify-center ${!isPublic ? "border-neon-yellow bg-neon-yellow/20" : "border-white/20"}`}>
                          {!isPublic && <div className="w-2 h-2 bg-neon-yellow"></div>}
                        </div>
                        <input type="radio" className="hidden" checked={!isPublic} onChange={() => setIsPublic(false)} />
                        <span className={`text-sm font-tech ${!isPublic ? "text-neon-yellow" : "text-white/50"}`}>PRIVATE</span>
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={creating || !newRepoName}
                      className="w-full cyber-button-primary mt-4 disabled:opacity-50 disabled:cursor-not-allowed group flex justify-center items-center gap-2"
                    >
                      {creating && <Spinner />}
                      {creating ? "EXECUTING..." : "INITIALIZE"}
                      <span className="hidden group-hover:inline group-hover:animate-pulse">_</span>
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
