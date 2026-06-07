// IqpagesService — thin wrapper over the git-sdk pages layer.
//
// All on-chain logic (deploy marker row, fee transfer, deploy-marker lookup,
// reading iqpages.json/iqprofile.json from the repo's latest commit) lives in
// `@iqlabs-official/git-sdk`'s pages layer as of 0.1.15, so the CLI and this
// frontend share ONE implementation. This file only:
//   • adapts the wallet-adapter shape to the SDK's chain-neutral GitSigner,
//   • points the SDK reader/gateway at this app's configured network,
//   • keeps the UI-only bits (templates + validators) the setup page imports.
//
// The deploy fee, table layout, and root id are all defined SDK-side now —
// see the git-sdk pages layer / core/seed for the source of truth. The pages
// layer is chain-neutral: deploy works on Solana and EVM, with the fee charged
// in the active chain's native currency by the SDK. Reads route to the active
// network the providers selected via setNetwork().

import { setRpcUrl } from "iqlabs-sdk";
import {
  setGatewayUrls,
  deployPages,
  isPagesDeployed,
  listPagesDeployments,
  readPagesConfig,
  readPagesProfile,
  type PagesConfig,
  type PagesDeployment,
  type PagesProfile,
  type GitSigner,
} from "@iqlabs-official/git-sdk/browser";
import {
  PublicKey,
  Transaction,
  type Connection,
  type VersionedTransaction,
} from "@solana/web3.js";
import { NETWORK } from "@/lib/network";

// Re-export the SDK config/profile shapes under the names the components used
// before the consolidation, so imports don't churn.
export type IqpagesConfig = PagesConfig;
export type IqprofileConfig = PagesProfile;
export type DeploymentRow = PagesDeployment;

// Filenames the setup page references when staging the config blobs.
export const IQPAGES_CONSTANTS = {
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

interface WalletAdapter {
  publicKey: PublicKey | null;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}

export class IqpagesService {
  readonly connection: Connection;
  readonly wallet: WalletAdapter;

  constructor(connection: Connection, wallet: WalletAdapter) {
    this.connection = connection;
    this.wallet = wallet;
    // The SDK reader resolves a process-global RPC and infers its gateway from
    // it. Pin both to this app's network so reads hit the same endpoints the
    // rest of the UI uses (mirrors what GitClient does in its constructor).
    setRpcUrl(connection.rpcEndpoint);
    setGatewayUrls(NETWORK.gateways);
  }

  // The connected Solana wallet, shaped as the SDK's chain-neutral GitSigner.
  // (This frontend's pages UI is Solana today; the SDK's pages layer is
  // chain-neutral, so deploy() works unchanged if an EVM signer is supplied.)
  private get signer(): GitSigner {
    if (!this.wallet.publicKey) throw new Error("Wallet not connected");
    return {
      publicKey: this.wallet.publicKey,
      signTransaction: this.wallet.signTransaction.bind(this.wallet),
      signAllTransactions: this.wallet.signAllTransactions.bind(this.wallet),
    };
  }

  listAll(): Promise<DeploymentRow[]> {
    return listPagesDeployments();
  }

  isDeployed(owner: string, repo: string): Promise<boolean> {
    return isPagesDeployed(owner, repo);
  }

  readConfig(owner: string, repo: string): Promise<IqpagesConfig | null> {
    return readPagesConfig(owner, repo);
  }

  readProfile(owner: string, repo: string): Promise<IqprofileConfig | null> {
    return readPagesProfile(owner, repo);
  }

  /** Register the repo in the gallery. One-shot — second call throws. Returns
   *  the marker-row signature. Chain-neutral: deployPages charges the fee in the
   *  active chain's native currency. */
  async deploy(repo: string): Promise<string> {
    const { sig } = await deployPages(this.signer, repo);
    return sig;
  }
}
