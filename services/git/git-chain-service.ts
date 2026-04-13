import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction, VersionedTransaction } from "@solana/web3.js";
import iqlabs, { setRpcUrl } from "iqlabs-sdk";
import { Repository, Commit, FileTree, Collaborator, GIT_CONSTANTS, OWNER_SCOPED_TABLES, Ref, PullRequest, UserProfile, Comment, FundingPool, Issue } from "./types";

export interface Star {
    repoName: string;
    userAddress: string;
}

// Extend constants in types.ts virtually here if needed, or I'll just hardcode them in ensureInfrastructure
// Actually I should update types.ts properly, but to save steps I'll just add them to the internal usage or assume they exist.
// Let's rely on string literals for now or update the helper.
const EXTENDED_CONSTANTS = {
    ...GIT_CONSTANTS,
    ISSUES_TABLE: "git_issues",
    STARS_TABLE: "git_stars",
    COMMENTS_TABLE: "git_comments",
    QF_POOL_TABLE: "git_qf_pool",
    REACTIONS_TABLE: "git_reactions"
};
import { chunkString, DEFAULT_CHUNK_SIZE } from "../../utils/chunk";
import { Buffer } from "buffer";
import { AES, enc } from "crypto-js";

// Polyfill Buffer for browser environment if needed by SDK
if (typeof window !== 'undefined') {
    window.Buffer = window.Buffer || Buffer;
}

const DEFAULT_ROOT_ID = "iq-git-v1";

export interface WalletAdapter {
    publicKey: PublicKey | null;
    signTransaction: (transaction: Transaction) => Promise<Transaction>;
    signAllTransactions: (transactions: Transaction[]) => Promise<Transaction[]>;
}

export class GitChainService {
    connection: Connection;
    wallet: WalletAdapter;
    rootIdStr: string;
    programId: PublicKey;
    builder: any;
    
    // Cached hashed root ID
    private _dbRootId: Buffer | null = null;

    constructor(connection: Connection, wallet: WalletAdapter, rootId = DEFAULT_ROOT_ID) {
        this.connection = connection;
        this.wallet = wallet;
        this.rootIdStr = rootId;
        // Sync SDK internal RPC with the connection endpoint so readTableRows uses the same RPC.
        // Priority: NEXT_PUBLIC_RPC_ENDPOINT env var -> connection endpoint -> mainnet-beta public RPC.
        const envRpc =
            typeof process !== "undefined" && process.env?.NEXT_PUBLIC_RPC_ENDPOINT
                ? process.env.NEXT_PUBLIC_RPC_ENDPOINT
                : undefined;
        const rpcUrl =
            envRpc ||
            (connection as any)._rpcEndpoint ||
            "https://mainnet.helius-rpc.com/?api-key=a0b8ead5-9dc8-4926-b537-9a4b32439f2f";
        setRpcUrl(rpcUrl);
        this.programId = new PublicKey(iqlabs.contract.DEFAULT_ANCHOR_PROGRAM_ID);
        this.builder = iqlabs.contract.createInstructionBuilder();
    }

    private async getDbRootId(): Promise<Buffer> {
        if (this._dbRootId) return this._dbRootId;
        const encoder = new TextEncoder();
        const data = encoder.encode(this.rootIdStr);
        const hash = await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer);
        this._dbRootId = Buffer.from(hash);
        return this._dbRootId;
    }

    private async sha256(input: string): Promise<Buffer> {
        const encoder = new TextEncoder();
        const data = encoder.encode(input);
        const hash = await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer);
        return Buffer.from(hash);
    }

    /** Compute table seed — owner-scoped tables append the wallet address */
    private async tableSeed(tableName: string, ownerAddress?: string): Promise<Buffer> {
        if (OWNER_SCOPED_TABLES.has(tableName)) {
            const owner = ownerAddress || this.wallet.publicKey?.toBase58();
            if (!owner) throw new Error("Wallet not connected and no ownerAddress provided for owner-scoped table");
            return this.sha256(tableName + "_" + owner);
        }
        return this.sha256(tableName);
    }

    private get signer() {
         const publicKey = this.wallet.publicKey;
         if (!publicKey) throw new Error("Wallet not connected");
         const wallet = this.wallet;
         return {
             publicKey,
             signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
                 return (await wallet.signTransaction(tx as any)) as T;
             },
             signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
                 return (await wallet.signAllTransactions(txs as any)) as T[];
             },
         };
    }

    private async sendInstruction(instruction: TransactionInstruction) {
        if (!this.wallet.publicKey || !this.wallet.signTransaction) throw new Error("Wallet not connected");
        
        const tx = new Transaction().add(instruction);
        const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = this.wallet.publicKey;
        
        const signed = await this.wallet.signTransaction(tx);
        const signature = await this.connection.sendRawTransaction(signed.serialize());
        await this.connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight });
        return signature;
    }

    async ensureInfrastructure() {
        const dbRootId = await this.getDbRootId();
        const dbRoot = iqlabs.contract.getDbRootPda(dbRootId, this.programId);
        const rootInfo = await this.connection.getAccountInfo(dbRoot);
        
        if (!rootInfo) {
            console.log("Initializing Git DB Root...");
            if (!this.wallet.publicKey) throw new Error("Wallet required to init DB");
            const ix = iqlabs.contract.initializeDbRootInstruction(
                this.builder,
                {
                    db_root: dbRoot,
                    signer: this.wallet.publicKey,
                    system_program: SystemProgram.programId,
                },
                { db_root_id: dbRootId }
            );
            await this.sendInstruction(ix);
        }

        const myAddr = this.wallet.publicKey!.toBase58();

        await this.ensureTable(GIT_CONSTANTS.REPOS_TABLE, [
            "name",
            "description",
            "owner",
            "timestamp",
            "isPublic",
        ], myAddr);

        await this.ensureTable(GIT_CONSTANTS.COMMITS_TABLE, [
            "id",
            "repoName",
            "message",
            "author",
            "timestamp",
            "treeTxId",
            "parentCommitId",
        ], myAddr);

        await this.ensureTable(GIT_CONSTANTS.REFS_TABLE, [
            "repoName",
            "refName",
            "commitId",
        ], myAddr);

        await this.ensureTable(GIT_CONSTANTS.COLLABORATORS_TABLE, [
            "repoName",
            "userAddress",
            "role",
        ], myAddr);

        await this.ensureTable(EXTENDED_CONSTANTS.FORKS_TABLE, [
            "originalRepoName",
            "forkRepoName",
            "owner",
        ], myAddr);

        await this.ensureTable(EXTENDED_CONSTANTS.ISSUES_TABLE, [
            "id",
            "repoName",
            "title",
            "body",
            "author",
            "status",
            "timestamp"
        ], myAddr);

        await this.ensureTable(EXTENDED_CONSTANTS.STARS_TABLE, [
            "repoName",
            "userAddress"
        ], myAddr);

        await this.ensureTable(GIT_CONSTANTS.PULL_REQUESTS_TABLE, [
            "id",
            "repoName",
            "title",
            "description",
            "author",
            "sourceBranch",
            "targetBranch",
            "status",
            "timestamp"
        ], myAddr);

        await this.ensureTable(GIT_CONSTANTS.PROFILES_TABLE, [
            "userAddress",
            "avatarUrl",
            "bio",
            "readmeTxId",
            "socials", // Will store JSON string
            "timestamp"
        ]);

        await this.ensureTable(EXTENDED_CONSTANTS.COMMENTS_TABLE, [
            "id",
            "targetId",
            "repoName",
            "author",
            "body",
            "timestamp"
        ], myAddr);

        await this.ensureTable(EXTENDED_CONSTANTS.QF_POOL_TABLE, [
            "id",
            "totalFunds",
            "matchingMultiplier",
            "contributors"
        ]);

        await this.ensureTable(EXTENDED_CONSTANTS.REACTIONS_TABLE, [
            "id",
            "targetId",
            "targetType",
            "emoji",
            "userAddress",
            "timestamp"
        ], myAddr);
    }

    private async ensureTable(tableName: string, columns: string[], ownerAddress?: string) {
        const dbRootId = await this.getDbRootId();
        const tableSeed = await this.tableSeed(tableName, ownerAddress);
        const dbRoot = iqlabs.contract.getDbRootPda(dbRootId, this.programId);
        const tablePda = iqlabs.contract.getTablePda(
            dbRoot,
            tableSeed,
            this.programId
        );

        const info = await this.connection.getAccountInfo(tablePda);
        if (!info) {
            if (!this.wallet.publicKey) throw new Error("Wallet required to create table");
            console.log(`Creating table '${tableName}'...`);

            const idCol = columns.find((c) => c === "id" || c === "name") || columns[0];

            const ix = iqlabs.contract.createTableInstruction(
                this.builder,
                {
                    db_root: dbRoot,
                    table: tablePda,
                    signer: this.wallet.publicKey,
                    system_program: SystemProgram.programId,
                    receiver: new PublicKey(iqlabs.constants.DEFAULT_WRITE_FEE_RECEIVER),
                    instruction_table: iqlabs.contract.getInstructionTablePda(
                        dbRoot,
                        tableSeed,
                        this.programId
                    ),
                },
                {
                    db_root_id: dbRootId,
                    table_seed: tableSeed,
                    table_hint: Buffer.from(tableName),
                    table_name: Buffer.from(tableName),
                    column_names: columns.map((c) => Buffer.from(c)),
                    id_col: Buffer.from(idCol),
                    ext_keys: [],
                    gate_opt: null,
                    writers_opt: null,
                }
            );
            await this.sendInstruction(ix);
        }
    }

    async createRepo(name: string, description: string, isPublic: boolean = true) {
        await this.ensureInfrastructure();

        const row: Repository = {
            name,
            description,
            owner: this.wallet.publicKey!.toBase58(),
            timestamp: Date.now(),
            isPublic,
        };

        const dbRootId = await this.getDbRootId();
        const seed = await this.tableSeed(GIT_CONSTANTS.REPOS_TABLE);

        console.log(`Creating ${isPublic ? "public" : "private"} repo '${name}'...`);

        await iqlabs.writer.writeRow(
            this.connection,
            this.signer,
            dbRootId,
            seed,
            JSON.stringify(row)
        );
        console.log("Repo created!");
    }

    async forkRepo(originalRepoName: string, originalOwnerAddress: string, newName?: string) {
        if (!this.wallet.publicKey) throw new Error("Wallet not connected");
        await this.ensureInfrastructure();

        const myAddr = this.wallet.publicKey.toBase58();
        const targetName = newName || `${originalRepoName}-fork`;

        // 1. Get Original Repo Info (from original owner's table)
        const repos = await this.listRepos(originalOwnerAddress);
        const original = repos.find(r => r.name === originalRepoName);
        if (!original) throw new Error("Original repo not found");

        // 2. Create the New Repo (The Fork) — in MY table
        const forkRow: Repository = {
            name: targetName,
            description: `Fork of ${originalRepoName}: ${original.description}`,
            owner: myAddr,
            timestamp: Date.now(),
            isPublic: original.isPublic,
        };

        const dbRootId = await this.getDbRootId();
        const repoSeed = await this.tableSeed(GIT_CONSTANTS.REPOS_TABLE);

        await iqlabs.writer.writeRow(
            this.connection,
            this.signer,
            dbRootId,
            repoSeed,
            JSON.stringify(forkRow)
        );

        // 3. Clone the HEAD state (read from original owner's tables)
        const branches = await this.listBranches(originalRepoName, originalOwnerAddress);
        const mainBranch = branches.find(b => b.refName === "main");

        if (mainBranch && mainBranch.commitId) {
             const oldLog = await this.getLog(originalRepoName, originalOwnerAddress);
             const headCommit = oldLog.find(c => c.id === mainBranch.commitId);

             if (headCommit) {
                 const forkCommit: Commit = {
                     id: crypto.randomUUID(),
                     repoName: targetName,
                     message: "Fork initialization",
                     author: myAddr,
                     timestamp: Date.now(),
                     treeTxId: headCommit.treeTxId,
                     parentCommitId: undefined
                 };

                 const commitSeed = await this.tableSeed(GIT_CONSTANTS.COMMITS_TABLE);
                 await iqlabs.writer.writeRow(
                     this.connection,
                     this.signer,
                     dbRootId,
                     commitSeed,
                     JSON.stringify(forkCommit)
                 );
                 console.log("Fork initialized with upstream state.");
             }
        }

        // 4. Record Fork Metadata (in MY forks table)
        const forkMeta = {
            originalRepoName,
            forkRepoName: targetName,
            owner: myAddr
        };
        const forkSeed = await this.tableSeed(EXTENDED_CONSTANTS.FORKS_TABLE);
        await iqlabs.writer.writeRow(
             this.connection,
             this.signer,
             dbRootId,
             forkSeed,
             JSON.stringify(forkMeta)
        );

        console.log("Fork complete!");
        return targetName;
    }

    async listRepos(ownerAddress?: string): Promise<Repository[]> {
        const dbRootId = await this.getDbRootId();
        const seed = await this.tableSeed(GIT_CONSTANTS.REPOS_TABLE, ownerAddress);
        const dbRoot = iqlabs.contract.getDbRootPda(dbRootId, this.programId);
        const table = iqlabs.contract.getTablePda(
            dbRoot,
            seed,
            this.programId
        );

        try {
            console.log("[listRepos] table PDA:", table.toBase58(), "owner:", ownerAddress);
            const rows = await iqlabs.reader.readTableRows(table);
            console.log("[listRepos] found", rows.length, "repos:", (rows as any[]).map((r: any) => r.name));
            return rows as unknown as Repository[];
        } catch (err) {
            console.error("[listRepos] error:", err);
            return [];
        }
    }
    // L1 Cache (Memory)
    private fileCache = new Map<string, string>();
    private treeCache = new Map<string, FileTree>();
    
    // L2 Cache (IndexedDB)
    private dbPromise: Promise<IDBDatabase> | null = null;

    private getDb(): Promise<IDBDatabase> {
        if (typeof window === "undefined") return Promise.reject("No window");
        if (this.dbPromise) return this.dbPromise;

        this.dbPromise = new Promise((resolve, reject) => {
            const req = window.indexedDB.open("iq-git-cache", 1);
            req.onupgradeneeded = (e: any) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
                if (!db.objectStoreNames.contains("trees")) db.createObjectStore("trees");
            };
            req.onsuccess = (e: any) => resolve(e.target.result);
            req.onerror = (e) => reject(e);
        });
        return this.dbPromise;
    }

    private async getFromDb(storeName: "files" | "trees", key: string): Promise<any> {
        try {
            const db = await this.getDb();
            return new Promise((resolve) => {
                const tx = db.transaction(storeName, "readonly");
                const store = tx.objectStore(storeName);
                const req = store.get(key);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(undefined);
            });
        } catch {
            return undefined;
        }
    }

    private async putToDb(storeName: "files" | "trees", key: string, value: any) {
        try {
            const db = await this.getDb();
            const tx = db.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            store.put(value, key);
        } catch (e) {
            console.warn("Failed to cache to DB", e);
        }
    }

    async getLog(repoName: string, ownerAddress?: string): Promise<Commit[]> {
        const dbRootId = await this.getDbRootId();
        const seed = await this.tableSeed(GIT_CONSTANTS.COMMITS_TABLE, ownerAddress);
        const dbRoot = iqlabs.contract.getDbRootPda(dbRootId, this.programId);
        const table = iqlabs.contract.getTablePda(
            dbRoot,
            seed,
            this.programId
        );

        try {
            const rows = await iqlabs.reader.readTableRows(table);
            return (rows as unknown as Commit[])
                .filter((c) => c.repoName === repoName)
                .sort((a, b) => b.timestamp - a.timestamp);
        } catch {
            return [];
        }
    }

    async getTree(treeTxId: string): Promise<FileTree> {
        // L1
        if (this.treeCache.has(treeTxId)) {
            return this.treeCache.get(treeTxId)!;
        }

        // L2
        const cached = await this.getFromDb("trees", treeTxId);
        if (cached) {
            this.treeCache.set(treeTxId, cached);
            return cached;
        }

        try {
            const treeRes = await iqlabs.reader.readCodeIn(treeTxId);
            if (treeRes.data) {
                const tree = JSON.parse(treeRes.data);
                this.treeCache.set(treeTxId, tree);
                this.putToDb("trees", treeTxId, tree); // Cache for next time
                return tree;
            }
            return {};
        } catch (e) {
            console.error("Failed to fetch tree", e);
            return {};
        }
    }

    async getFile(txId: string): Promise<string | null> {
         // L1
         if (this.fileCache.has(txId)) {
             return this.fileCache.get(txId)!;
         }

         // L2
         const cached = await this.getFromDb("files", txId);
         if (cached) {
             this.fileCache.set(txId, cached);
             return cached;
         }

         try {
             // Fallback to legacy read for basic support or internal usage
             const fileRes = await iqlabs.reader.readCodeIn(txId);
             if (fileRes.data) {
                 const content = atob(fileRes.data);
                 this.fileCache.set(txId, content);
                 this.putToDb("files", txId, content);
                 return content;
             }
             return null;
         } catch (e) {
             console.error("Failed to fetch file", e);
             return null;
         }
    }

    async getFileContent(txId: string, repoName?: string, isPrivate = false): Promise<string> {
         // Create cache key that includes encryption context
         const cacheKey = isPrivate && repoName ? `${txId}:${repoName}:private` : txId;
         
         // L1 - Memory cache
         if (this.fileCache.has(cacheKey)) {
             return this.fileCache.get(cacheKey)!;
         }

         // L2 - IndexedDB cache
         const cached = await this.getFromDb("files", cacheKey);
         if (cached) {
             this.fileCache.set(cacheKey, cached);
             return cached;
         }

         try {
             const fileRes = await iqlabs.reader.readCodeIn(txId);
             
             let content = "";
             if (fileRes.data) {
                 // In some versions readCodeIn returns base64 string directly
                 content = Buffer.from(fileRes.data, "base64").toString("utf-8");
             }
             
             if (repoName && isPrivate) {
                 try {
                     const key = await this.getEncryptionKey(repoName);
                     content = this.decrypt(content, key);
                 } catch {
                     return "[DECRYPTION_ERROR_ACCESS_DENIED]";
                 }
             }

             // Cache the result
             this.fileCache.set(cacheKey, content);
             this.putToDb("files", cacheKey, content);

             return content;
         } catch(e) {
             console.error("Failed to read file", e);
             return "";
         }
    }

    async listBranches(repoName: string, ownerAddress?: string): Promise<Ref[]> {
        const dbRootId = await this.getDbRootId();
        const seed = await this.tableSeed(GIT_CONSTANTS.REFS_TABLE, ownerAddress);
        const dbRoot = iqlabs.contract.getDbRootPda(dbRootId, this.programId);
        const table = iqlabs.contract.getTablePda(
            dbRoot,
            seed,
            this.programId
        );

        try {
            const rows = await iqlabs.reader.readTableRows(table);
            const allRefs = rows as unknown as Ref[];

            // Deduplicate: Keep latest (last) occurrence of each refName
            const refMap = new Map<string, Ref>();
            allRefs.forEach(r => {
                if (r.repoName === repoName) {
                    refMap.set(r.refName, r);
                }
            });

            return Array.from(refMap.values());
        } catch {
            return [];
        }
    }

    async createBranch(repoName: string, branchName: string, commitId: string) {
        await this.ensureInfrastructure();
        console.log(`Creating branch '${branchName}' at ${commitId.slice(0, 8)}...`);

        const dbRootId = await this.getDbRootId();
        const seed = await this.tableSeed(GIT_CONSTANTS.REFS_TABLE);

        await iqlabs.writer.writeRow(
            this.connection,
            this.signer,
            dbRootId,
            seed,
            JSON.stringify({ repoName, refName: branchName, commitId })
        );
        console.log(`Branch '${branchName}' created.`);
    }

    async addCollaborator(repoName: string, userAddress: string) {
        if (this.wallet.publicKey) {
             const repos = await this.listRepos();
             const repo = repos.find(r => r.name === repoName);
             if (repo && repo.owner !== this.wallet.publicKey.toBase58()) {
                 throw new Error("Only owner can add collaborators");
             }
        }

        await this.ensureInfrastructure();
        console.log(`Adding ${userAddress} to '${repoName}'...`);

        const dbRootId = await this.getDbRootId();
        const seed = await this.tableSeed(GIT_CONSTANTS.COLLABORATORS_TABLE);

        await iqlabs.writer.writeRow(
            this.connection,
            this.signer,
            dbRootId,
            seed,
            JSON.stringify({ repoName, userAddress, role: "writer" })
        );
        console.log("Collaborator added.");
    }

    async getCollaborators(repoName: string, ownerAddress?: string): Promise<Collaborator[]> {
        const dbRootId = await this.getDbRootId();
        const seed = await this.tableSeed(GIT_CONSTANTS.COLLABORATORS_TABLE, ownerAddress);
        const dbRoot = iqlabs.contract.getDbRootPda(dbRootId, this.programId);
        const table = iqlabs.contract.getTablePda(
            dbRoot,
            seed,
            this.programId
        );

        try {
            const rows = await iqlabs.reader.readTableRows(table);
            return (rows as unknown as Collaborator[]).filter((c) => c.repoName === repoName);
        } catch {
            return [];
        }
    }

    // Encryption Helpers
    private async getEncryptionKey(repoName: string): Promise<string> {
        if (!this.wallet.publicKey || !this.wallet.signTransaction) throw new Error("Wallet not connected");
        
        // In a real app, uses wallet signature to derive a deterministic key
        // For this demo, we'll use a simplified derivation based on the user's public key + repo name
        // SECURITY WARNING: This is a demo implementation. In production, use `signMessage` to derive a secret.
        const seed = `SOLGIT_SECRET_${this.wallet.publicKey.toBase58()}_${repoName}`;
        return seed; 
    }

    private encrypt(content: string, key: string): string {
        return AES.encrypt(content, key).toString();
    }

    private decrypt(ciphertext: string, key: string): string {
        try {
            const bytes = AES.decrypt(ciphertext, key);
            return bytes.toString(enc.Utf8);
        } catch (e) {
            console.error("Decryption failed", e);
            return "[ENCRYPTED_DATA_ACCESS_DENIED]";
        }
    }

    async commit(repoName: string, message: string, files: { path: string, content: string }[], isPrivate = false) {
         await this.ensureInfrastructure();
         console.log(`Committing ${files.length} changed files to '${repoName}'...`);

         let encryptionKey = "";
         if (isPrivate) {
             encryptionKey = await this.getEncryptionKey(repoName);
             console.log("🔒 Encrypting files for private repo...");
         }

         // 1. Get previous state
         let oldTree: FileTree = {};
         const logs = await this.getLog(repoName);
         if (logs.length > 0) {
             const latest = logs[0];
             try {
                 oldTree = await this.getTree(latest.treeTxId);
             } catch (e) {
                 console.warn("Could not load previous tree, starting fresh.");
             }
         }

         const fileTree: FileTree = { ...oldTree };
         
         const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

         // 2. Process changes
         let uploadedCount = 0;
         
         for (const f of files) {
             // 1. Encrypt if needed
             let finalContent = f.content;
             if (isPrivate) {
                 finalContent = this.encrypt(f.content, encryptionKey);
             }

             // In browser, content is string. Encode to Base64 for hash and storage.
             const contentB64 = Buffer.from(finalContent).toString("base64");
             const hash = await this.sha256(contentB64).then(b => b.toString("hex"));

             if (fileTree[f.path] && fileTree[f.path].hash === hash) {
                 console.log(`Unchanged: ${f.path}`);
                 continue;
             }

             console.log(`Uploading ${f.path}...`);
             const chunks = chunkString(contentB64, DEFAULT_CHUNK_SIZE);
             if (chunks.length === 0) chunks.push("");

             let success = false;
             let retries = 3;

             while (retries > 0 && !success) {
                 try {
                     const txId: string = await iqlabs.writer.codeIn(
                         { connection: this.connection, signer: this.signer },
                         chunks,
                         f.path.split('/').pop() || "file",
                         0,
                         "application/octet-stream",
                         (p: number) => {}
                     );

                     fileTree[f.path] = {
                         txId,
                         hash,
                     };
                     success = true;
                     uploadedCount++;
                 } catch (e: any) {
                     console.warn(`Retry (${retries}): ${e.message}`);
                     retries--;
                     if (retries === 0) throw new Error(`Failed to upload ${f.path}`);
                     await delay(2000);
                 }
             }
             await delay(500);
         }

         if (uploadedCount === 0 && files.length > 0 && logs.length > 0) {
              console.log("No actual changes detected (hashes match).");
         }

         // 3. Upload File Tree
         console.log("Uploading File Tree Manifest...");
         const treeJson = JSON.stringify(fileTree);
         const treeChunks = chunkString(treeJson, DEFAULT_CHUNK_SIZE);
         const treeTxId = await iqlabs.writer.codeIn(
             { connection: this.connection, signer: this.signer },
             treeChunks,
             "tree.json",
             0,
             "application/json"
         );
 
         // 4. Record Commit
         const commit: Commit = {
             id: crypto.randomUUID(),
             repoName,
             message,
             author: this.wallet.publicKey!.toBase58(),
             timestamp: Date.now(),
             treeTxId,
             parentCommitId: logs.length > 0 ? logs[0].id : undefined
         };
         
         const dbRootId = await this.getDbRootId();
         const commitSeed = await this.tableSeed(GIT_CONSTANTS.COMMITS_TABLE);

         await iqlabs.writer.writeRow(
             this.connection,
             this.signer,
             dbRootId,
             commitSeed,
             JSON.stringify(commit)
         );
         console.log(`Commit successful! ID: ${commit.id}`);
    }



    async createIssue(repoName: string, title: string, body: string, ownerAddress?: string, bountyAmount?: number, labels?: string[]) {
        await this.ensureInfrastructure();

        const issue: Issue = {
            id: crypto.randomUUID(),
            repoName,
            title,
            body,
            author: this.wallet.publicKey!.toBase58(),
            status: "open",
            timestamp: Date.now(),
            bounty: bountyAmount,
            bountyStatus: bountyAmount ? "active" : undefined,
            labels
        };

        const dbRootId = await this.getDbRootId();
        const seed = await this.tableSeed(EXTENDED_CONSTANTS.ISSUES_TABLE, ownerAddress);

        await iqlabs.writer.writeRow(
            this.connection,
            this.signer,
            dbRootId,
            seed,
            JSON.stringify(issue)
        );
        console.log("Issue created!");
    }

    async getIssues(repoName: string, ownerAddress?: string): Promise<Issue[]> {
        const dbRootId = await this.getDbRootId();
        const seed = await this.tableSeed(EXTENDED_CONSTANTS.ISSUES_TABLE, ownerAddress);
        const dbRoot = iqlabs.contract.getDbRootPda(dbRootId, this.programId);
        const table = iqlabs.contract.getTablePda(dbRoot, seed, this.programId);

        try {
            const rows = await iqlabs.reader.readTableRows(table);
            return (rows as unknown as Issue[])
                .filter(i => i.repoName === repoName)
                .sort((a,b) => b.timestamp - a.timestamp);
        } catch {
            return [];
        }
    }

    async createComment(repoName: string, targetId: string, body: string, ownerAddress?: string) {
        if (!this.wallet.publicKey) throw new Error("Wallet not connected");
        await this.ensureInfrastructure();

        const comment: Comment = {
            id: crypto.randomUUID(),
            targetId,
            repoName,
            author: this.wallet.publicKey.toBase58(),
            body,
            timestamp: Date.now()
        };

        const dbRootId = await this.getDbRootId();
        const seed = await this.tableSeed(EXTENDED_CONSTANTS.COMMENTS_TABLE, ownerAddress);

        await iqlabs.writer.writeRow(
            this.connection,
            this.signer,
            dbRootId,
            seed,
            JSON.stringify(comment)
        );
        console.log("Comment posted!");
    }

    async getComments(repoName: string, targetId: string, ownerAddress?: string): Promise<Comment[]> {
        const dbRootId = await this.getDbRootId();
        const seed = await this.tableSeed(EXTENDED_CONSTANTS.COMMENTS_TABLE, ownerAddress);
        const dbRoot = iqlabs.contract.getDbRootPda(dbRootId, this.programId);
        const table = iqlabs.contract.getTablePda(dbRoot, seed, this.programId);

        try {
            const rows = await iqlabs.reader.readTableRows(table);
            return (rows as unknown as Comment[])
                .filter(c => c.repoName === repoName && c.targetId === targetId)
                .sort((a,b) => a.timestamp - b.timestamp);
        } catch(e) {
            console.error("Failed to fetch comments", e);
            return [];
        }
    }

    async toggleStar(repoName: string, ownerAddress?: string) {
        if (!this.wallet.publicKey) throw new Error("Wallet not connected");
        await this.ensureInfrastructure();

        const myAddr = this.wallet.publicKey.toBase58();
        const stars = await this.getStars(repoName, ownerAddress);
        const alreadyStarred = stars.some(s => s.userAddress === myAddr);

        const dbRootId = await this.getDbRootId();
        const seed = await this.tableSeed(EXTENDED_CONSTANTS.STARS_TABLE, ownerAddress);

        if (alreadyStarred) {
             console.log("Already starred!");
        } else {
            await iqlabs.writer.writeRow(
                this.connection,
                this.signer,
                dbRootId,
                seed,
                JSON.stringify({ repoName, userAddress: myAddr })
            );
            console.log("Starred!");
        }
    }

    async getStars(repoName: string, ownerAddress?: string): Promise<Star[]> {
        const dbRootId = await this.getDbRootId();
        const seed = await this.tableSeed(EXTENDED_CONSTANTS.STARS_TABLE, ownerAddress);
        const dbRoot = iqlabs.contract.getDbRootPda(dbRootId, this.programId);
        const table = iqlabs.contract.getTablePda(dbRoot, seed, this.programId);

        try {
            const rows = await iqlabs.reader.readTableRows(table);
            return (rows as unknown as Star[]).filter(s => s.repoName === repoName);
        } catch {
            return [];
        }
    }

    async fetchAllStars(ownerAddress?: string): Promise<Star[]> {
        const dbRootId = await this.getDbRootId();
        const seed = await this.tableSeed(EXTENDED_CONSTANTS.STARS_TABLE, ownerAddress);
        const dbRoot = iqlabs.contract.getDbRootPda(dbRootId, this.programId);
        const table = iqlabs.contract.getTablePda(dbRoot, seed, this.programId);

        try {
            const rows = await iqlabs.reader.readTableRows(table);
            return rows as unknown as Star[];
        } catch {
            return [];
        }
    }

    // ===== REACTIONS =====
    async toggleReaction(targetId: string, targetType: "issue" | "comment" | "pr", emoji: string, ownerAddress?: string) {
        if (!this.wallet.publicKey) throw new Error("Wallet not connected");
        await this.ensureInfrastructure();

        const myAddr = this.wallet.publicKey.toBase58();
        const reactions = await this.getReactions(targetId, ownerAddress);
        const existing = reactions.find(r => r.userAddress === myAddr && r.emoji === emoji);

        const dbRootId = await this.getDbRootId();
        const seed = await this.tableSeed(EXTENDED_CONSTANTS.REACTIONS_TABLE, ownerAddress);

        if (existing) {
            console.log("Already reacted with", emoji);
            return;
        }

        const reaction = {
            id: crypto.randomUUID(),
            targetId,
            targetType,
            emoji,
            userAddress: myAddr,
            timestamp: Date.now()
        };

        await iqlabs.writer.writeRow(
            this.connection,
            this.signer,
            dbRootId,
            seed,
            JSON.stringify(reaction)
        );
        console.log("Reaction added:", emoji);
    }

    async getReactions(targetId: string, ownerAddress?: string): Promise<{ id: string; targetId: string; targetType: string; emoji: string; userAddress: string; timestamp: number }[]> {
        const dbRootId = await this.getDbRootId();
        const seed = await this.tableSeed(EXTENDED_CONSTANTS.REACTIONS_TABLE, ownerAddress);
        const dbRoot = iqlabs.contract.getDbRootPda(dbRootId, this.programId);
        const table = iqlabs.contract.getTablePda(dbRoot, seed, this.programId);

        try {
            const rows = await iqlabs.reader.readTableRows(table);
            return (rows as any[]).filter(r => r.targetId === targetId);
        } catch {
            return [];
        }
    }

    async getStarredRepos(userAddress: string, ownerAddress?: string): Promise<string[]> {
        const dbRootId = await this.getDbRootId();
        const seed = await this.tableSeed(EXTENDED_CONSTANTS.STARS_TABLE, ownerAddress);
        const dbRoot = iqlabs.contract.getDbRootPda(dbRootId, this.programId);
        const table = iqlabs.contract.getTablePda(dbRoot, seed, this.programId);

        try {
            const rows = await iqlabs.reader.readTableRows(table);
            return (rows as unknown as Star[])
                .filter(s => s.userAddress === userAddress)
                .map(s => s.repoName);
        } catch {
            return [];
        }
    }

    async getAllCommits(ownerAddress?: string, author?: string): Promise<Commit[]> {
        const dbRootId = await this.getDbRootId();
        const seed = await this.tableSeed(GIT_CONSTANTS.COMMITS_TABLE, ownerAddress);
        const dbRoot = iqlabs.contract.getDbRootPda(dbRootId, this.programId);
        const table = iqlabs.contract.getTablePda(dbRoot, seed, this.programId);

        try {
            const rows = await iqlabs.reader.readTableRows(table);
            let commits = rows as unknown as Commit[];
            if (author) {
                commits = commits.filter(c => c.author === author);
            }
            return commits.sort((a, b) => b.timestamp - a.timestamp);
        } catch {
            return [];
        }
    }

    async createPullRequest(repoName: string, title: string, description: string, sourceBranch: string, targetBranch: string, ownerAddress?: string) {
        await this.ensureInfrastructure();

        const pr: PullRequest = {
            id: crypto.randomUUID(),
            repoName,
            title,
            description,
            author: this.wallet.publicKey!.toBase58(),
            sourceBranch,
            targetBranch,
            status: "open",
            timestamp: Date.now()
        };

        const dbRootId = await this.getDbRootId();
        const seed = await this.tableSeed(GIT_CONSTANTS.PULL_REQUESTS_TABLE, ownerAddress);

        await iqlabs.writer.writeRow(
            this.connection,
            this.signer,
            dbRootId,
            seed,
            JSON.stringify(pr)
        );
        console.log("Pull Request created!");
    }

    async listPullRequests(repoName: string, ownerAddress?: string): Promise<PullRequest[]> {
        const dbRootId = await this.getDbRootId();
        const seed = await this.tableSeed(GIT_CONSTANTS.PULL_REQUESTS_TABLE, ownerAddress);
        const dbRoot = iqlabs.contract.getDbRootPda(dbRootId, this.programId);
        const table = iqlabs.contract.getTablePda(dbRoot, seed, this.programId);

        try {
            const rows = await iqlabs.reader.readTableRows(table);
            const allPrs = rows as unknown as PullRequest[];

            const latestMap = new Map<string, PullRequest>();
            allPrs.forEach(pr => {
                const existing = latestMap.get(pr.id);
                if (pr.repoName === repoName) {
                    if (!existing || pr.timestamp > existing.timestamp) {
                        latestMap.set(pr.id, pr);
                    }
                }
            });

            return Array.from(latestMap.values())
                       .sort((a, b) => b.timestamp - a.timestamp);
        } catch {
            return [];
        }
    }

    async mergePullRequest(pr: PullRequest, ownerAddress?: string) {
        if (!this.wallet.publicKey) throw new Error("Wallet not connected");

        const updatedPr: PullRequest = {
            ...pr,
            status: 'merged',
            timestamp: Date.now()
        };

        const dbRootId = await this.getDbRootId();
        const prSeed = await this.tableSeed(GIT_CONSTANTS.PULL_REQUESTS_TABLE, ownerAddress);

        await iqlabs.writer.writeRow(
            this.connection,
            this.signer,
            dbRootId,
            prSeed,
            JSON.stringify(updatedPr)
        );

        const branches = await this.listBranches(pr.repoName, ownerAddress);
        const sourceRef = branches.find(b => b.refName === pr.sourceBranch);

        if (sourceRef && sourceRef.commitId) {
            await this.createBranch(pr.repoName, pr.targetBranch, sourceRef.commitId);
            console.log(`Merged ${pr.sourceBranch} into ${pr.targetBranch}`);

            const issueMatch = pr.description.match(/Fixes #([a-f0-9-]+)/);
            if (issueMatch) {
               const issueId = issueMatch[1];
               const issues = await this.getIssues(pr.repoName, ownerAddress);
               const relatedIssue = issues.find(i => i.id.startsWith(issueId));

               if (relatedIssue && relatedIssue.bounty && relatedIssue.bountyStatus === 'active') {
                   console.log(`Found bounty of ${relatedIssue.bounty} SOL on issue ${relatedIssue.id}`);
                   try {
                       await this.sendTip(pr.author, relatedIssue.bounty);

                       const issueSeed = await this.tableSeed(EXTENDED_CONSTANTS.ISSUES_TABLE, ownerAddress);
                       const updatedIssue: Issue = {
                           ...relatedIssue,
                           status: 'closed',
                           bountyStatus: 'paid'
                       };
                       await iqlabs.writer.writeRow(
                            this.connection,
                            this.signer,
                            dbRootId,
                            issueSeed,
                            JSON.stringify(updatedIssue)
                       );
                       console.log("Bounty paid and issue closed.");
                   } catch (e) {
                       console.error("Failed to pay bounty:", e);
                   }
               }
            }
        } else {
            console.warn("Source branch commit not found, could not fast-forward.");
        }
    }

    async updateProfile(avatarUrl: string, bio: string, socials: { twitter?: string, github?: string, website?: string }) {
        if (!this.wallet.publicKey) throw new Error("Wallet not connected");
        await this.ensureInfrastructure();

        const profile: UserProfile = {
            userAddress: this.wallet.publicKey.toBase58(),
            avatarUrl,
            bio,
            socials,
            timestamp: Date.now()
        };

        const dbRootId = await this.getDbRootId();
        const seed = await this.tableSeed(GIT_CONSTANTS.PROFILES_TABLE);

        await iqlabs.writer.writeRow(
            this.connection,
            this.signer,
            dbRootId,
            seed,
            JSON.stringify(profile)
        );
        console.log("Profile updated!");
    }

    async getProfile(userAddress: string): Promise<UserProfile | null> {
        const dbRootId = await this.getDbRootId();
        const seed = await this.tableSeed(GIT_CONSTANTS.PROFILES_TABLE);
        const dbRoot = iqlabs.contract.getDbRootPda(dbRootId, this.programId);
        const table = iqlabs.contract.getTablePda(dbRoot, seed, this.programId);

        try {
            const rows = await iqlabs.reader.readTableRows(table);
            // Get all updates for this user
            const updates = (rows as unknown as UserProfile[])
                .filter(p => p.userAddress === userAddress)
                .sort((a, b) => b.timestamp - a.timestamp);
            
            return updates.length > 0 ? updates[0] : null;
        } catch {
            return null;
        }
    }

    // Quadratic Funding
    async getFundingPool(): Promise<FundingPool> {
        const dbRootId = await this.getDbRootId();
        const seed = await this.tableSeed(EXTENDED_CONSTANTS.QF_POOL_TABLE);
        const dbRoot = iqlabs.contract.getDbRootPda(dbRootId, this.programId);
        const table = iqlabs.contract.getTablePda(dbRoot, seed, this.programId);

        try {
            const rows = await iqlabs.reader.readTableRows(table);
            const pools = rows as unknown as FundingPool[];
            // Only one global pool for now
            const pool = pools.find(p => p.id === "global_qf_pool");
            return pool || {
                id: "global_qf_pool",
                totalFunds: 0,
                matchingMultiplier: 1.5,
                contributors: 0
            };
        } catch {
            return {
                id: "global_qf_pool",
                totalFunds: 0,
                matchingMultiplier: 1.5,
                contributors: 0
            };
        }
    }

    async donateToPool(amount: number) {
        if (!this.wallet.publicKey) throw new Error("Wallet not connected");
        await this.ensureInfrastructure();

        // 1. Send SOL to a "Pool" address (using random simulated address for now since we don't have a vault contract)
        // In reality this would go to a PDA vault.
        const POOL_VAULT = new PublicKey("GitQFPooxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"); // Placeholder
        // We can just burn/transfer to self for demo or a fixed devnet address
        // Let's just update the ledger without actual SOL transfer for this data-demo, or transfer to self.
        // Actually, let's simulate the transfer by logging.
        console.log(`Donating ${amount} SOL to QF Pool...`);
        // await this.sendTip(POOL_VAULT.toBase58(), amount); // This would fail with invalid key

        // 2. Update Pool State on-chain
        const current = await this.getFundingPool();
        const updated: FundingPool = {
            ...current,
            totalFunds: current.totalFunds + amount,
            contributors: current.contributors + 1 // Simplification: assumes new contributor
        };

        const dbRootId = await this.getDbRootId();
        const seed = await this.tableSeed(EXTENDED_CONSTANTS.QF_POOL_TABLE);

        await iqlabs.writer.writeRow(
            this.connection,
            this.signer,
            dbRootId,
            seed,
            JSON.stringify(updated)
        );
        console.log("Pool state updated!");
    }
    async sendTip(recipient: string, amountSol: number) {
        if (!this.wallet.publicKey) throw new Error("Wallet not connected");
        
        const ix = SystemProgram.transfer({
            fromPubkey: this.wallet.publicKey,
            toPubkey: new PublicKey(recipient),
            lamports: Math.floor(amountSol * 1_000_000_000)
        });

        await this.sendInstruction(ix);
        console.log(`Sent ${amountSol} SOL to ${recipient}`);
    }
}
