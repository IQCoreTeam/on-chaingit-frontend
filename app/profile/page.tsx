"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState, useMemo } from "react";
import { GitChainService } from "@/services/git/git-chain-service";
import { UserProfile, Repository, Commit } from "@/services/git/types";
import { ArrowLeft, User, Github, Twitter, Globe, Save, Loader2, GitCommit, GitBranch, Star, MapPin, Mail, Link as LinkIcon, Book, BookOpen, Clock } from "lucide-react";
import Link from 'next/link';
import { toast } from 'sonner';

export default function ProfilePage() {
    const { connection } = useConnection();
    const wallet = useWallet();
    
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [myRepos, setMyRepos] = useState<Repository[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [totalCommits, setTotalCommits] = useState(0);
    const [commitDates, setCommitDates] = useState<Record<string, number>>({});
    
    // Starred repos
    const [starredRepos, setStarredRepos] = useState<Repository[]>([]);
    
    const [activeTab, setActiveTab] = useState<'overview' | 'repos' | 'stars'>('overview');
    
    // Form state
    const [avatarUrl, setAvatarUrl] = useState("");
    const [bio, setBio] = useState("");
    const [twitter, setTwitter] = useState("");
    const [github, setGithub] = useState("");
    const [website, setWebsite] = useState("");
    
    // UI state
    const [searchQuery, setSearchQuery] = useState("");

    const gitService = useMemo(() => new GitChainService(connection, wallet as any), [connection, wallet]);

    useEffect(() => {
        if (wallet.publicKey) {
            loadAll();
        } else {
            setLoading(false);
        }
    }, [gitService, wallet.publicKey]);

    const loadAll = async () => {
        if (!wallet.publicKey) return;
        try {
            setLoading(true);
            const myAddr = wallet.publicKey.toBase58();
            
            // 1. Fetch Basic Info & Repos
            const [p, allRepos] = await Promise.all([
                 gitService.getProfile(myAddr),
                 gitService.listRepos()
            ]);

            if (p) {
                setProfile(p);
                setAvatarUrl(p.avatarUrl || "");
                setBio(p.bio || "");
                setTwitter(p.socials?.twitter || "");
                setGithub(p.socials?.github || "");
                setWebsite(p.socials?.website || "");
            }
            
            setMyRepos(allRepos.filter(r => r.owner === myAddr).sort((a,b) => b.timestamp - a.timestamp));

            // 2. Fetch Real Contribution Data
            const allCommits = await gitService.getAllCommits(myAddr);
            setTotalCommits(allCommits.length);

            // Process commit dates for graph
            const counts: Record<string, number> = {};
            allCommits.forEach(c => {
                const date = new Date(c.timestamp).toISOString().split('T')[0];
                counts[date] = (counts[date] || 0) + 1;
            });
            setCommitDates(counts);

            // 3. Fetch Starred Repos
            const starredNames = await gitService.getStarredRepos(myAddr);
            const starred = allRepos.filter(r => starredNames.includes(r.name));
            setStarredRepos(starred);

        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!wallet.publicKey) {
             toast.error("Connect wallet first");
             return;
        }
        
        try {
            setSaving(true);
            await gitService.updateProfile(avatarUrl, bio, {
                twitter,
                github,
                website
            });
            toast.success("Profile updated successfully!");
            setIsEditing(false);
            await loadAll();
        } catch (e: any) {
            toast.error("Failed to update profile: " + e.message);
        } finally {
            setSaving(false);
        }
    };

    // Contribution Graph (Real Data)
    const renderContributionGraph = () => {
        // Generate last 365 days
        const today = new Date();
        const days = [];
        for (let i = 364; i >= 0; i--) {
            const d = new Date();
            d.setDate(today.getDate() - i);
            days.push(d.toISOString().split('T')[0]);
        }

        // Chunk into weeks (simplification: just 52 columns of 7 days)
        // Correct way is to align by day of week, but for visual approximation:
        const weeks = [];
        let currentWeek = [];
        for (let i = 0; i < days.length; i++) {
            currentWeek.push(days[i]);
            if (currentWeek.length === 7 || i === days.length - 1) {
                weeks.push(currentWeek);
                currentWeek = [];
            }
        }

        return (
            <div className="flex gap-[3px]">
                {weeks.map((week, i) => (
                    <div key={i} className="flex flex-col gap-[3px]">
                        {week.map((dateStr, j) => {
                             const count = commitDates[dateStr] || 0;
                             let bg = "bg-[#161b22]";
                             if (count > 0) bg = "bg-[#0e4429]";
                             if (count > 2) bg = "bg-[#006d32]";
                             if (count > 5) bg = "bg-[#26a641]";
                             if (count > 10) bg = "bg-[#39d353]";
                             
                             return (
                                <div 
                                    key={j} 
                                    className={`w-[10px] h-[10px] rounded-[2px] ${bg} outline outline-1 outline-[#1b1f230f]`} 
                                    title={`${count} contributions on ${dateStr}`}
                                ></div>
                             );
                        })}
                    </div>
                ))}
            </div>
        )
    };

    if (!wallet.connected) {
        return (
            <div className="min-h-screen bg-[#0d1117] flex items-center justify-center text-white font-sans">
                 <div className="p-8 border border-[#30363d] bg-[#161b22] text-center rounded-md">
                     <h2 className="text-xl font-bold mb-4">Access Restricted</h2>
                     <p className="text-sm text-[#8b949e]">Connect wallet to view profile.</p>
                 </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-cyber-bg text-foreground font-cyber relative overflow-x-hidden">
            <div className="scanline"></div>
            
            {/* Header */}
            <header className="border-b border-cyber-border bg-cyber-bg/90 backdrop-blur-md sticky top-0 z-50">
               <div className="max-w-7xl mx-auto px-6 h-20 flex items-center gap-6">
                   <Link href="/" className="p-2 border border-cyber-border hover:border-neon-cyan hover:bg-neon-cyan/10 transition-all text-neon-cyan">
                       <ArrowLeft size={20} />
                   </Link>
                   <div className="flex items-center gap-3">
                       <div className="w-8 h-8 rounded-sm border border-neon-pink flex items-center justify-center bg-neon-pink/10 text-neon-pink">
                            <User size={16} />
                       </div>
                       <span className="font-tech text-lg text-white tracking-widest uppercase text-shadow-neon">
                           {wallet.publicKey?.toBase58().slice(0, 8)}...
                       </span>
                   </div>
               </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-12 relative z-10">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                    
                    {/* LEFT SIDEBAR - PROFILE INFO */}
                    <aside className="md:col-span-3 -mt-8 md:mt-0">
                        <div className="flex flex-col gap-6">
                            {/* Avatar */}
                            <div className="relative group">
                                <div className="w-full aspect-square border-2 border-neon-cyan/50 bg-black relative z-10 shadow-[0_0_20px_rgba(0,243,255,0.2)] overflow-hidden">
                                    {avatarUrl ? (
                                        <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-neon-cyan/5 text-neon-cyan">
                                            <User size={64} />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent pointer-events-none"></div>
                                    <div className="absolute bottom-2 left-2 right-2 text-center pointer-events-none">
                                        <div className="text-[10px] text-neon-cyan font-tech uppercase tracking-widest border-t border-neon-cyan/30 pt-1">
                                            IDENTITY_VERIFIED
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Names */}
                            <div className="py-2">
                                <h1 className="text-2xl font-bold text-white neon-text-pink tracking-wider font-cyber mb-1">{truncateAddr(wallet.publicKey?.toBase58() || "")}</h1>
                                <p className="text-neon-cyan/60 text-sm font-tech tracking-tight">{truncateAddr(wallet.publicKey?.toBase58() || "").toLowerCase()}</p>
                            </div>

                             {/* Bio */}
                             {!isEditing && bio && (
                                <div className="text-sm text-white/80 font-mono border-l-2 border-neon-yellow/50 pl-3 italic">
                                    "{bio}"
                                </div>
                             )}

                            {/* Edit Button */}
                            {!isEditing ? (
                                <button 
                                    onClick={() => setIsEditing(true)}
                                    className="cyber-button w-full text-center flex justify-center py-3"
                                >
                                    EDIT // PROFILE
                                </button>
                            ) : null}

                            {/* Edit Form */}
                            {isEditing ? (
                                <div className="space-y-4 p-4 border border-neon-cyan/30 bg-black/50 backdrop-blur-sm relative">
                                    <div className="absolute -top-1 -left-1 w-2 h-2 bg-neon-cyan"></div>
                                    <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-neon-cyan"></div>
                                    
                                    <h3 className="text-xs font-bold text-neon-cyan uppercase tracking-widest mb-4">Update Parameters</h3>
                                    
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-[10px] text-neon-cyan/70 uppercase block mb-1">Avatar Source</label>
                                            <input className="cyber-input w-full text-xs" 
                                                value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)} placeholder="https://..." />
                                        </div>
                                        
                                        <div>
                                            <label className="text-[10px] text-neon-cyan/70 uppercase block mb-1">Manifesto (Bio)</label>
                                            <textarea className="cyber-input w-full h-20 text-xs resize-none" 
                                                value={bio} onChange={e => setBio(e.target.value)} placeholder="System instructions..." />
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-2">
                                            <input className="cyber-input w-full text-xs" 
                                                value={twitter} onChange={e => setTwitter(e.target.value)} placeholder="Twitter" />
                                            <input className="cyber-input w-full text-xs" 
                                                value={github} onChange={e => setGithub(e.target.value)} placeholder="Github" />
                                        </div>
                                        
                                        <input className="cyber-input w-full text-xs" 
                                            value={website} onChange={e => setWebsite(e.target.value)} placeholder="Website URL" />
                                    </div>

                                    <div className="flex gap-2 pt-2">
                                        <button onClick={handleSave} className="flex-1 bg-neon-green/10 border border-neon-green text-neon-green hover:bg-neon-green/20 text-xs py-2 font-tech uppercase tracking-wider transition-all">
                                            {saving ? "UPLOADING..." : "SAVE_DATA"}
                                        </button>
                                        <button onClick={() => setIsEditing(false)} className="px-4 border border-white/20 text-white/50 hover:text-white hover:border-white text-xs py-2 font-tech uppercase tracking-wider transition-all">
                                            ABORT
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4 pt-2 font-tech text-xs">
                                     <div className="flex items-center gap-2 text-white/40">
                                         <UsersIcon size={14} className="text-neon-pink" />
                                         <span className="text-white"><span className="text-neon-pink">0</span> FOLLOWERS</span>
                                         <span>//</span>
                                         <span className="text-white"><span className="text-neon-pink">0</span> TARGETS</span>
                                     </div>

                                     <div className="space-y-2">
                                         {website && (
                                             <div className="flex items-center gap-3 group text-neon-cyan/70 hover:text-neon-cyan transition-colors">
                                                 <LinkIcon size={14} />
                                                 <a href={website} target="_blank" className="truncate hover:underline decoration-neon-cyan/50 underline-offset-4">{website.replace('https://','')}</a>
                                             </div>
                                         )}
                                         {twitter && (
                                             <div className="flex items-center gap-3 group text-neon-cyan/70 hover:text-neon-cyan transition-colors">
                                                 <Twitter size={14} />
                                                 <a href={`https://twitter.com/${twitter}`} target="_blank" className="hover:underline decoration-neon-cyan/50 underline-offset-4">@{twitter}</a>
                                             </div>
                                         )}
                                          {github && (
                                             <div className="flex items-center gap-3 group text-neon-cyan/70 hover:text-neon-cyan transition-colors">
                                                 <Github size={14} />
                                                 <a href={`https://github.com/${github}`} target="_blank" className="hover:underline decoration-neon-cyan/50 underline-offset-4">@{github}</a>
                                             </div>
                                         )}
                                     </div>
                                </div>
                            )}

                        </div>
                    </aside>

                    {/* RIGHT CONTENT - TABS & LISTS */}
                    <div className="md:col-span-9">
                         {/* Tabs */}
                        <div className="border-b border-white/10 flex gap-2 mb-8 overflow-x-auto">
                            <button 
                               onClick={() => setActiveTab('overview')}
                               className={`px-4 pb-2 border-b-2 text-sm flex items-center gap-2 font-bold uppercase tracking-wider transition-all ${activeTab === 'overview' ? 'border-neon-pink text-neon-pink shadow-[0_4px_20px_-10px_rgba(255,0,255,0.5)]' : 'border-transparent text-white/40 hover:text-white hover:border-white/40'}`}
                            >
                                <BookOpen size={16} /> Overview
                            </button>
                            <button 
                               onClick={() => setActiveTab('repos')}
                               className={`px-4 pb-2 border-b-2 text-sm flex items-center gap-2 font-bold uppercase tracking-wider transition-all ${activeTab === 'repos' ? 'border-neon-pink text-neon-pink shadow-[0_4px_20px_-10px_rgba(255,0,255,0.5)]' : 'border-transparent text-white/40 hover:text-white hover:border-white/40'}`}
                            >
                                <Book size={16} /> Nodes
                                <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px] text-white">{myRepos.length}</span>
                            </button>
                            <button 
                               onClick={() => setActiveTab('stars')}
                               className={`px-4 pb-2 border-b-2 text-sm flex items-center gap-2 font-bold uppercase tracking-wider transition-all ${activeTab === 'stars' ? 'border-neon-pink text-neon-pink shadow-[0_4px_20px_-10px_rgba(255,0,255,0.5)]' : 'border-transparent text-white/40 hover:text-white hover:border-white/40'}`}
                            >
                                <Star size={16} /> Saved
                                <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px] text-white">{starredRepos.length}</span>
                            </button>
                        </div>
                        
                        {activeTab === 'overview' && (
                            <div className="space-y-8 animate-in fade-in duration-500">
                                <div>
                                    <div className="flex items-baseline justify-between mb-4">
                                        <h2 className="text-lg font-cyber text-white uppercase tracking-widest flex items-center gap-2">
                                            <span className="w-2 h-2 bg-neon-pink animate-pulse"></span>
                                            High_Traffic_Nodes
                                        </h2>
                                        <span className="text-xs font-tech text-neon-cyan/50 hover:text-neon-cyan cursor-pointer border-b border-neon-cyan/30 border-dashed">CUSTOMIZE_VIEW</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {myRepos.slice(0, 6).map(repo => (
                                            <div key={repo.name} className="p-5 border border-white/10 bg-white/5 hover:border-neon-cyan/50 hover:bg-neon-cyan/5 transition-all group relative overflow-hidden">
                                                <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <GitBranch size={16} className="text-neon-cyan" />
                                                </div>
                                                <div className="flex justify-between items-start mb-2">
                                                    <Link href={`/repos/${repo.name}`} className="text-neon-cyan font-bold text-base hover:shadow-[0_0_10px_rgba(0,243,255,0.4)] transition-all flex items-center gap-2">
                                                        {repo.name}
                                                    </Link>
                                                    <span className="px-2 py-0.5 border border-white/20 text-[10px] text-white/50 font-tech uppercase">{repo.isPublic ? 'PUB' : 'PVT'}</span>
                                                </div>
                                                <div className="text-xs text-white/60 line-clamp-2 h-8 font-mono mb-4">
                                                    {repo.description || "NO_DATA_AVAILABLE"}
                                                </div>
                                                <div className="flex items-center gap-4 text-[10px] text-white/40 font-tech uppercase">
                                                    <span className="flex items-center gap-1.5">
                                                        <div className="w-2 h-2 bg-neon-yellow shadow-[0_0_5px_#fcee0a]"></div> TypeScript
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                        {myRepos.length === 0 && (
                                            <div className="col-span-2 text-center py-12 border border-dashed border-white/10 text-white/30 font-tech">
                                                [ NO_REPOSITORIES_DETECTED ]
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="p-1 shadow-2xl shadow-neon-green/5 border border-white/5 bg-black/40">
                                    <h2 className="text-base text-white/80 mb-4 font-tech uppercase flex items-center gap-3 p-2">
                                        <Clock size={14} className="text-neon-green" />
                                        Activity_Log // {totalCommits} OP(s)
                                    </h2>
                                    <div className="p-6 border border-white/5 bg-white/5 overflow-hidden">
                                        <div className="overflow-x-auto pb-2 flex justify-center">
                                            {renderContributionGraph()}
                                        </div>
                                        <div className="flex items-center justify-between mt-4 text-[10px] uppercase font-tech text-white/30">
                                            <a href="#" className="hover:text-neon-green transition-colors">Sync Settings</a>
                                            <div className="flex items-center gap-1">
                                                IDLE
                                                <div className="w-[10px] h-[10px] bg-white/5 border border-white/5" />
                                                <div className="w-[10px] h-[10px] bg-neon-green/20 border border-neon-green/30" />
                                                <div className="w-[10px] h-[10px] bg-neon-green/40 border border-neon-green/50" />
                                                <div className="w-[10px] h-[10px] bg-neon-green/70 border border-neon-green/80" />
                                                <div className="w-[10px] h-[10px] bg-neon-green border border-neon-green shadow-[0_0_5px_#0aff0a]" />
                                                ACTIVE
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'repos' && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                <div className="flex gap-4 pb-4 border-b border-white/10">
                                     <input 
                                        className="cyber-input flex-1 text-sm bg-black/20" 
                                        placeholder="SEARCH_NODES..." 
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                     />
                                     <div className="flex gap-2">
                                          <button className="px-4 py-1.5 border border-white/20 text-white/60 text-xs font-tech hover:bg-white/5 hover:border-white/40 transition-colors uppercase">Type</button>
                                          <button className="px-4 py-1.5 border border-white/20 text-white/60 text-xs font-tech hover:bg-white/5 hover:border-white/40 transition-colors uppercase">Lang</button>
                                          <Link href="/" className="cyber-button-primary text-xs flex items-center gap-2">
                                              <Book size={14} /> INITIALIZE_NEW
                                          </Link>
                                     </div>
                                </div>
                                {myRepos
                                    .filter(repo => repo.name.toLowerCase().includes(searchQuery.toLowerCase()))
                                    .map(repo => (
                                     <div key={repo.name} className="py-6 border-b border-white/5 last:border-0 flex justify-between items-start group">
                                         <div>
                                             <div className="flex items-center gap-3 mb-2">
                                                 <Link href={`/repos/${repo.name}`} className="text-xl font-bold text-white group-hover:text-neon-cyan transition-colors font-cyber tracking-wide">
                                                     {repo.name}
                                                 </Link>
                                                 <span className="px-2 py-0.5 border border-neon-pink/50 text-neon-pink text-[10px] font-tech uppercase bg-neon-pink/5">{repo.isPublic ? 'Public' : 'Private'}</span>
                                             </div>
                                             <div className="text-sm text-white/50 mb-4 max-w-xl font-mono">
                                                 {repo.description || "No system description available."}
                                             </div>
                                             <div className="flex items-center gap-6 text-xs text-white/30 font-tech">
                                                 <span className="flex items-center gap-2">
                                                     <div className="w-2 h-2 bg-neon-yellow shadow-[0_0_5px_#fcee0a]"></div> TypeScript
                                                 </span>
                                                 <span className="flex items-center gap-1">
                                                     <Clock size={12} />
                                                     {new Date(repo.timestamp).toLocaleDateString()}
                                                 </span>
                                             </div>
                                         </div>
                                         <div className="flex flex-col items-end gap-2 opacity-100 group-hover:opacity-100 transition-opacity">
                                              <button className="px-4 py-1 border border-white/20 hover:border-neon-yellow hover:text-neon-yellow text-white/40 text-xs font-tech uppercase transition-all flex items-center gap-2">
                                                  <Star size={12} /> STAR_NODE
                                              </button>
                                         </div>
                                     </div>
                                ))}
                            </div>
                        )}

                        {activeTab === 'stars' && (
                             <div className="space-y-4">
                                {starredRepos.length === 0 ? (
                                    <div className="text-center py-16 border border-dashed border-white/10 text-white/30 font-tech rounded-lg bg-white/5">
                                        <h3 className="text-lg font-bold text-white mb-2 uppercase tracking-widest">Memory_Empty</h3>
                                        <p className="text-xs">No starred nodes found in local storage.</p>
                                    </div>
                                ) : (
                                    starredRepos.map(repo => (
                                         <div key={repo.name} className="py-6 border-b border-white/5 last:border-0 flex justify-between items-start group">
                                             <div>
                                                 <div className="flex items-center gap-2 mb-1">
                                                     <Link href={`/repos/${repo.name}`} className="text-lg font-bold text-white group-hover:text-neon-cyan transition-colors font-mono">
                                                         <span className="text-white/40">{repo.owner.slice(0,4)}...</span> / {repo.name}
                                                     </Link>
                                                 </div>
                                                 <div className="text-sm text-white/50 mb-3 max-w-xl font-mono">
                                                     {repo.description}
                                                 </div>
                                                  <div className="text-xs text-white/30 font-tech">
                                                     <span>LAST_SYNC: {new Date(repo.timestamp).toLocaleDateString()}</span>
                                                  </div>
                                             </div>
                                             <button className="px-3 py-1 border border-neon-yellow/50 bg-neon-yellow/10 text-neon-yellow text-xs font-tech uppercase hover:bg-neon-yellow/20 transition-all flex items-center gap-2 shadow-[0_0_10px_rgba(252,238,10,0.2)]">
                                                  <Star size={12} className="fill-neon-yellow" /> UNSTAR
                                              </button>
                                         </div>
                                    ))
                                )}
                             </div>
                        )}

                    </div>
                </div>
            </main>
        </div>
    );
}

// Helper to duplicate Users icon for followers (Users import conflict)
const UsersIcon = ({size, className}: {size: number, className: string}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
);

function truncateAddr(addr: string) {
    if (!addr) return "";
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}
