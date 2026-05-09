"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  GitCommit,
  Folder,
  FileCode,
  Clock,
  Copy,
  Edit2,
  Save,
  X,
  FilePlus,
  UploadCloud,
  Globe,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { diffLines } from "diff";
import { toast } from "sonner";
import {
  RepoPageSkeleton,
  FileTreeSkeleton,
  CodeViewerSkeleton,
  ListSkeleton,
  CommitSkeleton,
} from "@/app/components/Skeleton";
import {
  useGitClient,
  useCommits,
  useFileTree,
  useFileContent,
  useOwnerRepos,
  useInvalidateRepo,
} from "@/hooks/useGitData";
import { useIqpagesDeployed } from "@/hooks/useIqpagesData";
import type { FileTree } from "@iqlabs-official/git-sdk/browser";

const LANG_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  css: "css",
  json: "json",
  html: "html",
  rs: "rust",
  py: "python",
  go: "go",
  md: "markdown",
};
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"]);
const getExt = (filename: string) => filename.split(".").pop()?.toLowerCase() ?? "";
const getLanguage = (filename: string) => LANG_MAP[getExt(filename)] ?? "text";

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: TreeNode[];
  txId?: string;
}

function buildTree(map: FileTree): TreeNode[] {
  const root: TreeNode[] = [];
  for (const [filePath, entry] of Object.entries(map)) {
    const parts = filePath.split("/");
    let level = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      let existing = level.find((n) => n.name === part);
      if (!existing) {
        existing = {
          name: part,
          path: filePath,
          type: isFile ? "file" : "folder",
          children: isFile ? undefined : [],
          txId: isFile ? entry.txId : undefined,
        };
        level.push(existing);
      }
      if (!isFile && existing.children) level = existing.children;
    }
  }
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) =>
      a.type === b.type ? a.name.localeCompare(b.name) : a.type === "folder" ? -1 : 1,
    );
    nodes.forEach((n) => n.children && sortNodes(n.children));
  };
  sortNodes(root);
  return root;
}

function decodeBase64Text(b64: string): string {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function encodeBase64Text(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export default function RepoDetail() {
  const params = useParams();
  const ownerAddress = decodeURIComponent(
    Array.isArray(params.wallet) ? params.wallet[0] : (params.wallet as string),
  );
  const repoName = decodeURIComponent(
    Array.isArray(params.repo) ? params.repo[0] : (params.repo as string),
  );

  const client = useGitClient();
  const reposQuery = useOwnerRepos(ownerAddress);
  const repo = reposQuery.data?.find((r) => r.name === repoName) ?? null;
  const commitsQuery = useCommits(ownerAddress, repoName);
  const commits = commitsQuery.data ?? [];
  const headCommit = commits[0];
  const treeQuery = useFileTree(headCommit?.treeTxId);
  const fileTree = useMemo(() => (treeQuery.data ? buildTree(treeQuery.data) : []), [treeQuery.data]);
  const invalidateRepo = useInvalidateRepo();
  const deployedQuery = useIqpagesDeployed(ownerAddress, repoName);

  const [activeTab, setActiveTab] = useState<"code" | "commits" | "deployments">("code");

  // File viewing & editing
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const fileQuery = useFileContent(selectedTxId ?? undefined);
  const selectedContent = useMemo(
    () => (fileQuery.data ? decodeBase64Text(fileQuery.data) : null),
    [fileQuery.data],
  );

  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [showDiff, setShowDiff] = useState(false);

  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");

  const [processing, setProcessing] = useState(false);

  // Auto-select README on first tree load
  useEffect(() => {
    if (selectedPath || !treeQuery.data) return;
    const readme = Object.entries(treeQuery.data).find(
      ([p]) => p.toLowerCase() === "readme.md",
    );
    if (readme) {
      setSelectedPath(readme[0]);
      setSelectedTxId(readme[1].txId);
    }
  }, [treeQuery.data, selectedPath]);

  const handleFileClick = (node: TreeNode) => {
    if (node.type === "folder" || !node.txId) return;
    setIsEditing(false);
    setIsCreatingFile(false);
    setSelectedPath(node.path);
    setSelectedTxId(node.txId);
  };

  const startEditing = () => {
    if (!selectedPath || fileQuery.isLoading) return;
    setEditedContent(selectedContent ?? "");
    setIsEditing(true);
    setShowDiff(false);
    setCommitMessage(`Update ${selectedPath}`);
  };

  const handleCommit = async () => {
    if (!client) {
      toast.error("Wallet not connected");
      return;
    }
    if (!isEditing && !isCreatingFile) return;
    const path = isCreatingFile ? newFilePath : selectedPath;
    if (!path) return;
    if (!commitMessage) {
      toast.error("Please enter a commit message");
      return;
    }
    setProcessing(true);
    try {
      const scan: Record<string, string> = {};
      // Re-include all existing files unchanged so the new tree is a superset.
      if (treeQuery.data) {
        for (const [p, entry] of Object.entries(treeQuery.data)) {
          if (p === path) continue;
          // Pull base64 directly from the SDK cache; fetch on demand if not cached.
          // We cannot easily access cached blobs here, so we fetch via loadBlob inline.
          scan[p] = await (await import("@iqlabs-official/git-sdk/browser")).loadBlob(entry.txId);
        }
      }
      scan[path] = encodeBase64Text(editedContent);
      await client.commit(repoName, commitMessage, scan);
      invalidateRepo(ownerAddress, repoName);
      setIsEditing(false);
      setIsCreatingFile(false);
      setShowDiff(false);
      setNewFilePath("");
      if (isCreatingFile) {
        setSelectedPath(path);
        setSelectedTxId(null);
      }
      toast.success(`Committed: ${commitMessage}`);
    } catch (e) {
      console.warn("Commit failed", e);
      toast.error("Commit failed: " + (e instanceof Error ? e.message : String(e)));
      throw e;
    } finally {
      setProcessing(false);
    }
  };

  const renderTree = (nodes: TreeNode[], depth = 0) => (
    <div className="space-y-1">
      {nodes.map((node) => (
        <div key={node.path + ":" + depth}>
          <div
            onClick={() => node.type === "file" && handleFileClick(node)}
            className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-white/5 transition-colors ${
              node.type === "file" ? "text-white/80" : "text-blue-300 font-medium"
            }`}
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

  const loading = reposQuery.isLoading || commitsQuery.isLoading;
  if (loading && !repo) return <RepoPageSkeleton />;
  if (!repo) return <div className="p-10 text-white">Repository not found</div>;

  const ext = selectedPath ? getExt(selectedPath) : "";
  const isImage = IMAGE_EXTS.has(ext);

  return (
    <div className="min-h-screen bg-cyber-bg text-foreground font-sans relative overflow-x-hidden">
      <div className="scanline"></div>

      <header className="border-b border-cyber-border bg-cyber-bg/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-6">
          <Link
            href="/"
            className="p-2 border border-cyber-border hover:border-neon-cyan hover:bg-neon-cyan/10 transition-all text-neon-cyan"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-4 flex-1">
            <div className="w-10 h-10 border border-neon-pink bg-neon-pink/10 flex items-center justify-center shadow-[0_0_10px_rgba(255,0,255,0.3)]">
              <span className="font-bold text-lg text-neon-pink">
                {repo.name.substring(0, 2).toUpperCase()}
              </span>
            </div>
            <div>
              <h1 className="text-2xl font-bold font-cyber tracking-widest uppercase text-white neon-text-pink">
                {repo.name}
              </h1>
              <p className="text-xs text-neon-cyan font-mono flex items-center gap-3">
                <span className="px-1 border border-neon-cyan/50">
                  {repo.isPublic ? "PUBLIC" : "PRIVATE"}
                </span>
                <span>
                  // OWNER: {ownerAddress.slice(0, 4)}...{ownerAddress.slice(-4)}
                </span>
                {deployedQuery.data && (
                  <span className="px-2 py-0.5 border border-neon-green/60 text-neon-green bg-neon-green/10 flex items-center gap-1">
                    <Globe size={10} /> DEPLOYED
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 flex gap-1 mt-4">
          {[
            { id: "code", label: "SOURCE", icon: <FileCode size={16} /> },
            { id: "commits", label: "LOGS", icon: <GitCommit size={16} /> },
            { id: "deployments", label: "DEPLOY", icon: <Globe size={16} /> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as "code" | "commits" | "deployments")}
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
        {activeTab === "code" && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="md:col-span-3 cyber-card flex flex-col h-[600px] p-0">
              <div className="flex items-center justify-between p-3 border-b border-cyber-border bg-cyber-panel/50">
                <div className="text-xs font-bold uppercase text-neon-yellow tracking-widest font-tech">
                  FileSystem
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="file"
                    id="file-upload"
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
                      setSelectedPath(null);
                      setSelectedTxId(null);
                      e.target.value = "";
                    }}
                  />
                  <label
                    htmlFor="file-upload"
                    className="text-neon-cyan hover:text-white p-1 hover:bg-neon-cyan/20 rounded transition-colors cursor-pointer"
                    title="Upload File"
                  >
                    <UploadCloud size={16} />
                  </label>
                  <button
                    onClick={() => {
                      setIsCreatingFile(true);
                      setIsEditing(true);
                      setSelectedPath(null);
                      setSelectedTxId(null);
                      setEditedContent("");
                      setCommitMessage("Create new file");
                    }}
                    className="text-neon-cyan hover:text-white p-1 hover:bg-neon-cyan/20 rounded transition-colors"
                    title="New File"
                  >
                    <FilePlus size={16} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 font-mono text-sm">
                {treeQuery.isLoading && fileTree.length === 0 ? (
                  <FileTreeSkeleton />
                ) : commits.length === 0 && !isCreatingFile ? (
                  <div className="text-xs text-neon-pink/70 italic px-2 py-4 text-center font-tech">
                    [ EMPTY_REPOSITORY ]<br />
                    &gt; INITIATE_FIRST_COMMIT
                  </div>
                ) : (
                  renderTree(fileTree)
                )}
              </div>
            </div>

            <div className="md:col-span-9 cyber-card h-[600px] flex flex-col overflow-hidden">
              {selectedPath || isCreatingFile ? (
                <div className="flex flex-col h-full bg-[#050505]">
                  <div className="flex items-center justify-between p-3 border-b border-cyber-border bg-cyber-panel/80">
                    <div className="flex items-center gap-3 text-sm font-mono text-neon-cyan">
                      <FileCode size={16} />
                      {isCreatingFile ? (
                        <input
                          type="text"
                          value={newFilePath}
                          onChange={(e) => setNewFilePath(e.target.value)}
                          placeholder="src/program.ts"
                          className="cyber-input py-1 h-8 w-64"
                          autoFocus
                        />
                      ) : (
                        <span className="tracking-wide">{selectedPath}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {!isEditing && !isCreatingFile && (
                        <>
                          {selectedTxId && (
                            <a
                              href={`https://solscan.io/tx/${selectedTxId}?cluster=devnet`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 px-4 py-1 border border-neon-cyan text-neon-cyan hover:bg-neon-cyan/10 font-tech text-xs uppercase tracking-wider transition-colors"
                              title={`View tx ${selectedTxId} on Solscan`}
                            >
                              <ExternalLink size={14} /> SEE SOLSCAN
                            </a>
                          )}
                          {!isImage && (
                            <button
                              onClick={startEditing}
                              className="flex items-center gap-2 px-4 py-1 border border-neon-yellow text-neon-yellow hover:bg-neon-yellow/10 font-tech text-xs uppercase tracking-wider transition-colors"
                            >
                              <Edit2 size={14} /> EDIT
                            </button>
                          )}
                          <button
                            onClick={() => {
                              if (selectedContent) navigator.clipboard.writeText(selectedContent);
                            }}
                            className="p-1.5 border border-white/20 text-white/50 hover:text-white hover:border-white transition-colors"
                            title="Copy"
                          >
                            <Copy size={14} />
                          </button>
                        </>
                      )}

                      {(isEditing || isCreatingFile) && (
                        <>
                          <button
                            onClick={() => setShowDiff(!showDiff)}
                            className={`px-3 py-1 font-tech text-xs uppercase tracking-wider transition-colors border ${
                              showDiff
                                ? "bg-neon-cyan/20 border-neon-cyan text-neon-cyan"
                                : "border-white/20 text-white/50 hover:border-white hover:text-white"
                            }`}
                          >
                            {showDiff ? "Hide Diff" : "Show Diff"}
                          </button>
                          <button
                            onClick={() => {
                              setIsEditing(false);
                              setIsCreatingFile(false);
                              setShowDiff(false);
                            }}
                            className="p-1.5 border border-neon-pink text-neon-pink hover:bg-neon-pink/10 transition-colors"
                            title="Cancel"
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

                  <div className="flex-1 overflow-auto relative custom-scrollbar">
                    {fileQuery.isLoading && !isCreatingFile ? <CodeViewerSkeleton /> : null}

                    {isEditing ? (
                      <div className="flex flex-col h-full">
                        {showDiff ? (
                          <div className="flex-1 overflow-auto bg-[#0a0a0a] p-4 text-xs font-mono custom-scrollbar">
                            {diffLines(isCreatingFile ? "" : selectedContent ?? "", editedContent).map(
                              (part, i) => {
                                const color = part.added
                                  ? "text-neon-green bg-neon-green/5 border-l-2 border-neon-green pl-2"
                                  : part.removed
                                    ? "text-neon-pink bg-neon-pink/5 border-l-2 border-neon-pink pl-2"
                                    : "text-gray-500 pl-2.5";
                                return (
                                  <div key={i} className={`whitespace-pre-wrap ${color}`}>
                                    {part.value}
                                  </div>
                                );
                              },
                            )}
                          </div>
                        ) : (
                          <textarea
                            value={editedContent}
                            onChange={(e) => setEditedContent(e.target.value)}
                            className="flex-1 w-full h-full bg-[#050505] p-4 font-mono text-sm text-green-400 focus:outline-none resize-none leading-relaxed"
                            spellCheck={false}
                          />
                        )}
                        <div className="p-3 border-t border-cyber-border bg-cyber-panel">
                          <input
                            type="text"
                            value={commitMessage}
                            onChange={(e) => setCommitMessage(e.target.value)}
                            placeholder="> COMMIT_MESSAGE_REQUIRED"
                            className="w-full cyber-input text-sm"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="min-h-full bg-[#1e1e1e]">
                        {isImage && fileQuery.data ? (
                          <div className="p-8 flex items-center justify-center">
                            <img
                              src={`data:image/${ext === "svg" ? "svg+xml" : ext};base64,${fileQuery.data}`}
                              alt={selectedPath ?? ""}
                              className="max-w-full max-h-[500px]"
                            />
                          </div>
                        ) : selectedPath?.endsWith(".md") ? (
                          <div className="p-8 prose prose-invert prose-green max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {selectedContent ?? ""}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <SyntaxHighlighter
                            language={getLanguage(selectedPath ?? "")}
                            style={vscDarkPlus}
                            customStyle={{
                              margin: 0,
                              padding: "1.5rem",
                              background: "transparent",
                              fontSize: "0.9rem",
                            }}
                            showLineNumbers={true}
                            lineNumberStyle={{
                              minWidth: "3em",
                              paddingRight: "1em",
                              color: "#555",
                              textAlign: "right",
                            }}
                          >
                            {selectedContent ?? (isCreatingFile ? "" : "// NO_DATA")}
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
                  <p className="mt-4 text-neon-cyan/50 font-tech tracking-widest">
                    [ AWAITING_INPUT_SELECTION ]
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "commits" && (
          <div className="space-y-6 max-w-5xl mx-auto">
            <div className="space-y-4">
              {commitsQuery.isLoading && commits.length === 0 ? (
                <ListSkeleton count={5} ItemSkeleton={CommitSkeleton} />
              ) : commits.length === 0 ? (
                <div className="text-center py-20 text-white/30 font-tech">
                  [ NO_HISTORY_LOGGED ]
                </div>
              ) : (
                commits.map((commit) => (
                  <div
                    key={commit.id}
                    className="relative pl-8 pb-8 border-l border-neon-pink/20 last:pb-0 last:border-0"
                  >
                    <div className="absolute -left-1.5 top-0 w-3 h-3 bg-neon-pink shadow-[0_0_10px_#ff00ff]"></div>
                    <div className="cyber-card p-5 group hover:border-neon-pink transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-lg text-white group-hover:text-neon-pink transition-colors font-cyber tracking-wide">
                          {commit.message}
                        </h3>
                        <span className="font-mono text-xs px-2 py-1 border border-neon-cyan/30 text-neon-cyan/70">
                          {commit.id.slice(0, 8)}
                        </span>
                      </div>
                      <div className="flex items-center gap-6 text-sm text-white/40 font-tech">
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

        {activeTab === "deployments" && (
          <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in">
            <div className="cyber-card p-8 border-neon-pink/50 bg-black/40">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded border border-neon-pink bg-neon-pink/10 flex items-center justify-center text-neon-pink shadow-[0_0_15px_rgba(255,0,255,0.3)]">
                  <Globe size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white font-cyber tracking-wide">
                    IQ PAGES
                  </h2>
                  <p className="text-sm text-white/50 font-mono">
                    Pin a deployment so the gallery (and gateway) serves this commit
                  </p>
                </div>
                {deployedQuery.data && (
                  <span className="ml-auto px-3 py-1 border border-neon-green text-neon-green bg-neon-green/10 font-tech text-xs uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2 h-2 bg-neon-green rounded-full animate-pulse"></span>
                    DEPLOYED
                  </span>
                )}
              </div>

              {repo.isPublic ? (
                <>
                  <div className="p-4 border border-dashed border-white/20 bg-white/5 mb-6 text-sm text-white/60 font-mono">
                    {deployedQuery.data ? (
                      <p>
                        Already deployed. iqpages.json updates flow automatically — just
                        commit the file (no redeploy needed).
                      </p>
                    ) : (
                      <>
                        <p className="mb-2">
                          Deploying registers an on-chain marker (`iqpages-root` table)
                          pinning the current commit's tree to your repo name. After deploy,
                          <code className="text-neon-cyan"> /pages</code> shows the card and
                          the gateway serves the pinned files.
                        </p>
                        <ul className="list-disc pl-5 space-y-1 text-xs">
                          <li>Cost: 0.2 SOL one-time (creates the marker table).</li>
                          <li>Requires a committed <code className="text-neon-cyan">iqpages.json</code> at the repo root.</li>
                        </ul>
                      </>
                    )}
                  </div>

                  <Link
                    href={
                      deployedQuery.data
                        ? `/pages/${ownerAddress}/${repoName}`
                        : `/${ownerAddress}/${repoName}/pages-setup`
                    }
                    className="w-full py-3 cyber-button-primary text-center flex items-center justify-center gap-2 group"
                  >
                    <Globe size={16} />
                    {deployedQuery.data ? "VIEW_ON_PAGES" : "CONFIGURE_&_DEPLOY"}
                  </Link>
                </>
              ) : (
                <div className="p-4 border border-neon-pink/50 bg-neon-pink/5 text-neon-pink text-center font-tech text-sm">
                  ACCESS_DENIED: REPOSITORY IS PRIVATE.
                  <br />
                  PUBLIC VISIBILITY REQUIRED FOR HOSTING.
                </div>
              )}
            </div>

          </div>
        )}
      </main>
    </div>
  );
}

const BoxIcon = () => (
  <svg
    width="48"
    height="48"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
    <line x1="12" y1="22.08" x2="12" y2="12"></line>
  </svg>
);
