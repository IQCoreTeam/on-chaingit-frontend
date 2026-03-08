"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { GitChainService, Star as StarType } from "@/services/git/git-chain-service";
import { Repository, Commit, FileTree, Ref, Collaborator, PullRequest, Comment, Issue } from "@/services/git/types";
import { ArrowLeft, GitCommit, GitBranch, Folder, FileCode, Users, Clock, Copy, Check, FilePlus, Edit2, Save, X, GitFork, AlertCircle, Star, GitPullRequest, UploadCloud, Coins, ChevronDown, MessageSquare, Globe } from "lucide-react";
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { diffLines } from 'diff';
import { toast } from 'sonner';
import ContributionGraph from '@/app/components/ContributionGraph';
import ReactionBar from '@/app/components/ReactionBar';
import { RepoPageSkeleton, FileTreeSkeleton, CodeViewerSkeleton, ListSkeleton, CommitSkeleton, IssueSkeleton, BranchSkeleton } from '@/app/components/Skeleton';
import { usePrefetchFile } from '@/hooks/useGitData';

// Helper to determine language
const getLanguage = (filename: string) => {
    if (!filename) return 'text';
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'ts': case 'tsx': return 'typescript';
        case 'js': case 'jsx': return 'javascript';
        case 'css': return 'css';
        case 'json': return 'json';
        case 'html': return 'html';
        case 'rs': return 'rust';
        case 'py': return 'python';
        case 'go': return 'go';
        case 'md': return 'markdown';
        default: return 'text';
    }
};

// Simple types for the recursive tree
interface TreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: TreeNode[];
  txId?: string;
  size?: number; // Not stored in basic tree, but good to have
}

// Diff Viewer Component
import { Diff2HtmlUI } from 'diff2html/lib/ui/js/diff2html-ui-slim.js'; // We might simple use html string generator since Next.js hydration issues with heavy UI libs
import * as Diff from 'diff';

const DiffViewer = ({ oldText, newText, fileName }: { oldText: string, newText: string, fileName: string }) => {
    const diff = Diff.createTwoFilesPatch(fileName, fileName, oldText, newText);
    
    // We render raw html from diff2html
    const [html, setHtml] = useState("");
    
    useEffect(() => {
        // Only run on client
        import('diff2html').then(d2h => {
             const html = d2h.html(diff, {
                 drawFileList: false,
                 matching: 'lines',
                 outputFormat: 'side-by-side',
                 colorScheme: 'dark' as any
             });
             setHtml(html);
        });
    }, [diff]);

    return (
        <div className="diff-wrapper text-xs font-mono bg-[#1d1d26] rounded overflow-hidden" dangerouslySetInnerHTML={{ __html: html }} />
    );
};

export default function RepoDetail() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const params = useParams();
  const router = useRouter();
  const repoName = decodeURIComponent(Array.isArray(params.name) ? params.name[0] : params.name as string);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<"code" | "issues" | "pull_requests" | "commits" | "branches" | "settings" | "deployments">("code");
  const [repo, setRepo] = useState<Repository | null>(null);
  
  // Data States
  const [commits, setCommits] = useState<Commit[]>([]);
  const [branches, setBranches] = useState<Ref[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("main");
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [fileTree, setFileTree] = useState<TreeNode[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [stars, setStars] = useState<StarType[]>([]);
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]);
  
  // File viewing
  // File viewing & Editing
  const [selectedFile, setSelectedFile] = useState<{ path: string; content: string | null; loading: boolean } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [showDiff, setShowDiff] = useState(false);
  
  // New File
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");

  const [currentPath, setCurrentPath] = useState<string[]>([]); // Folder navigation history

  // Loading States
  const [loading, setLoading] = useState(true);
  
  // Forms
  const [newBranchName, setNewBranchName] = useState("");
  const [newCollabAddr, setNewCollabAddr] = useState("");
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [newIssueTitle, setNewIssueTitle] = useState("");
  const [newIssueBody, setNewIssueBody] = useState("");
  const [newIssueBounty, setNewIssueBounty] = useState("");
  const [isCreatingIssue, setIsCreatingIssue] = useState(false);
  const [newIssueLabels, setNewIssueLabels] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);

  // PR Form
  const [isCreatingPR, setIsCreatingPR] = useState(false);
  const [newPRTitle, setNewPRTitle] = useState("");
  const [newPRDesc, setNewPRDesc] = useState("");
  const [newPRSource, setNewPRSource] = useState("");
  const [newPRTarget, setNewPRTarget] = useState("");
  const [selectedPR, setSelectedPR] = useState<PullRequest | null>(null);

  // Reactions
  const [issueReactions, setIssueReactions] = useState<Record<string, { emoji: string; userAddress: string }[]>>({});

  // Initialize service
  const gitService = useMemo(() => new GitChainService(connection, wallet as any), [connection, wallet]);

  useEffect(() => {
     loadData();
  }, [gitService, repoName, selectedBranch]);

  const loadData = async () => {
    try {
        setLoading(true);
        // Load basic repo info
        const repos = await gitService.listRepos();
        const found = repos.find(r => r.name === repoName);
        if (!found) {
             console.error("Repo not found");
             return;
        }
        setRepo(found);

        // Load Pull Requests
        const prs = await gitService.listPullRequests(repoName);
        setPullRequests(prs);

        // Load Branches
        const refs = await gitService.listBranches(repoName);
        setBranches(refs);
        
        // Determine valid branch
        let currentRef = refs.find(r => r.refName === selectedBranch);
        if (!currentRef && refs.length > 0) {
            // If selected branch not found, try main, else first available
            const main = refs.find(r => r.refName === 'main');
            if (main) {
                // setSelectedBranch('main'); // Avoid trigger loop, just set local
                currentRef = main;
            } else {
                // setSelectedBranch(refs[0].refName);
                currentRef = refs[0];
            }
        }

        // Load Commits and Filter by Branch if possible
        const logs = await gitService.getLog(repoName);
        setCommits(logs);
        
        // Logic: specific branch view vs global log
        // Ideally we walk back from the branch tip (currentRef.commitId)
        // For now, we find the commit that matches the branch tip to get the tree.
        let targetCommit = logs[0]; // Default to latest global if no match
        
        if (currentRef) {
             const found = logs.find(c => c.id === currentRef?.commitId);
             if (found) targetCommit = found;
        }
        
        // Load Tree if commits exist
        if (targetCommit) {
            const treeMap = await gitService.getTree(targetCommit.treeTxId);
            setFileTree(buildTree(treeMap));
            // Auto-load README if nothing selected
            if (!selectedFile) {
                 const readmeEntry = Object.entries(treeMap).find(([p]) => p.toLowerCase() === 'readme.md');
                 if (readmeEntry) {
                     const [path, entry] = readmeEntry;
                     setSelectedFile({ path, content: null, loading: true });
                     const content = await gitService.getFile(entry.txId);
                     setSelectedFile({ path, content, loading: false });
                     setEditedContent(content || "");
                 }
            }
        }

        // Load Collabs
        const collabs = await gitService.getCollaborators(repoName);
        setCollaborators(collabs);

        // Load Stars
        const starList = await gitService.getStars(repoName);
        setStars(starList);

        // Load Issues
        const issueList = await gitService.getIssues(repoName);
        setIssues(issueList);

    } catch (e) {
        console.error(e);
    } finally {
        setLoading(false);
    }
  };

  const buildTree = (map: FileTree): TreeNode[] => {
      const root: TreeNode[] = [];
      
      for (const [filePath, entry] of Object.entries(map)) {
          const parts = filePath.split('/');
          let currentLevel = root;
          
          for (let i = 0; i < parts.length; i++) {
              const part = parts[i];
              const isFile = i === parts.length - 1;
              
              let existing = currentLevel.find(n => n.name === part);
              if (!existing) {
                  const node: TreeNode = {
                      name: part,
                      path: filePath, // Only accurate for file, folder path logic implies reconstruction
                      type: isFile ? "file" : "folder",
                      children: isFile ? undefined : [],
                      txId: isFile ? entry.txId : undefined
                  };
                  currentLevel.push(node);
                  existing = node;
              }
              
              if (!isFile && existing.children) {
                  currentLevel = existing.children;
              }
          }
      }
      
      // Sort: Folders first, then files
      const sortNodes = (nodes: TreeNode[]) => {
          nodes.sort((a, b) => {
              if (a.type === b.type) return a.name.localeCompare(b.name);
              return a.type === "folder" ? -1 : 1;
          });
          nodes.forEach(n => {
              if (n.children) sortNodes(n.children);
          });
      };
      
      sortNodes(root);
      return root;
  };

  const handleFileClick = async (node: TreeNode) => {
      if (node.type === "folder") return;
      
      // Stop editing
      setIsEditing(false);
      setIsCreatingFile(false);
      
      if (node.txId) {
          setSelectedFile({ path: node.path, content: null, loading: true });
          const content = await gitService.getFileContent(node.txId, repo?.name, !repo?.isPublic);
          setSelectedFile({ path: node.path, content, loading: false });
          setEditedContent(content || "");
      }
  };
  
  const startEditing = () => {
      if (!selectedFile || selectedFile.loading) return;
      setEditedContent(selectedFile.content || "");
      setIsEditing(true);
    setShowDiff(false);
    setCommitMessage(`Update ${selectedFile.path}`);
  };

  const handleCommit = async () => {
      if (!isEditing && !isCreatingFile) return;
      
      const path = isCreatingFile ? newFilePath : selectedFile?.path;
      if (!path) return;
      if (!commitMessage) {
          toast.error("Please enter a commit message");
          return;
      }
      
      try {
          setProcessing(true);
          await gitService.commit(repoName, commitMessage, [
              { path, content: editedContent }
          ], !repo?.isPublic);
          
          setIsEditing(false);
          setIsCreatingFile(false);
          setShowDiff(false);
          setNewFilePath("");
          await loadData(); // Refresh to see new commit and tree
          
          toast.success(`Committed changes: ${commitMessage}`);

          // Attempt to re-select the file we just edited/created
          if (path) {
              // We need to find the new txId. It's complex because we need the new tree.
              // But loadData() just updated `fileTree`.
              // So we can search `fileTree` for `path`.
              // Note: `fileTree` state might not be updated yet in this closure? 
              // Actually await loadData() updates state, but this render won't see it yet?
              // `loadData` is async and calls setFileTree. React state updates are scheduled.
              // So we can't sync find it here safely without an effect. 
              // BUT, for text content preservation we can just keep it open? 
              // Real 'reload' from chain needs the new hash.
              
              // Simple hack: We know the content we just saved. 
              // We can keep showing it as "clean" content until user clicks elsewhere.
              // However, `selectedFile` holds `txId`. The old txId is invalid now.
              // Let's just reset to "loading" state and trigger a lookup in a useEffect?
              // Or better, just wait for the user to navigate.
              // For now, let's try to keep the editor "open" with the content we have.
              
              setSelectedFile(prev => prev ? { ...prev, content: editedContent, loading: false } : null);
              
              // If it was a new file, we need to construct a fake selectedFile object so it renders
              if (isCreatingFile) {
                   setSelectedFile({ path: path, content: editedContent, loading: false });
              }
          }

      } catch (e: any) {
          toast.error("Commit failed: " + e.message);
      } finally {
          setProcessing(false);
      }
  };

  const handleCreateBranch = async () => {
      if (!newBranchName || commits.length === 0) return;
      try {
          setProcessing(true);
          await gitService.createBranch(repoName, newBranchName, commits[0].id);
          setNewBranchName("");
          await loadData();
          toast.success(`Branch '${newBranchName}' created`);
      } catch (e: any) {
          toast.error("Branch create failed: " + e.message);
      } finally {
          setProcessing(false);
      }
  };

  const handleAddCollab = async () => {
      if (!newCollabAddr) return;
      try {
          setProcessing(true);
          await gitService.addCollaborator(repoName, newCollabAddr);
          setNewCollabAddr("");
          await loadData();
          toast.success("Collaborator added");
      } catch (e: any) {
          toast.error("Failed to add collaborator: " + e.message);
      } finally {
          setProcessing(false);
      }
  };

  const handleFork = async () => {
      const forkName = prompt("Enter name for the new forked repository:", `${repoName}-fork`);
      if (!forkName) return;
      
      try {
          setProcessing(true);
          await gitService.forkRepo(repoName, forkName);
          toast.success(`Fork created: ${forkName}`);
          router.push(`/repos/${forkName}`);
      } catch (e: any) {
          toast.error("Fork failed: " + e.message);
      } finally {
          setProcessing(false);
      }
  };

  const handleToggleStar = async () => {
      try {
          setProcessing(true);
          await gitService.toggleStar(repoName);
          await loadData();
      } catch (e: any) {
          toast.error("Star failed: " + e.message);
      } finally {
          setProcessing(false);
      }
  };

  const handleCreateIssue = async () => {
      if (!newIssueTitle) return;
      try {
          setProcessing(true);
          await gitService.createIssue(repoName, newIssueTitle, newIssueBody, newIssueBounty ? parseFloat(newIssueBounty) : undefined, newIssueLabels);
          setNewIssueTitle("");
          setNewIssueBody("");
          setNewIssueBounty("");
          setNewIssueLabels([]);
          setIsCreatingIssue(false);
          await loadData();
          toast.success("Issue created");
      } catch (e: any) {
          toast.error("Issue failed: " + e.message);
      } finally {
          setProcessing(false);
      }
  };

  const handleTip = async () => {
       try {
           if (!repo) return;
           setProcessing(true);
           // Default tip 0.1 SOL
           await gitService.sendTip(repo.owner, 0.1); 
           toast.success("Sent 0.1 SOL tip to owner!");
       } catch (e: any) {
           console.error(e);
           const msg = e.message || e.toString();
           if (msg.includes("insufficient lamports")) {
               toast.error("Insufficient funds! You need at least 0.1 SOL to send a tip.");
           } else {
               toast.error("Tip failed: " + msg);
           }
       } finally {
           setProcessing(false);
       }
  };

  const handleMergePR = async () => {
      if (!selectedPR) return;
      try {
          setProcessing(true);
          await gitService.mergePullRequest(selectedPR);
          toast.success("Pull Request merged successfully");
          setSelectedPR(null);
          await loadData();
      } catch (e: any) {
          toast.error("Merge failed: " + e.message);
      } finally {
          setProcessing(false);
      }
  };

  const handleCreatePR = async () => {
      if (!newPRTitle || !newPRSource || !newPRTarget) return;
      try {
          setProcessing(true);
          await gitService.createPullRequest(repoName, newPRTitle, newPRDesc, newPRSource, newPRTarget);
          setNewPRTitle("");
          setNewPRDesc("");
          setNewPRSource("");
          setNewPRTarget("");
          setIsCreatingPR(false);
          await loadData();
          toast.success("Pull Request created");
      } catch (e: any) {
          toast.error("PR Creation failed: " + e.message);
      } finally {
          setProcessing(false);
      }
  };

  // Render helpers
  // Prefetch file content on hover for instant loading
  const prefetchFile = usePrefetchFile();
  
  const handlePrefetch = useCallback((node: TreeNode) => {
      if (node.type === "file" && node.txId) {
          prefetchFile(node.txId, repo?.name, !repo?.isPublic);
      }
  }, [prefetchFile, repo?.name, repo?.isPublic]);

  const renderTree = (nodes: TreeNode[], depth = 0) => {
      return (
          <div className="space-y-1">
              {nodes.map(node => (
                 <div key={node.name + depth}>
                     <div 
                        onClick={() => node.type === "file" && handleFileClick(node)}
                        onMouseEnter={() => handlePrefetch(node)}
                        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-white/5 transition-colors ${node.type === "file" ? 'text-white/80' : 'text-blue-300 font-medium'}`}
                        style={{ paddingLeft: `${depth * 1.5 + 0.5}rem` }}
                     >
                        {node.type === "folder" ? <Folder size={16} /> : <FileCode size={16} />}
                        <span className="text-sm truncate">{node.name}</span>
                     </div>
                     {node.children && renderTree(node.children, depth + 1)}
                 </div>
              ))}
          </div>
      );
  };

  if (loading && !repo) {
      return <RepoPageSkeleton />;
  }

  if (!repo) return <div className="p-10 text-white">Repository not found</div>;

  return (
    <div className="min-h-screen bg-cyber-bg text-foreground font-sans relative overflow-x-hidden">
        <div className="scanline"></div>
        
        {/* Header */}
        <header className="border-b border-cyber-border bg-cyber-bg/90 backdrop-blur-md sticky top-0 z-50">
           <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-6">
               <Link href="/" className="p-2 border border-cyber-border hover:border-neon-cyan hover:bg-neon-cyan/10 transition-all text-neon-cyan">
                   <ArrowLeft size={20} />
               </Link>
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 border border-neon-pink bg-neon-pink/10 flex items-center justify-center shadow-[0_0_10px_rgba(255,0,255,0.3)]">
                        <span className="font-bold text-lg text-neon-pink">{repo.name.substring(0,2).toUpperCase()}</span>
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold font-cyber tracking-widest uppercase text-white neon-text-pink">{repo.name}</h1>
                        <p className="text-xs text-neon-cyan font-mono flex items-center gap-3">
                             <span className="px-1 border border-neon-cyan/50">{repo.isPublic ? "PUBLIC" : "PRIVATE"}</span>
                             <span>// OWNER: {repo.owner.slice(0,4)}...{repo.owner.slice(-4)}</span>
                        </p>
                    </div>

                    <div className="ml-auto flex items-center gap-3">
                         {/* Branch Selector */}
                         <div className="relative group">
                              <button className="flex items-center gap-2 px-3 py-1 border border-white/20 text-white/80 font-tech text-xs uppercase hover:border-white transition-colors">
                                  <GitBranch size={14} />
                                  {selectedBranch}
                                  <ChevronDown size={14} />
                              </button>
                               <div className="absolute top-full right-0 mt-1 w-48 bg-[#0a0a0a] border border-white/20 hidden group-hover:block z-50">
                                   {branches.map(b => (
                                       <button 
                                          key={b.refName}
                                          onClick={() => setSelectedBranch(b.refName)}
                                          className="w-full text-left px-4 py-2 hover:bg-white/10 text-xs text-neon-cyan font-mono truncate transition-colors"
                                       >
                                           {b.refName}
                                       </button>
                                   ))}
                                   {branches.length === 0 && <div className="px-4 py-2 text-xs text-white/30 italic">No branches found</div>}
                               </div>
                         </div>
                         
                         {/* Tip Action */}
                         <button 
                             onClick={handleTip}
                             disabled={processing}
                             className="flex items-center gap-2 px-3 py-1 border border-neon-green text-neon-green hover:bg-neon-green/10 font-tech text-xs uppercase tracking-wider transition-colors disabled:opacity-50"
                             title="Send 0.1 SOL Tip"
                         >
                            <Coins size={14} /> TIP_OWNER
                         </button>

                         <button 
                            onClick={handleFork}
                            disabled={processing}
                            className="flex items-center gap-2 px-3 py-1 border border-neon-yellow text-neon-yellow hover:bg-neon-yellow/10 font-tech text-xs uppercase tracking-wider transition-colors disabled:opacity-50"
                         >
                             <GitFork size={14} /> FORK
                         </button>
                         <button 
                            onClick={handleToggleStar}
                            disabled={processing}
                            className={`flex items-center gap-2 px-3 py-1 border font-tech text-xs uppercase tracking-wider transition-colors disabled:opacity-50 ${
                                stars.some(s => s.userAddress === wallet.publicKey?.toBase58()) 
                                ? "border-neon-yellow bg-neon-yellow/20 text-neon-yellow" 
                                : "border-white/20 text-white/60 hover:border-neon-yellow hover:text-neon-yellow"
                            }`}
                         >
                             <Star size={14} className={stars.some(s => s.userAddress === wallet.publicKey?.toBase58()) ? "fill-neon-yellow" : ""} /> 
                             {stars.length} STAR{stars.length !== 1 ? 'S' : ''}
                         </button>
                    </div>
               </div>
           </div>
           
           {/* Tabs */}
           <div className="max-w-7xl mx-auto px-6 flex gap-1 mt-4">
               {[
                   { id: "code", label: "SOURCE", icon: <FileCode size={16} /> },
                   { id: "issues", label: "ISSUES", icon: <AlertCircle size={16} /> },
                   { id: "pull_requests", label: "PULL REQ", icon: <GitPullRequest size={16} /> },
                   { id: "commits", label: "LOGS", icon: <GitCommit size={16} /> },
                   { id: "branches", label: "NETWORKS", icon: <GitBranch size={16} /> },
                   { id: "deployments", label: "DEPLOY", icon: <Globe size={16} /> },
                   { id: "settings", label: "CONFIG", icon: <Users size={16} /> },
               ].map(tab => (
                   <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex items-center gap-2 px-6 py-2 text-sm font-bold font-tech uppercase tracking-widest transition-all clip-path-tab ${
                          activeTab === tab.id 
                          ? "bg-neon-cyan/20 text-neon-cyan border-t-2 border-neon-cyan shadow-[0_-5px_10px_rgba(0,243,255,0.2)]" 
                          : "text-white/40 hover:text-white hover:bg-white/5"
                      }`}
                      style={{ clipPath: "polygon(10px 0, 100% 0, 100% 100%, 0 100%, 0 10px)" }}
                   >
                       {tab.icon} {tab.label}
                   </button>
               ))}
           </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-8 relative z-10">
            
            {/* CODE TAB */}
            {activeTab === "code" && (
                <div className="space-y-4">
                    {/* Branch & Actions Bar */}
                    <div className="flex items-center justify-between">
                         <div className="flex items-center gap-2">
                             <div className="text-white/40 text-sm font-mono">BRANCH:</div>
                             <div className="relative group">
                                 <button className="flex items-center gap-2 px-3 py-1.5 border border-cyber-border bg-black/40 text-neon-cyan text-xs font-bold hover:border-neon-cyan transition-colors">
                                     <GitBranch size={14} />
                                     {selectedBranch}
                                     <ChevronDown size={14} className="opacity-50" />
                                 </button>
                                 <div className="absolute top-full left-0 mt-1 w-48 bg-cyber-panel border border-cyber-border shadow-xl z-50 hidden group-hover:block">
                                     {branches.map(b => (
                                         <button 
                                             key={b.refName}
                                             onClick={() => setSelectedBranch(b.refName)}
                                             className={`w-full text-left px-4 py-2 text-xs font-mono hover:bg-white/5 flex items-center justify-between ${selectedBranch === b.refName ? "text-neon-cyan" : "text-white/60"}`}
                                         >
                                             <span>{b.refName}</span>
                                             {b.refName === "main" && <span className="text-[8px] px-1 bg-neon-pink/20 text-neon-pink border border-neon-pink/30 rounded">LOCK</span>}
                                         </button>
                                     ))}
                                 </div>
                             </div>
                             {selectedBranch === "main" && (
                                 <span className="flex items-center gap-1 text-[10px] text-neon-pink border border-neon-pink/30 bg-neon-pink/10 px-2 py-0.5 rounded ml-2">
                                     <span className="w-1.5 h-1.5 bg-neon-pink rounded-full animate-pulse"></span>
                                     PROTECTED_BRANCH
                                 </span>
                             )}
                         </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                    {/* Sidebar / Tree */}
                    <div className="md:col-span-3 cyber-card flex flex-col h-[600px] p-0">
                        <div className="flex items-center justify-between p-3 border-b border-cyber-border bg-cyber-panel/50">
                             <div className="text-xs font-bold uppercase text-neon-yellow tracking-widest font-tech">FileSystem</div>
                             <div className="flex items-center gap-1">
                                 <input 
                                    type="file" 
                                    ref={fileInputRef}
                                    className="hidden"
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        const text = await file.text();
                                        setNewFilePath(file.name);
                                        setEditedContent(text);
                                        setCommitMessage(`Add ${file.name}`);
                                        setIsCreatingFile(true);
                                        setIsEditing(true);
                                        setSelectedFile(null);
                                        e.target.value = ''; // reset
                                    }}
                                 />
                                 <button 
                                   onClick={() => fileInputRef.current?.click()}
                                   className="text-neon-cyan hover:text-white p-1 hover:bg-neon-cyan/20 rounded transition-colors" title="Upload File"
                                 >
                                     <UploadCloud size={16} />
                                 </button>
                                 <button 
                                   onClick={() => {
                                       setIsCreatingFile(true);
                                       setIsEditing(true); 
                                       setSelectedFile(null);
                                       setEditedContent("");
                                       setCommitMessage("Create new file");
                                   }}
                                   className="text-neon-cyan hover:text-white p-1 hover:bg-neon-cyan/20 rounded transition-colors" title="New File"
                                 >
                                     <FilePlus size={16} />
                                 </button>
                             </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 font-mono text-sm">
                            {loading && fileTree.length === 0 ? (
                                <FileTreeSkeleton />
                            ) : commits.length === 0 && !isCreatingFile ? (
                                <div className="text-xs text-neon-pink/70 italic px-2 py-4 text-center font-tech">
                                    [ EMPTY_REPOSITORY ]<br/>
                                    &gt; INITIATE_FIRST_COMMIT
                                </div>
                            ) : (
                                renderTree(fileTree)
                            )}
                        </div>
                    </div>
                    
                    {/* Content View */}
                    <div className="md:col-span-9 cyber-card h-[600px] flex flex-col overflow-hidden">
                        {(selectedFile || isCreatingFile) ? (
                            <div className="flex flex-col h-full bg-[#050505]">
                                {/* Toolbar */}
                                <div className="flex items-center justify-between p-3 border-b border-cyber-border bg-cyber-panel/80">
                                    <div className="flex items-center gap-3 text-sm font-mono text-neon-cyan">
                                        <FileCode size={16} />
                                        {isCreatingFile ? (
                                            <input 
                                               type="text" 
                                               value={newFilePath}
                                               onChange={e => setNewFilePath(e.target.value)}
                                               placeholder="src/program.ts"
                                               className="cyber-input py-1 h-8 w-64"
                                               autoFocus
                                            />
                                        ) : (
                                            <span className="tracking-wide">{selectedFile?.path}</span>
                                        )}
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                        {!isEditing && !isCreatingFile && (
                                            <>
                                                <button 
                                                  onClick={startEditing}
                                                  className="flex items-center gap-2 px-4 py-1 border border-neon-yellow text-neon-yellow hover:bg-neon-yellow/10 font-tech text-xs uppercase tracking-wider transition-colors"
                                                >
                                                    <Edit2 size={14} /> EDIT
                                                </button>
                                                <button 
                                                  onClick={() => {
                                                      if (selectedFile?.content) navigator.clipboard.writeText(selectedFile.content);
                                                  }}
                                                  className="p-1.5 border border-white/20 text-white/50 hover:text-white hover:border-white transition-colors" title="Copy"
                                                >
                                                    <Copy size={14} />
                                                </button>
                                            </>
                                        )}
                                        
                                        {(isEditing || isCreatingFile) && (
                                            <>
                                                <button 
                                                    onClick={() => setShowDiff(!showDiff)}
                                                    className={`px-3 py-1 font-tech text-xs uppercase tracking-wider transition-colors border ${showDiff ? "bg-neon-cyan/20 border-neon-cyan text-neon-cyan" : "border-white/20 text-white/50 hover:border-white hover:text-white"}`}
                                                >
                                                    {showDiff ? "Hide Diff" : "Show Diff"}
                                                </button> 
                                                <button
                                                  onClick={() => {
                                                      setIsEditing(false); 
                                                      setIsCreatingFile(false);
                                                      setShowDiff(false);
                                                  }}
                                                  className="p-1.5 border border-neon-pink text-neon-pink hover:bg-neon-pink/10 transition-colors" title="Cancel"
                                                >
                                                    <X size={14} />
                                                </button>

                                                <button 
                                                  onClick={handleCommit}
                                                  disabled={processing || (isCreatingFile && !newFilePath)}
                                                  className="flex items-center gap-2 px-4 py-1 bg-neon-green/10 border border-neon-green text-neon-green hover:bg-neon-green/20 font-tech text-xs uppercase tracking-wider transition-colors disabled:opacity-50"
                                                >
                                                    {processing ? <span className="animate-spin">●</span> : <Save size={14} />} 
                                                    SAVE_CHANGES
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                                
                                {/* Content Area */}
                                <div className="flex-1 overflow-auto relative custom-scrollbar">
                                    {(selectedFile?.loading) ? (
                                        <CodeViewerSkeleton />
                                    ) : null}
                                    
                                    {isEditing ? (
                                        <div className="flex flex-col h-full">
                                            {showDiff ? (
                                                <div className="flex-1 overflow-auto bg-[#0a0a0a] p-4 text-xs font-mono custom-scrollbar">
                                                    {diffLines(
                                                        isCreatingFile ? "" : (selectedFile?.content || ""), 
                                                        editedContent
                                                    ).map((part, i) => {
                                                        const color = part.added ? 'text-neon-green bg-neon-green/5 border-l-2 border-neon-green pl-2' :
                                                                      part.removed ? 'text-neon-pink bg-neon-pink/5 border-l-2 border-neon-pink pl-2' : 
                                                                      'text-gray-500 pl-2.5';
                                                        return (
                                                            <div key={i} className={`whitespace-pre-wrap ${color}`}>
                                                                {part.value}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <textarea
                                                    value={editedContent}
                                                    onChange={e => setEditedContent(e.target.value)}
                                                    className="flex-1 w-full h-full bg-[#050505] p-4 font-mono text-sm text-green-400 focus:outline-none resize-none leading-relaxed"
                                                    spellCheck={false}
                                                />
                                            )}
                                            {/* Commit Message Input */}
                                            <div className="p-3 border-t border-cyber-border bg-cyber-panel">
                                                <input 
                                                   type="text"
                                                   value={commitMessage}
                                                   onChange={e => setCommitMessage(e.target.value)}
                                                   placeholder="> COMMIT_MESSAGE_REQUIRED"
                                                   className="w-full cyber-input text-sm"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="min-h-full bg-[#1e1e1e]">
                                            {selectedFile?.path.endsWith('.md') ? (
                                                 <div className="p-8 prose prose-invert prose-green max-w-none">
                                                     <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                         {selectedFile.content || ""}
                                                     </ReactMarkdown>
                                                 </div>
                                            ) : (
                                                 <SyntaxHighlighter 
                                                    language={getLanguage(selectedFile?.path || "")} 
                                                    style={vscDarkPlus}
                                                    customStyle={{ margin: 0, padding: '1.5rem', background: 'transparent', fontSize: '0.9rem' }}
                                                    showLineNumbers={true}
                                                    lineNumberStyle={{ minWidth: '3em', paddingRight: '1em', color: '#555', textAlign: 'right' }}
                                                 >
                                                    {selectedFile?.content || (isCreatingFile ? "" : "// NO_DATA")}
                                                 </SyntaxHighlighter>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-white/10 p-10 text-center">
                                <div className="mb-4 animate-pulse opacity-50">
                                    <BoxIcon />
                                </div>
                                <p className="mt-4 text-neon-cyan/50 font-tech tracking-widest">[ AWAITING_INPUT_SELECTION ]</p>
                            </div>
                        )}
                    </div>
                </div>
                </div>
            )}

            {/* PULL REQUESTS TAB */}
            {activeTab === "pull_requests" && (
                <div className="cyber-card p-6 min-h-[600px] flex flex-col">
                    { !isCreatingPR && !selectedPR && (
                         <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold font-cyber text-white">Pull Requests</h2>
                            <button
                               onClick={() => setIsCreatingPR(true)}
                               className="cyber-button text-xs"
                            >
                                + New Pull Request
                            </button>
                        </div>
                    )}
                    
                    {isCreatingPR ? (
                        <div className="p-4 border border-neon-cyan bg-neon-cyan/5 mb-6 animate-in slide-in-from-top-2">
                             <h3 className="text-lg font-bold text-neon-cyan mb-4 font-tech">Initiate Merge Protocol</h3>
                             <input 
                                className="w-full cyber-input mb-3 bg-black"
                                placeholder="PR Title"
                                value={newPRTitle}
                                onChange={e => setNewPRTitle(e.target.value)}
                             />
                             <textarea
                                className="w-full cyber-input h-20 mb-3"
                                placeholder="Description..."
                                value={newPRDesc}
                                onChange={e => setNewPRDesc(e.target.value)}
                             />
                             <div className="grid grid-cols-2 gap-4 mb-4">
                                 <div>
                                     <label className="text-xs text-white/50 mb-1 block">Source Branch</label>
                                     <select 
                                        className="w-full cyber-input text-white bg-black"
                                        value={newPRSource}
                                        onChange={e => setNewPRSource(e.target.value)}
                                     >
                                         <option value="">Select Source...</option>
                                         {branches.map(b => (
                                             <option key={b.refName} value={b.refName}>{b.refName}</option>
                                         ))}
                                     </select>
                                 </div>
                                 <div>
                                     <label className="text-xs text-white/50 mb-1 block">Target Branch</label>
                                     <select 
                                        className="w-full cyber-input text-white bg-black"
                                        value={newPRTarget}
                                        onChange={e => setNewPRTarget(e.target.value)}
                                     >
                                         <option value="">Select Target...</option>
                                         {branches.map(b => (
                                             <option key={b.refName} value={b.refName}>{b.refName}</option>
                                         ))}
                                     </select>
                                 </div>
                             </div>

                             <div className="flex justify-end gap-3">
                                 <button
                                    onClick={() => setIsCreatingPR(false)}
                                    className="px-4 py-2 hover:text-white text-white/50 mb-1 font-tech uppercase"
                                 >
                                     Abort
                                 </button>
                                 <button
                                    onClick={handleCreatePR}
                                    disabled={processing || !newPRTitle || !newPRSource || !newPRTarget}
                                    className="cyber-button-primary"
                                 >
                                     {processing ? "Creating..." : "Create PR"}
                                 </button>
                             </div>
                        </div>
                    ) : selectedPR ? (
                        <div className="animate-in fade-in">
                            <div className="flex items-start justify-between mb-6">
                                <div>
                                    <button onClick={() => setSelectedPR(null)} className="text-xs text-neon-cyan hover:underline mb-2 flex items-center gap-1 font-tech uppercase">
                                        <ArrowLeft size={12} /> BACK_TO_LIST
                                    </button>
                                    <h2 className="text-2xl font-bold text-white mb-2 font-cyber tracking-wide">
                                        {selectedPR.title} <span className="text-white/30 text-lg">#{selectedPR.id.slice(0,4)}</span>
                                    </h2>
                                    <div className="flex items-center gap-2 text-sm font-mono text-white/50">
                                        <span className={`px-2 py-0.5 rounded textxs font-bold uppercase ${selectedPR.status === 'open' ? 'bg-neon-green/20 text-neon-green border border-neon-green' : 'bg-neon-pink/20 text-neon-pink border border-neon-pink'}`}>
                                            {selectedPR.status}
                                        </span>
                                        <span>
                                            <span className="text-white font-bold">{selectedPR.author.slice(0,4)}...</span> wants to merge 
                                            <span className="text-neon-cyan bg-neon-cyan/10 px-1 mx-1 rounded">{selectedPR.sourceBranch}</span> 
                                            into 
                                            <span className="text-neon-cyan bg-neon-cyan/10 px-1 mx-1 rounded">{selectedPR.targetBranch}</span>
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 bg-black/30 border-l-2 border-white/20 mb-8 font-mono text-sm text-white/80">
                                {selectedPR.description || "No description provided."}
                            </div>

                            {selectedPR.status === 'open' && (
                                <div className="border border-neon-green/30 bg-neon-green/5 p-4 rounded-sm">
                                    <h4 className="text-sm font-bold text-neon-green uppercase mb-2 flex items-center gap-2">
                                        <Check size={16} /> Ready for Merge
                                    </h4>
                                    <p className="text-xs text-white/60 mb-4 font-mono">
                                        This branch has no conflicts with the base branch. merging can be performed automatically.
                                    </p>
                                    <button 
                                        onClick={handleMergePR}
                                        disabled={processing}
                                        className="bg-neon-green text-black font-bold px-6 py-2 hover:bg-neon-green/80 transition-colors uppercase font-tech tracking-wider disabled:opacity-50"
                                    >
                                        {processing ? "MERGING..." : "MERGE PULL REQUEST"}
                                    </button>
                                </div>
                            )}
                             {selectedPR.status === 'merged' && (
                                <div className="border border-neon-pink/30 bg-neon-pink/5 p-4 rounded-sm flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-neon-pink/20 flex items-center justify-center text-neon-pink">
                                        <GitPullRequest size={16} />
                                    </div>
                                    <div>
                                         <h4 className="text-sm font-bold text-white uppercase">Merged</h4>
                                         <p className="text-xs text-white/50">Pull request successfully merged into {selectedPR.targetBranch}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {pullRequests.length === 0 ? (
                                <div className="text-center py-12 border border-dashed border-white/10 text-white/40 font-mono">
                                    No active merge requests.
                                </div>
                            ) : (
                                pullRequests.map(pr => (
                                    <div 
                                        key={pr.id} 
                                        onClick={() => setSelectedPR(pr)}
                                        className="p-4 border border-cyber-border bg-cyber-panel/50 hover:border-neon-cyan/50 hover:bg-neon-cyan/5 transition-all group cursor-pointer"
                                    >
                                         <div className="flex justify-between items-start">
                                             <div className="flex gap-3">
                                                 <div className="mt-1">
                                                     <GitPullRequest className={`${pr.status === 'merged' ? 'text-neon-pink' : 'text-neon-cyan'}`} size={16} />
                                                 </div>
                                                 <div>
                                                     <h3 className="font-bold text-white group-hover:text-neon-cyan transition-colors">{pr.title}</h3>
                                                     <div className="flex items-center gap-2 text-xs font-mono text-white/50 mt-1">
                                                         <span className="text-neon-pink">{pr.sourceBranch}</span>
                                                         <span>→</span>
                                                         <span className="text-neon-green">{pr.targetBranch}</span>
                                                     </div>
                                                     <div className="flex items-center gap-3 mt-2 text-xs text-white/30 font-tech">
                                                         <span>#{pr.id.slice(0, 4)}</span>
                                                         <span>opened by {pr.author.slice(0, 4)}...{pr.author.slice(-4)}</span>
                                                         <span>{new Date(pr.timestamp).toLocaleDateString()}</span>
                                                     </div>
                                                 </div>
                                             </div>
                                             <div className={`px-2 py-1 text-[10px] uppercase font-bold border rounded-sm ${pr.status === 'merged' ? 'border-neon-pink text-neon-pink bg-neon-pink/10' : 'border-neon-green text-neon-green bg-neon-green/10'}`}>
                                                 {pr.status}
                                             </div>
                                         </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            )}
            {activeTab === "issues" && (
                <div className="cyber-card p-6 min-h-[600px] flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold font-cyber text-white">System Issues & Tickets</h2>
                        {!isCreatingIssue && (
                            <button
                               onClick={() => setIsCreatingIssue(true)}
                               className="cyber-button text-xs"
                            >
                                + New Issue
                            </button>
                        )}
                    </div>
                    
                    {isCreatingIssue ? (
                        <div className="p-4 border border-neon-pink bg-neon-pink/5 mb-6 animate-in slide-in-from-top-2">
                             <h3 className="text-lg font-bold text-neon-pink mb-4 font-tech">Create New Ticket</h3>
                             <input 
                                className="w-full cyber-input mb-3"
                                placeholder="Issue Title"
                                value={newIssueTitle}
                                onChange={e => setNewIssueTitle(e.target.value)}
                             />
                             <textarea
                                className="w-full cyber-input h-32 mb-4"
                                placeholder="Describe the issue..."
                                value={newIssueBody}
                                onChange={e => setNewIssueBody(e.target.value)}
                             />
                             <div className="flex gap-4">
                               <input 
                                  className="w-1/3 cyber-input mb-3 text-neon-yellow"
                                  placeholder="Bounty (SOL) - Optional"
                                  type="number"
                                  step="0.1"
                                  value={newIssueBounty}
                                  onChange={e => setNewIssueBounty(e.target.value)}
                               />
                             </div>
                             <div className="flex gap-2 mb-2">
                                             {['bug', 'enhancement', 'question', 'wontfix'].map(label => (
                                                 <button
                                                     key={label}
                                                     onClick={() => {
                                                         setNewIssueLabels(prev => 
                                                             prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
                                                         );
                                                     }}
                                                     className={`text-[10px] uppercase font-bold px-2 py-1 border transition-colors ${
                                                         newIssueLabels.includes(label) 
                                                         ? 'border-neon-cyan bg-neon-cyan/20 text-neon-cyan' 
                                                         : 'border-white/20 text-white/40 hover:border-white'
                                                     }`}
                                                 >
                                                     {label}
                                                 </button>
                                             ))}
                                         </div>

                                         <div className="flex gap-3 mt-4">
                                            <button 
                                                onClick={() => setIsCreatingIssue(false)}
                                                className="px-4 py-2 hover:text-white text-white/50 text-xs font-tech uppercase transition-colors"
                                            >
                                                CANCEL
                                            </button>
                                            <button 
                                                onClick={handleCreateIssue}
                                                disabled={!newIssueTitle || processing}
                                                className="flex-1 cyber-button-primary disabled:opacity-50"
                                            >
                                                {processing ? "PUBLISHING..." : "OPEN_ISSUE"}
                                            </button>
                                         </div>
                                     </div>
                            )
                    : selectedIssue ? (
                        <div className="animate-in fade-in">
                             <div className="flex items-start justify-between mb-6">
                                <div>
                                    <button onClick={() => setSelectedIssue(null)} className="text-xs text-neon-cyan hover:underline mb-2 flex items-center gap-1 font-tech uppercase">
                                        <ArrowLeft size={12} /> BACK_TO_LIST
                                    </button>
                                    <h2 className="text-2xl font-bold text-white mb-2 font-cyber tracking-wide">
                                        {selectedIssue.title} <span className="text-white/30 text-lg">#{selectedIssue.id.slice(0,4)}</span>
                                    </h2>
                                    <div className="flex items-center gap-2 text-sm font-mono text-white/50">
                                        <div className="px-2 py-0.5 rounded text-xs font-bold uppercase bg-neon-green/20 text-neon-green border border-neon-green">{selectedIssue.status}</div>
                                        <span>
                                            <span className="text-white font-bold">{selectedIssue.author.slice(0,4)}...</span> opened this issue on {new Date(selectedIssue.timestamp).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="p-6 bg-black/30 border border-white/10 mb-4 font-mono text-sm text-white/80 rounded-sm prose prose-invert max-w-none">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {selectedIssue.body}
                                </ReactMarkdown>
                            </div>

                            {/* Reactions */}
                            <div className="mb-8 p-4 bg-black/20 border border-white/5 rounded">
                                <div className="text-xs text-white/40 font-tech uppercase tracking-wider mb-3">Reactions</div>
                                <ReactionBar
                                    targetId={selectedIssue.id}
                                    targetType="issue"
                                    reactions={issueReactions[selectedIssue.id] || []}
                                    currentUser={wallet.publicKey?.toBase58()}
                                    onReact={async (emoji) => {
                                        await gitService.toggleReaction(selectedIssue.id, "issue", emoji);
                                        // Refresh reactions
                                        const reactions = await gitService.getReactions(selectedIssue.id);
                                        setIssueReactions(prev => ({ ...prev, [selectedIssue.id]: reactions }));
                                    }}
                                />
                            </div>

                            <div className="border-t border-cyber-border pt-8">
                                <h3 className="text-lg font-bold text-white mb-6 font-cyber flex items-center gap-2">
                                    <MessageSquare size={18} className="text-neon-cyan" />
                                    Discussion Protocol
                                </h3>
                                
                                <div className="space-y-6 mb-8">
                                    {comments.map(comment => (
                                        <div key={comment.id} className="flex gap-4 group">
                                            <div className="mt-1">
                                                <div className="w-8 h-8 rounded bg-neon-cyan/20 flex items-center justify-center border border-neon-cyan/50 text-neon-cyan font-bold text-xs">
                                                    {comment.author.slice(0,2)}
                                                </div>
                                            </div>
                                            <div className="flex-1">
                                                <div className="bg-cyber-panel/30 border border-cyber-border p-4 rounded-sm relative group-hover:border-neon-cyan/30 transition-colors">
                                                    <div className="flex justify-between items-center mb-2 text-xs text-white/40 font-tech">
                                                        <span className="text-neon-cyan font-bold">{comment.author.slice(0,8)}</span>
                                                        <span>{new Date(comment.timestamp).toLocaleString()}</span>
                                                    </div>
                                                    <div className="text-sm text-white/80 font-mono whitespace-pre-wrap">
                                                        {comment.body}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {comments.length === 0 && <div className="text-center text-white/30 italic text-sm py-4">No transmission logs yet.</div>}
                                </div>

                                <div className="flex gap-4">
                                     <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center border border-white/20 text-white/50 font-bold text-xs mt-1">
                                          YOU
                                     </div>
                                     <div className="flex-1">
                                         <div className="relative">
                                             <textarea
                                                value={newComment}
                                                onChange={e => setNewComment(e.target.value)}
                                                placeholder="Inject comments..."
                                                className="w-full cyber-input min-h-[100px] bg-black/50 focus:bg-black transition-colors"
                                             />
                                             <div className="absolute bottom-2 right-2">
                                                 <button 
                                                    disabled={!newComment || processing}
                                                    onClick={async () => {
                                                        if (!selectedIssue) return;
                                                        try {
                                                            setProcessing(true);
                                                            await gitService.createComment(repoName, selectedIssue.id, newComment);
                                                            setNewComment("");
                                                            // Refresh comments
                                                            const newComments = await gitService.getComments(repoName, selectedIssue.id);
                                                            setComments(newComments);
                                                            toast.success("Comment transmitted");
                                                        } catch(e) {
                                                            console.error(e);
                                                            toast.error("Transmission failed");
                                                        } finally {
                                                            setProcessing(false);
                                                        }
                                                    }}
                                                    className="cyber-button-primary text-xs py-1 px-4"
                                                 >
                                                     {processing ? "Sending..." : "Comment"}
                                                 </button>
                                             </div>
                                         </div>
                                     </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {issues.length === 0 ? (
                                <div className="text-center py-12 border border-dashed border-white/10 text-white/40 font-mono">
                                    No open issues detected in this sector.
                                </div>
                            ) : (
                               issues.map(issue => (
                                    <div 
                                        key={issue.id} 
                                        onClick={async () => {
                                            setSelectedIssue(issue);
                                            // Fetch comments
                                            const c = await gitService.getComments(repoName, issue.id);
                                            setComments(c);
                                            // Load reactions
                                            const reactions = await gitService.getReactions(issue.id);
                                            setIssueReactions(prev => ({ ...prev, [issue.id]: reactions }));
                                        }}
                                        className="p-4 border border-cyber-border bg-cyber-panel/50 hover:border-neon-pink/50 transition-colors group cursor-pointer"
                                    >
                                         <div className="flex justify-between items-start">
                                             <div className="flex gap-3">
                                                 <div className="mt-1">
                                                     <AlertCircle className="text-neon-pink" size={16} />
                                                 </div>
                                                 <div>
                                                  <div className="flex items-center gap-2">
                                                      <h3 className="font-bold text-white group-hover:text-neon-pink transition-colors">{issue.title}</h3>
                                                      {issue.bounty && issue.bounty > 0 && (
                                                          <span className={`text-[10px] font-bold px-2 py-0.5 border rounded flex items-center gap-1 ${issue.bountyStatus === 'paid' ? 'border-gray-500 text-gray-500' : 'border-neon-yellow text-neon-yellow bg-neon-yellow/10'}`}>
                                                              <Coins size={10} />
                                                              {issue.bounty} SOL {issue.bountyStatus === 'paid' ? '(PAID)' : ''}
                                                          </span>
                                                      )}
                                                      {issue.labels?.map(label => (
                                                          <span key={label} className="text-[10px] font-bold px-1.5 py-0.5 border border-white/20 text-white/60 bg-white/5 rounded">
                                                              {label}
                                                          </span>
                                                      ))}
                                                  </div>
                                                     <p className="text-sm text-white/60 line-clamp-2 mt-1 font-mono">{issue.body}</p>
                                                     <div className="flex items-center gap-3 mt-2 text-xs text-white/30 font-tech">
                                                         <span>#{issue.id.slice(0, 4)}</span>
                                                         <span>opened by {issue.author.slice(0, 4)}...{issue.author.slice(-4)}</span>
                                                         <span>{new Date(issue.timestamp).toLocaleDateString()}</span>
                                                     </div>
                                                 </div>
                                             </div>
                                             <div className="px-2 py-1 text-[10px] uppercase font-bold border border-neon-green text-neon-green bg-neon-green/10 rounded-sm">
                                                 {issue.status}
                                             </div>
                                         </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* COMMITS TAB (Existing) */}
            {activeTab === "commits" && (
                <div className="space-y-6 max-w-5xl mx-auto">
                    {/* Contribution Graph */}
                    <div className="cyber-card p-6">
                        <ContributionGraph commits={commits} />
                    </div>

                    {/* Commit List */}
                    <div className="space-y-4">
                    {loading && commits.length === 0 ? (
                        <ListSkeleton count={5} ItemSkeleton={CommitSkeleton} />
                    ) : commits.length === 0 ? (
                        <div className="text-center py-20 text-white/30 font-tech">[ NO_HISTORY_LOGGED ]</div>
                    ) : (
                        commits.map((commit, i) => (
                            <div key={commit.id} className="relative pl-8 pb-8 border-l border-neon-pink/20 last:pb-0 last:border-0">
                                <div className="absolute -left-1.5 top-0 w-3 h-3 bg-neon-pink shadow-[0_0_10px_#ff00ff]"></div>
                                <div className="cyber-card p-5 group hover:border-neon-pink transition-colors">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-bold text-lg text-white group-hover:text-neon-pink transition-colors font-cyber tracking-wide">{commit.message}</h3>
                                        <span className="font-mono text-xs px-2 py-1 border border-neon-cyan/30 text-neon-cyan/70">{commit.id.slice(0,8)}</span>
                                    </div>
                                    <div className="flex items-center gap-6 text-sm text-white/40 font-tech">
                                        <div className="flex items-center gap-2">
                                            <Users size={14} className="text-neon-yellow" />
                                            <span className="font-mono text-white/60">{commit.author.slice(0,4)}...</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Clock size={14} className="text-neon-cyan" />
                                            <span>{new Date(commit.timestamp).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                    </div>
                </div>
            )}

            {/* DEPLOYMENTS TAB */}
            {activeTab === "deployments" && (
                <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in">
                     <div className="cyber-card p-8 border-neon-cyan/50 bg-black/40">
                         <div className="flex items-center gap-4 mb-6">
                             <div className="w-12 h-12 rounded border border-neon-cyan bg-neon-cyan/10 flex items-center justify-center text-neon-cyan shadow-[0_0_15px_rgba(0,243,255,0.3)]">
                                 <Globe size={24} /> 
                             </div>
                             <div>
                                 <h2 className="text-2xl font-bold text-white font-cyber tracking-wide">SOLGIT PAGES</h2>
                                 <p className="text-sm text-white/50 font-mono">Decentralized Static Hosting for this Repository</p>
                             </div>
                         </div>

                         <div className="p-4 border border-dashed border-white/20 bg-white/5 mb-6 text-sm text-white/60 font-mono">
                             <p className="mb-2">This repository can be served directly from the blockchain.</p>
                             <ul className="list-disc pl-5 space-y-1 text-xs">
                                 <li>Files are fetched directly from the latest commit hash.</li>
                                 <li>HTML/CSS/JS are rendered by the browser.</li>
                                 <li>Only available for <strong>PUBLIC</strong> repositories.</li>
                             </ul>
                         </div>

                         {repo?.isPublic ? (
                             <div className="flex flex-col gap-4">
                                 <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-neon-green">
                                     <div className="w-2 h-2 bg-neon-green rounded-full animate-pulse"></div>
                                     Live Deployment Ready
                                 </div>
                                 <div className="flex gap-2">
                                     <a 
                                        href={`/api/raw/${repoName}/index.html`} 
                                        target="_blank"
                                        className="flex-1 py-3 cyber-button-primary text-center flex items-center justify-center gap-2 group"
                                     >
                                         <Globe size={16} /> VISIT_LIVE_SITE
                                         <span className="opacity-50 text-[10px] group-hover:opacity-100 transition-opacity">/api/raw/{repoName}/index.html</span>
                                     </a>
                                 </div>
                                 <p className="text-xs text-center text-white/30 font-tech">
                                     ENSURE 'index.html' EXISTS IN ROOT
                                 </p>
                             </div>
                         ) : (
                             <div className="p-4 border border-neon-pink/50 bg-neon-pink/5 text-neon-pink text-center font-tech text-sm">
                                 ACCESS_DENIED: REPOSITORY IS PRIVATE.
                                 <br/>
                                 PUBLIC VISIBILITY REQUIRED FOR HOSTING.
                             </div>
                         )}
                     </div>
                </div>
            )}

            {/* BRANCHES TAB */}
            {activeTab === "branches" && (
                <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
                     <div>
                         <h3 className="text-xl font-bold mb-6 flex items-center gap-2 font-cyber uppercase tracking-wider text-white">
                             <GitBranch size={20} className="text-neon-cyan" />
                             <span className="neon-text-cyan">Network_Branches</span>
                         </h3>
                         <div className="space-y-4">
                             {branches.length === 0 ? (
                                 <div className="p-6 cyber-card border-dashed text-neon-cyan/40 text-center font-tech">
                                     [ NULL_BRANCHES ]
                                 </div>
                             ) : (
                                 branches.map(br => (
                                     <div key={br.refName} className="flex items-center justify-between p-4 cyber-card hover:border-neon-cyan transition-colors group">
                                         <div className="font-bold text-white group-hover:text-neon-cyan font-mono">{br.refName}</div>
                                         <div className="text-xs font-mono text-neon-magenta/70">{br.commitId.slice(0,8)}</div>
                                     </div>
                                 ))
                             )}
                         </div>
                     </div>
                     
                     <div className="cyber-card-alt p-8 h-fit bg-gradient-to-br from-cyber-panel to-black">
                         <h3 className="text-sm font-bold mb-6 uppercase tracking-widest text-neon-pink border-b border-neon-pink/30 pb-2">Fork_Process</h3>
                         <div className="space-y-6">
                             <div className="space-y-2">
                                 <label className="text-xs font-bold text-neon-cyan uppercase tracking-widest">Branch_ID</label>
                                 <input 
                                    type="text"
                                    value={newBranchName}
                                    onChange={e => setNewBranchName(e.target.value)}
                                    placeholder="feature/upgrade-v2"
                                    className="w-full cyber-input"
                                 />
                             </div>
                             <div className="text-xs text-neon-yellow font-tech p-2 border border-neon-yellow/20 bg-neon-yellow/5">
                                 &gt; TARGET: HEAD ({commits[0]?.id.slice(0,8) || "?"})
                             </div>
                             <button
                                disabled={processing || !newBranchName || commits.length === 0}
                                onClick={handleCreateBranch}
                                className="w-full cyber-button-primary disabled:opacity-50"
                             >
                                 {processing ? "PROCESSING..." : "INITIATE_BRANCH"}
                             </button>
                         </div>
                     </div>
                </div>
            )}

            {/* SETTINGS TAB */}
            {activeTab === "settings" && (
                 <div className="max-w-4xl mx-auto space-y-8">
                      <div className="cyber-card p-8">
                           <h3 className="text-xl font-bold mb-8 flex items-center gap-3 font-cyber uppercase tracking-wider text-white border-b border-white/10 pb-4">
                               <Users size={20} className="text-neon-green" />
                               Access_Protocols
                           </h3>
                           
                           <div className="space-y-4 mb-8">
                               {collaborators.map(c => (
                                   <div key={c.userAddress} className="flex items-center justify-between p-4 bg-black/40 border border-cyber-border">
                                       <span className="font-mono text-sm text-neon-cyan">{c.userAddress}</span>
                                       <span className="text-[10px] font-bold uppercase border border-neon-green text-neon-green px-2 py-1 tracking-wider">{c.role}</span>
                                   </div>
                               ))}
                               {collaborators.length === 0 && <div className="text-white/30 text-sm font-tech text-center py-4">[ NO_EXTERNAL_ACCESS_GRANTED ]</div>}
                           </div>
                           
                           <div className="pt-6 border-t border-cyber-border">
                               <h4 className="text-sm font-bold text-neon-cyan uppercase tracking-widest mb-4">Grant_Permission</h4>
                               <div className="flex gap-4">
                                   <input 
                                        type="text"
                                        value={newCollabAddr}
                                        onChange={e => setNewCollabAddr(e.target.value)}
                                        placeholder="WALLET_ADDRESS_HASH"
                                        className="flex-1 cyber-input"
                                   />
                                   <button 
                                      onClick={handleAddCollab}
                                      disabled={processing || !newCollabAddr}
                                      className="cyber-button disabled:opacity-50"
                                   >
                                      {processing ? "UPLOADING..." : "AUTHORIZE"}
                                   </button>
                               </div>
                           </div>
                      </div>
                 </div>
            )}

        </main>
    </div>
  );
}

const BoxIcon = () => (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
        <line x1="12" y1="22.08" x2="12" y2="12"></line>
    </svg>
);
