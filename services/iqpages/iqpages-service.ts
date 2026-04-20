import { PublicKey, SystemProgram, Transaction, VersionedTransaction } from "@solana/web3.js";
import iqlabs from "iqlabs-sdk";
import type { Connection } from "@solana/web3.js";
import type { WalletAdapter } from "../git/git-chain-service";
import { GitChainService } from "../git/git-chain-service";

export interface IqpagesConfig {
  name: string;
  version: string;
  description: string;
  entry: string;
}

export interface IqprofileConfig {
  displayName: string;
  description: string;
  icon?: string;
  routes?: {
    profile?: string;
    myPage?: string;
  };
}

export const IQPAGES_CONSTANTS = {
  ROOT_ID: "iqpages-root",
  FEE_LAMPORTS: 200_000_000,
  FEE_RECIPIENT: "EWNSTD8tikwqHMcRNuuNbZrnYJUiJdKq9UXLXSEU4wZ1",
  CONFIG_FILENAME: "iqpages.json",
  PROFILE_FILENAME: "iqprofile.json",
} as const;

export const IQPAGES_TEMPLATE = `{
  "name": "my-app",
  "version": "1.0.0",
  "description": "Short description",
  "entry": "index.html"
}
`;

export const IQPROFILE_TEMPLATE = `{
  "displayName": "My App",
  "description": "Short description",
  "icon": "./icon.png",
  "routes": {
    "profile": "/?profile={walletAddress}"
  }
}
`;

export function validateIqpagesConfig(obj: unknown): asserts obj is IqpagesConfig {
  if (!obj || typeof obj !== "object") throw new Error("invalid iqpages.json");
  const { name, version, description, entry } = obj as any;
  if (typeof name !== "string" || !name) throw new Error("iqpages.json: name required");
  if (typeof version !== "string" || !version) throw new Error("iqpages.json: version required");
  if (typeof description !== "string") throw new Error("iqpages.json: description required");
  if (typeof entry !== "string" || !entry) throw new Error("iqpages.json: entry required");
}

export function validateIqprofileConfig(obj: unknown): asserts obj is IqprofileConfig {
  if (!obj || typeof obj !== "object") throw new Error("invalid iqprofile.json");
  const { displayName, description } = obj as any;
  if (typeof displayName !== "string") throw new Error("iqprofile.json: displayName required");
  if (typeof description !== "string") throw new Error("iqprofile.json: description required");
}

function buildSeed(owner: string, repoName: string): string {
  return `${owner}:${repoName}`;
}

function parseSeedFromHex(hex: string): { owner: string; repoName: string } | null {
  try {
    const plain = Buffer.from(hex, "hex").toString("utf8");
    const idx = plain.indexOf(":");
    if (idx <= 0) return null;
    return { owner: plain.slice(0, idx), repoName: plain.slice(idx + 1) };
  } catch {
    return null;
  }
}

export class IqpagesService {
  readonly connection: Connection;
  readonly wallet: WalletAdapter;
  readonly programId: PublicKey;
  private readonly git: GitChainService;

  constructor(connection: Connection, wallet: WalletAdapter) {
    this.connection = connection;
    this.wallet = wallet;
    this.programId = new PublicKey(iqlabs.contract.DEFAULT_ANCHOR_PROGRAM_ID);
    this.git = new GitChainService(connection, wallet);
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

  private tablePda(owner: string, repoName: string): PublicKey {
    const rootSeed = iqlabs.utils.toSeedBytes(IQPAGES_CONSTANTS.ROOT_ID);
    const tableSeed = iqlabs.utils.toSeedBytes(buildSeed(owner, repoName));
    const dbRoot = iqlabs.contract.getDbRootPda(rootSeed, this.programId);
    return iqlabs.contract.getTablePda(dbRoot, tableSeed, this.programId);
  }

  async isDeployed(owner: string, repoName: string): Promise<boolean> {
    const info = await this.connection.getAccountInfo(this.tablePda(owner, repoName));
    return info !== null;
  }

  async listAll(): Promise<{ owner: string; repoName: string }[]> {
    const { tableSeeds } = await iqlabs.reader.getTablelistFromRoot(
      this.connection,
      IQPAGES_CONSTANTS.ROOT_ID,
    );
    return tableSeeds
      .map((hex: string) => parseSeedFromHex(hex))
      .filter((v: { owner: string; repoName: string } | null): v is { owner: string; repoName: string } => v !== null);
  }

  /** Read a single file from the latest commit of the given repo. Returns null if missing. */
  private async readFileFromLatest(owner: string, repoName: string, filePath: string): Promise<string | null> {
    let commits;
    try {
      commits = await this.git.getLog(repoName, owner);
    } catch {
      return null;
    }
    if (!commits || commits.length === 0) return null;

    const latest = commits[0];
    const tree = await this.git.getTree(latest.treeTxId);
    const entry = tree[filePath];
    if (!entry) return null;

    return await this.git.getFile(entry.txId);
  }

  async readConfig(owner: string, repoName: string): Promise<IqpagesConfig | null> {
    const content = await this.readFileFromLatest(owner, repoName, IQPAGES_CONSTANTS.CONFIG_FILENAME);
    if (!content) return null;
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async readProfile(owner: string, repoName: string): Promise<IqprofileConfig | null> {
    const content = await this.readFileFromLatest(owner, repoName, IQPAGES_CONSTANTS.PROFILE_FILENAME);
    if (!content) return null;
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async deploy(repoName: string): Promise<string> {
    const publicKey = this.wallet.publicKey;
    if (!publicKey) throw new Error("Wallet not connected");
    const owner = publicKey.toBase58();

    // Only public repos — see the Node service for rationale.
    const repos = await this.git.listRepos(owner);
    const repo = repos.find((r) => r.name === repoName);
    if (!repo) throw new Error(`repo not found: ${owner}/${repoName}`);
    if (!repo.isPublic) {
      throw new Error(
        `repo '${repoName}' is private. Only public repos can be deployed as IQ Pages.`,
      );
    }

    const config = await this.readConfig(owner, repoName);
    if (!config) {
      throw new Error(`${IQPAGES_CONSTANTS.CONFIG_FILENAME} missing in repo '${repoName}'. Commit it first.`);
    }
    validateIqpagesConfig(config);

    const profile = await this.readProfile(owner, repoName);
    if (profile) validateIqprofileConfig(profile);

    if (await this.isDeployed(owner, repoName)) {
      throw new Error(`already deployed: ${owner}/${repoName}`);
    }

    const balance = await this.connection.getBalance(publicKey);
    const needed = IQPAGES_CONSTANTS.FEE_LAMPORTS + 50_000_000;
    if (balance < needed) {
      throw new Error(
        `insufficient balance: have ${balance / 1e9} SOL, need at least ${needed / 1e9} SOL`,
      );
    }

    // 1. Create marker table first (no fee spent on failure)
    const seed = buildSeed(owner, repoName);
    const sig = await iqlabs.writer.createTable(
      this.connection,
      this.signer as any,
      IQPAGES_CONSTANTS.ROOT_ID,
      seed,
      "iqpages",
      ["marker"],
      "marker",
      [],
      undefined,
      [SystemProgram.programId],
      seed,
    );

    // 2. Fee transfer after table creation succeeded. Wait for confirmation
    // so the caller knows the 0.2 SOL actually settled before returning —
    // otherwise a UI toast "Deployed!" could fire while the fee is still
    // floating and potentially fail (blockhash expiry, network drop, etc.).
    const transferTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: new PublicKey(IQPAGES_CONSTANTS.FEE_RECIPIENT),
        lamports: IQPAGES_CONSTANTS.FEE_LAMPORTS,
      }),
    );
    transferTx.feePayer = publicKey;
    const latest = await this.connection.getLatestBlockhash();
    transferTx.recentBlockhash = latest.blockhash;
    const signed = await this.wallet.signTransaction(transferTx);
    const feeSig = await this.connection.sendRawTransaction(signed.serialize());
    await this.connection.confirmTransaction(
      {
        signature: feeSig,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      },
      "confirmed",
    );

    return sig;
  }
}
