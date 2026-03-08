
import { NextRequest, NextResponse } from "next/server";
import { GitChainService } from "@/services/git/git-chain-service";
import { Connection, clusterApiUrl } from "@solana/web3.js";
import { Repository, Commit, FileTree } from "@/services/git/types";

// We need a connection instance on the server side
// Note: In a real app we might use a dedicated RPC endpoint env var
const connection = new Connection(clusterApiUrl("devnet"));

// We need a read-only wallet adapter dummy since we are just reading
const dummyWallet = {
    publicKey: null,
    signTransaction: async (tx: any) => tx,
    signAllTransactions: async (txs: any[]) => txs
};

// ============================================
// SERVER-SIDE CACHING LAYER
// ============================================

// Simple LRU-like cache with TTL
interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

class ServerCache<T> {
    private cache = new Map<string, CacheEntry<T>>();
    private maxSize: number;
    private ttlMs: number;

    constructor(maxSize = 500, ttlMs = 5 * 60 * 1000) { // 5 min default TTL
        this.maxSize = maxSize;
        this.ttlMs = ttlMs;
    }

    get(key: string): T | undefined {
        const entry = this.cache.get(key);
        if (!entry) return undefined;
        
        // Check if expired
        if (Date.now() - entry.timestamp > this.ttlMs) {
            this.cache.delete(key);
            return undefined;
        }
        
        return entry.data;
    }

    set(key: string, data: T): void {
        // Evict oldest entries if at capacity
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) this.cache.delete(firstKey);
        }
        
        this.cache.set(key, { data, timestamp: Date.now() });
    }
}

// Initialize caches (these persist in Node.js memory between requests)
const reposCache = new ServerCache<Repository[]>(10, 60 * 1000); // 1 min TTL for repos
const commitsCache = new ServerCache<Commit[]>(100, 30 * 1000); // 30s TTL for commits
const treeCache = new ServerCache<FileTree>(200, 10 * 60 * 1000); // 10 min TTL for trees (immutable)
const fileCache = new ServerCache<string>(500, 10 * 60 * 1000); // 10 min TTL for files (immutable)

// ============================================

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ repo: string; path: string[] }> }
) {
    // Next.js 15+: params is now a Promise
    const { repo: repoName, path } = await context.params;
    const filePath = path.join("/");

    try {
        const gitService = new GitChainService(connection, dummyWallet);
        
        // 1. Get Repos (with caching)
        let repos = reposCache.get("all");
        if (!repos) {
            repos = await gitService.listRepos();
            reposCache.set("all", repos);
        }
        
        const repository = repos.find(r => r.name === repoName);
        
        if (!repository) {
            return new NextResponse("Repository not found", { status: 404 });
        }
        
        // 2. Get Commits (with caching)
        let logs = commitsCache.get(repoName);
        if (!logs) {
            logs = await gitService.getLog(repoName);
            commitsCache.set(repoName, logs);
        }
        
        if (logs.length === 0) {
             return new NextResponse("Repository is empty", { status: 404 });
        }
        
        const latestCommit = logs[0];
        
        // 3. Get Tree (with caching - trees are immutable!)
        let tree = treeCache.get(latestCommit.treeTxId);
        if (!tree) {
            tree = await gitService.getTree(latestCommit.treeTxId);
            treeCache.set(latestCommit.treeTxId, tree);
        }
        
        // 4. Find file
        const fileNode = tree[filePath];
        
        if (!fileNode || !fileNode.txId) {
             return new NextResponse(`File not found: ${filePath}`, { status: 404 });
        }
        
        // 5. Check public/private
        if (!repository.isPublic) {
             return new NextResponse("SolGit Pages not available for private repositories.", { status: 403 });
        }

        // 6. Get File Content (with caching - files are immutable!)
        let content = fileCache.get(fileNode.txId);
        if (!content) {
            content = await gitService.getFileContent(fileNode.txId);
            fileCache.set(fileNode.txId, content);
        }
        
        // 7. Determine MIME type
        const ext = filePath.split('.').pop()?.toLowerCase();
        let contentType = "text/plain";
        if (ext === "html") contentType = "text/html";
        else if (ext === "js") contentType = "application/javascript";
        else if (ext === "css") contentType = "text/css";
        else if (ext === "json") contentType = "application/json";
        else if (ext === "png") contentType = "image/png";
        else if (ext === "jpg" || ext === "jpeg") contentType = "image/jpeg";
        else if (ext === "gif") contentType = "image/gif";
        else if (ext === "svg") contentType = "image/svg+xml";
        else if (ext === "woff" || ext === "woff2") contentType = "font/woff2";
        else if (ext === "ico") contentType = "image/x-icon";

        return new NextResponse(content, {
            headers: {
                "Content-Type": contentType,
                // Aggressive caching - files are content-addressed (immutable)
                "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
                "X-Cache": fileCache.get(fileNode.txId) ? "HIT" : "MISS"
            }
        });

    } catch (e: any) {
        console.error(e);
        return new NextResponse("Internal Server Error: " + e.message, { status: 500 });
    }
}
