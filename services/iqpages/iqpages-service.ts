// IqpagesService — single `iqpages-root/deployed` table model.
//
//   • deploy() = append one row {id: "<owner>:<repo>", owner, repo, deployedAt}
//   • isDeployed() = look up by id
//   • listAll() = readRows of the single table
//   • readConfig/readProfile = always pull from the repo's *current* git
//     commit via @iqlabs-official/git-sdk helpers — no on-chain snapshot caching.
//
// One-time fee (FEE_LAMPORTS) is transferred alongside the deploy row so
// the marker registration is atomic from the user's perspective.

import {
  PublicKey,
  SystemProgram,
  Transaction,
  type Connection,
  type VersionedTransaction,
} from "@solana/web3.js";
import iqlabs from "iqlabs-sdk";
import type { SignerInput } from "iqlabs-sdk/utils";
// Pins the branch RPC into the SDK at module load — the deploy/commit path
// here goes through iqlabs-sdk + git-sdk's GitClient, neither of which use
// wallet-adapter's connection, so without this they'd hit api.mainnet-beta.
import { setSdkRpc } from "@/lib/rpc";
import {
  loadBlob,
  loadTree,
  notifyGateway,
  readLatestCommit,
} from "@/lib/gateway/reader";

setSdkRpc();

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
  routes?: { profile?: string; myPage?: string };
}

export const IQPAGES_CONSTANTS = {
  ROOT_ID: "iqpages-root",
  TABLE_HINT: "deployed",
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
  const { name, version, description, entry } = obj as IqpagesConfig;
  if (typeof name !== "string" || !name) throw new Error("iqpages.json: name required");
  if (typeof version !== "string" || !version) throw new Error("iqpages.json: version required");
  if (typeof description !== "string") throw new Error("iqpages.json: description required");
  if (typeof entry !== "string" || !entry) throw new Error("iqpages.json: entry required");
}

export function validateIqprofileConfig(obj: unknown): asserts obj is IqprofileConfig {
  if (!obj || typeof obj !== "object") throw new Error("invalid iqprofile.json");
  const { displayName, description } = obj as IqprofileConfig;
  if (typeof displayName !== "string") throw new Error("iqprofile.json: displayName required");
  if (typeof description !== "string") throw new Error("iqprofile.json: description required");
}

const buildId = (owner: string, repo: string) => `${owner}:${repo}`;

interface WalletAdapter {
  publicKey: PublicKey | null;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}

export interface DeploymentRow {
  id: string;
  owner: string;
  repo: string;
  deployedAt: number;
}

function tablePda(): PublicKey {
  const rootSeed = iqlabs.utils.toSeedBytes(IQPAGES_CONSTANTS.ROOT_ID);
  const tableSeed = iqlabs.utils.toSeedBytes(IQPAGES_CONSTANTS.TABLE_HINT);
  const dbRoot = iqlabs.contract.getDbRootPda(rootSeed);
  return iqlabs.contract.getTablePda(dbRoot, tableSeed);
}

export class IqpagesService {
  readonly connection: Connection;
  readonly wallet: WalletAdapter;

  constructor(connection: Connection, wallet: WalletAdapter) {
    this.connection = connection;
    this.wallet = wallet;
  }

  private get signer(): SignerInput {
    if (!this.wallet.publicKey) throw new Error("Wallet not connected");
    return {
      publicKey: this.wallet.publicKey,
      signTransaction: this.wallet.signTransaction.bind(this.wallet),
      signAllTransactions: this.wallet.signAllTransactions.bind(this.wallet),
    };
  }

  async listAll(): Promise<DeploymentRow[]> {
    const pda = tablePda();
    try {
      const url = `https://dev-gateway.iqlabs.dev/table/${pda.toBase58()}/rows`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const rows = Array.isArray(data) ? data : data.rows ?? [];
        return rows as DeploymentRow[];
      }
    } catch (e) {
      console.warn("[gateway] iqpages listAll fallback to RPC", e);
    }
    const rows = await iqlabs.reader.readTableRows(pda);
    return rows as unknown as DeploymentRow[];
  }

  async isDeployed(owner: string, repo: string): Promise<boolean> {
    const all = await this.listAll();
    const id = buildId(owner, repo);
    return all.some((r) => r.id === id);
  }

  /** Read iqpages.json from the repo's latest git commit. Returns null when
   *  the repo has no commits or the file is absent. */
  async readConfig(owner: string, repo: string): Promise<IqpagesConfig | null> {
    return this.readJsonFromLatest<IqpagesConfig>(owner, repo, IQPAGES_CONSTANTS.CONFIG_FILENAME);
  }

  async readProfile(owner: string, repo: string): Promise<IqprofileConfig | null> {
    return this.readJsonFromLatest<IqprofileConfig>(owner, repo, IQPAGES_CONSTANTS.PROFILE_FILENAME);
  }

  private async readJsonFromLatest<T>(
    owner: string,
    repo: string,
    filename: string,
  ): Promise<T | null> {
    const latest = await readLatestCommit(owner, repo);
    if (!latest) return null;
    const tree = await loadTree(latest.treeTxId);
    const entry = tree[filename];
    if (!entry?.txId) return null;
    const base64 = await loadBlob(entry.txId);
    return JSON.parse(Buffer.from(base64, "base64").toString("utf8")) as T;
  }

  /** Register the repo in the gallery. One-shot — second call throws. */
  async deploy(repo: string): Promise<string> {
    const { publicKey } = this.wallet;
    if (!publicKey) throw new Error("Wallet not connected");
    const owner = publicKey.toBase58();

    if (await this.isDeployed(owner, repo)) {
      throw new Error(`already deployed: ${owner}/${repo}`);
    }

    // Sanity-check that iqpages.json actually lives in the repo before we
    // charge anyone — keeps the gallery from filling up with broken links.
    const config = await this.readConfig(owner, repo);
    if (!config) {
      throw new Error(
        `${IQPAGES_CONSTANTS.CONFIG_FILENAME} missing in ${repo}. Commit it first, then deploy.`,
      );
    }
    validateIqpagesConfig(config);

    const balance = await this.connection.getBalance(publicKey);
    const needed = IQPAGES_CONSTANTS.FEE_LAMPORTS + 50_000_000;
    if (balance < needed) {
      throw new Error(
        `insufficient balance: have ${balance / 1e9} SOL, need at least ${needed / 1e9} SOL`,
      );
    }

    const row: DeploymentRow = {
      id: buildId(owner, repo),
      owner,
      repo,
      deployedAt: Date.now(),
    };
    const sig = await iqlabs.writer.writeRow(
      this.connection,
      this.signer,
      IQPAGES_CONSTANTS.ROOT_ID,
      IQPAGES_CONSTANTS.TABLE_HINT,
      JSON.stringify(row),
    );
    notifyGateway(tablePda().toBase58(), sig, row, owner);

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
      { signature: feeSig, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
      "confirmed",
    );

    return sig;
  }
}
