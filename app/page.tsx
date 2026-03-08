"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useEffect, useState, useMemo } from "react";
import { GitChainService } from "@/services/git/git-chain-service";
import { Repository, FundingPool } from "@/services/git/types";
import { Plus, GitBranch, Folder, RefreshCw, Box, Star, Flame, Coins, HeartHandshake } from "lucide-react";
import { toast } from 'sonner';
import Link from 'next/link'; // I'll assume lucide-react or similar icons, or just use text if not available. Wait, I should not assume unseen packages. I'll use text or SVGs.
/* Using SVG directly for safety */

const Spinner = () => (
  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

// ... imports kept same ...

export default function Home() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoDesc, setNewRepoDesc] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  const [starCounts, setStarCounts] = useState<Record<string, number>>({});
  const [qfPool, setQfPool] = useState<FundingPool | null>(null);
  const [donating, setDonating] = useState(false);
  
  // Filter state
  const [filter, setFilter] = useState<'all' | 'mine' | 'trending'>('all');

  const filteredRepos = useMemo(() => {
      let result = repos;
      if (filter === 'mine') {
           if (!wallet.publicKey) return [];
           result = repos.filter(r => r.owner === wallet.publicKey!.toBase58());
      }
      
      if (filter === 'trending') {
          // Sort by stars descending
          return [...result].sort((a,b) => (starCounts[b.name] || 0) - (starCounts[a.name] || 0));
      }

      return result;
  }, [repos, filter, wallet.publicKey, starCounts]);

  // Re-instantiate service when wallet/connection changes
  const gitService = useMemo(() => new GitChainService(connection, wallet as any), [connection, wallet]);

  const fetchRepos = async () => {
     try {
         setLoading(true);
         const list = await gitService.listRepos();
         list.sort((a, b) => b.timestamp - a.timestamp);
         setRepos(list);
         
         // Fetch stars
         const allStars = await gitService.fetchAllStars();
         const counts: Record<string, number> = {};
         allStars.forEach(s => {
             counts[s.repoName] = (counts[s.repoName] || 0) + 1;
         });
         setStarCounts(counts);
     } catch (e) {
         console.error("Failed to fetch repos", e);
     } finally {
         setLoading(false);
     }
  };

  const loadPool = async () => {
      if (!wallet.publicKey) return;
      const pool = await gitService.getFundingPool();
      setQfPool(pool);
  };

  useEffect(() => {
      if (wallet.publicKey) loadPool();
  }, [gitService, wallet.publicKey]);

  useEffect(() => {
      fetchRepos();
      const interval = setInterval(fetchRepos, 10000);
      return () => clearInterval(interval);
  }, [gitService]);

  const handleCreateRepo = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!wallet.publicKey) return;
      
      try {
          setCreating(true);
          await gitService.createRepo(newRepoName, newRepoDesc, isPublic);
          setNewRepoName("");
          setNewRepoDesc("");
          setIsPublic(true);
          await fetchRepos();
      } catch (e: any) {
          console.error(e);
          alert("Error creating repo: " + e.message);
      } finally {
          setCreating(false);
      }
  };

  return (
    <div className="min-h-screen bg-cyber-bg text-foreground font-sans relative overflow-x-hidden">
      <div className="scanline"></div>
      
      {/* Navbar */}
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
              <Link href="/profile" className="text-sm font-tech text-neon-cyan hover:text-white px-4 py-2 hover:bg-neon-cyan/10 transition-colors uppercase tracking-widest border border-transparent hover:border-neon-cyan hidden md:block">
                  My // Profile
              </Link>
              <WalletMultiButton className="!bg-neon-cyan/10 !border !border-neon-cyan !text-neon-cyan !rounded-none !font-tech !uppercase !tracking-wider hover:!bg-neon-cyan/20 hover:!shadow-[0_0_15px_cyan]" />
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-12 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* List Section */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            <div className="flex items-center justify-between border-b border-cyber-border pb-4">
                <div className="flex items-center gap-6">
                    <h2 className="text-3xl font-bold font-cyber uppercase tracking-widest text-white neon-text-cyan">
                        Repositories
                    </h2>
                    <div className="flex bg-cyber-panel border border-cyber-border rounded-sm overflow-hidden h-8">
                        <button 
                           onClick={() => setFilter('all')}
                           className={`px-4 text-xs font-bold font-tech uppercase tracking-wider transition-colors ${filter === 'all' ? 'bg-neon-cyan/20 text-neon-cyan' : 'text-white/40 hover:text-white'}`}
                        >
                            Global
                        </button>
                        <div className="w-[1px] bg-cyber-border"></div>
                        <button 
                           onClick={() => setFilter('trending')}
                           className={`px-4 text-xs font-bold font-tech uppercase tracking-wider transition-colors flex items-center gap-2 ${filter === 'trending' ? 'bg-neon-yellow/20 text-neon-yellow' : 'text-white/40 hover:text-white'}`}
                        >
                            <Flame size={12} /> Trending
                        </button>
                        <div className="w-[1px] bg-cyber-border"></div>
                        <button 
                           onClick={() => setFilter('mine')}
                           className={`px-4 text-xs font-bold font-tech uppercase tracking-wider transition-colors ${filter === 'mine' ? 'bg-neon-pink/20 text-neon-pink' : 'text-white/40 hover:text-white'}`}
                        >
                            My Repos
                        </button>
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
                    [ SYSTEMS INITIALIZING ... ]
                </div>
            ) : filteredRepos.length === 0 ? (
               <div className="h-64 flex flex-col items-center justify-center border border-dashed border-white/10 bg-white/[0.02]">
                    <div className="mb-4 text-neon-pink animate-pulse">
                        <Box size={48} />
                    </div>
                    <span className="text-white/40 font-tech uppercase tracking-widest">
                        {filter === 'mine' && !wallet.connected ? "CONNECT_WALLET_REQUIRED" : "No signals detected."}
                    </span>
                </div>
            ) : (
                <div className="grid gap-6">
                    {filteredRepos.map((repo) => (
                        <Link href={`/repos/${repo.name}`} key={repo.name} className="block group cyber-card p-6 transition-all hover:translate-x-1 hover:border-neon-pink">
                            <div className="absolute top-0 right-0 p-2 opacity-100 flex flex-col items-end gap-1">
                                <span className="text-[10px] font-mono text-neon-cyan/50">ID: {repo.name.toUpperCase().slice(0, 3)}</span>
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
                                        <span className={`text-[10px] font-tech uppercase tracking-wider px-2 py-0.5 border ${repo.isPublic ? 'border-neon-green text-neon-green bg-neon-green/10' : 'border-neon-yellow text-neon-yellow bg-neon-yellow/10'}`}>
                                            {repo.isPublic ? 'PUB' : 'PVT'}
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
                                    <div className="text-neon-cyan/50">T: {new Date(repo.timestamp).toLocaleDateString()}</div>
                                    <div>OWNER: {repo.owner.slice(0,4)}...{repo.owner.slice(-4)}</div>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
          </div>

          {/* Create Sidebar */}
          <div className="lg:col-span-4 space-y-8">
             {/* Funding Pool Widget */}
             <div className="cyber-card p-6 border-neon-green/30 bg-black/40">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold font-cyber uppercase tracking-widest text-neon-green flex items-center gap-2">
                        <HeartHandshake size={20} /> Match_Pool
                    </h3>
                    <div className="text-[10px] text-neon-green/60 font-tech px-2 py-0.5 border border-neon-green/30">
                        {qfPool ? `${qfPool.matchingMultiplier}x MATCHING` : "OFFLINE"}
                    </div>
                </div>
                
                <div className="text-center py-4 border-y border-dashed border-neon-green/20 mb-4">
                    <div className="text-3xl font-bold text-white mb-1 font-mono tabular-nums">
                        {qfPool?.totalFunds.toFixed(2) || "0.00"} <span className="text-base text-neon-green">SOL</span>
                    </div>
                    <div className="text-[10px] text-white/40 uppercase tracking-widest font-tech">
                        Total Community Funding
                    </div>
                </div>

                <div className="flex items-center justify-between text-xs text-white/50 mb-4 font-mono px-2">
                    <span>Contributors: {qfPool?.contributors || 0}</span>
                    <span>Qaudratic Formula: Active</span>
                </div>

                <button 
                    disabled={!wallet.connected || donating}
                    onClick={async () => {
                        try {
                            setDonating(true);
                            await gitService.donateToPool(1); // Demo 1 SOL donation
                            toast.success("Donated 1 SOL to the Matching Pool!");
                            await loadPool();
                        } catch(e) {
                            console.error(e);
                            toast.error("Donation failed");
                        } finally {
                            setDonating(false);
                        }
                    }}
                    className="w-full py-2 bg-neon-green/10 border border-neon-green/50 text-neon-green hover:bg-neon-green/20 font-bold uppercase text-xs tracking-wider transition-all shadow-[0_0_10px_rgba(0,255,0,0.1)] hover:shadow-[0_0_15px_rgba(0,255,0,0.3)]"
                >
                    {donating ? "PROCESSING..." : "DONATE 1 SOL"}
                </button>
             </div>

             <div className="sticky top-28">
                <div className="cyber-card-alt p-8 bg-gradient-to-br from-cyber-panel to-black">
                   <h3 className="text-xl font-bold mb-6 flex items-center gap-3 font-cyber uppercase tracking-wider text-neon-pink border-b border-neon-pink/30 pb-2">
                       <Plus size={20} />
                       Initiate_Repo
                   </h3>
                   
                   {!wallet.connected ? (
                       <div className="p-4 border border-neon-yellow/50 bg-neon-yellow/5 text-neon-yellow font-tech text-sm">
                           &gt; WALL_ACCESS_DENIED <br/>
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
                                  onChange={e => setNewRepoName(e.target.value)}
                                  placeholder="PROJECT_CODENAME"
                                  className="w-full cyber-input" 
                               />
                           </div>
                           
                           <div className="space-y-2">
                               <label className="text-xs font-bold text-neon-cyan uppercase tracking-widest ml-1">Manifest</label>
                               <textarea 
                                  value={newRepoDesc}
                                  onChange={e => setNewRepoDesc(e.target.value)}
                                  placeholder="System parameters..."
                                  className="w-full cyber-input h-24 resize-none" 
                               />
                           </div>

                           <div className="flex gap-4 pt-2">
                               <label className="flex items-center gap-3 cursor-pointer group">
                                   <div className={`w-4 h-4 border transition-colors flex items-center justify-center ${isPublic ? 'border-neon-green bg-neon-green/20' : 'border-white/20'}`}>
                                       {isPublic && <div className="w-2 h-2 bg-neon-green"></div>}
                                   </div>
                                   <input type="radio" className="hidden" checked={isPublic} onChange={() => setIsPublic(true)} />
                                   <span className={`text-sm font-tech ${isPublic ? 'text-neon-green' : 'text-white/50'}`}>PUBLIC</span>
                               </label>
                               <label className="flex items-center gap-3 cursor-pointer group">
                                   <div className={`w-4 h-4 border transition-colors flex items-center justify-center ${!isPublic ? 'border-neon-yellow bg-neon-yellow/20' : 'border-white/20'}`}>
                                       {!isPublic && <div className="w-2 h-2 bg-neon-yellow"></div>}
                                   </div>
                                   <input type="radio" className="hidden" checked={!isPublic} onChange={() => setIsPublic(false)} />
                                   <span className={`text-sm font-tech ${!isPublic ? 'text-neon-yellow' : 'text-white/50'}`}>PRIVATE</span>
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
