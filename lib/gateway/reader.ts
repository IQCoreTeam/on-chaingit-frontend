// Gateway-first reader/notifier. Mirrors solchat-web/lib/gateway/reader.ts.
// Try the gateway list in order; on total failure fall back to the SDK's
// direct-RPC path. Writes get a fire-and-forget POST /notify so the gateway
// updates its head-page cache and SSE stream without waiting for a refresh.

import { PublicKey } from "@solana/web3.js";
import iqlabs from "iqlabs-sdk";
// Importing this pins the branch RPC into the SDK at module load — before any
// reader below runs, and on the server too (where Providers never renders).
import "@/lib/rpc";
import {
  loadBlob as sdkLoadBlob,
  loadTree as sdkLoadTree,
  readCommitHistory as sdkReadCommitHistory,
  readLatestCommit as sdkReadLatestCommit,
  readOwnerRepos as sdkReadOwnerRepos,
  readRegistryPage as sdkReadRegistryPage,
} from "@iqlabs-official/git-sdk/browser";
import type {
  Commit,
  FileTree,
  RegistryEntry,
  Repository,
} from "@iqlabs-official/git-sdk";
import {
  IQGIT_ROOT_ID,
  REGISTRY_HINT,
  commitTableHint,
  repoListHint,
} from "@iqlabs-official/git-sdk";

const PRIMARY_GATEWAY = "https://dev-gateway.iqlabs.dev";
const BACKUP_GATEWAY = "https://dev-gateway.iqlabs.dev";
const GATEWAYS = [PRIMARY_GATEWAY];
const GATEWAY_OVERRIDE_KEY = "iqgit_gateway";

function getGateways(): string[] {
  if (typeof window !== "undefined") {
    const custom = window.localStorage.getItem(GATEWAY_OVERRIDE_KEY);
    if (custom) return [custom, ...GATEWAYS];
  }
  return GATEWAYS;
}

async function gwFetch(path: string): Promise<Response> {
  for (const gw of getGateways()) {
    try {
      const res = await fetch(`${gw}${path}`);
      if (res.ok) return res;
    } catch {
      continue;
    }
  }
  throw new Error("all gateways unreachable");
}

// ---------------------------------------------------------------
// PDA derivation (mirrors @iqlabs-official/git-sdk's chain layer)
// ---------------------------------------------------------------
const PROGRAM_ID = new PublicKey(iqlabs.contract.DEFAULT_ANCHOR_PROGRAM_ID);
const DB_ROOT_SEED = iqlabs.utils.toSeedBytes(IQGIT_ROOT_ID);
const DB_ROOT = iqlabs.contract.getDbRootPda(DB_ROOT_SEED, PROGRAM_ID);

function tablePdaFromHint(hint: string): PublicKey {
  return iqlabs.contract.getTablePda(DB_ROOT, iqlabs.utils.toSeedBytes(hint), PROGRAM_ID);
}

export function pdaForRegistry(): PublicKey {
  return tablePdaFromHint(REGISTRY_HINT);
}
export function pdaForOwnerRepos(owner: string): PublicKey {
  return tablePdaFromHint(repoListHint(owner));
}
export function pdaForCommitTable(owner: string, repo: string): PublicKey {
  return tablePdaFromHint(commitTableHint(owner, repo));
}

// ---------------------------------------------------------------
// Reads — gateway first, SDK fallback
// ---------------------------------------------------------------
type RowsOpts = { limit?: number; before?: string };

async function readTableRowsGW<T>(
  pda: PublicKey,
  opts: RowsOpts | undefined,
  fallback: () => Promise<T[]>,
): Promise<T[]> {
  try {
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.before) params.set("before", opts.before);
    const qs = params.toString();
    const res = await gwFetch(`/table/${pda.toBase58()}/rows${qs ? `?${qs}` : ""}`);
    const data = await res.json();
    const rows = Array.isArray(data) ? data : data.rows ?? [];
    return rows as T[];
  } catch (e) {
    console.warn("[gateway] /table rows failed, falling back to RPC", e);
    return fallback();
  }
}

export function readRegistryPage(opts?: RowsOpts): Promise<RegistryEntry[]> {
  return readTableRowsGW<RegistryEntry>(pdaForRegistry(), opts, () =>
    sdkReadRegistryPage(undefined as never, opts),
  );
}

export function readOwnerRepos(owner: string): Promise<Repository[]> {
  return readTableRowsGW<Repository>(pdaForOwnerRepos(owner), undefined, () =>
    sdkReadOwnerRepos(undefined as never, owner),
  );
}

export function readCommitHistory(
  owner: string,
  repo: string,
  opts?: RowsOpts,
): Promise<Commit[]> {
  return readTableRowsGW<Commit>(pdaForCommitTable(owner, repo), opts, () =>
    sdkReadCommitHistory(undefined as never, owner, repo, opts),
  );
}

export async function readLatestCommit(owner: string, repo: string): Promise<Commit | null> {
  const rows = await readCommitHistory(owner, repo, { limit: 1 });
  return rows[0] ?? null;
}

async function readCodeInGW(sig: string): Promise<{ data: string | null; metadata: string }> {
  try {
    const res = await gwFetch(`/data/${sig}`);
    const json = await res.json();
    return { data: json.data ?? null, metadata: json.metadata ?? "" };
  } catch (e) {
    console.warn(`[gateway] /data/${sig.slice(0, 8)}… failed, falling back to RPC`, e);
    return iqlabs.reader.readCodeIn(sig);
  }
}

export async function loadTree(treeTxId: string): Promise<FileTree> {
  try {
    const { data } = await readCodeInGW(treeTxId);
    if (data === null) throw new Error("not found");
    return JSON.parse(data) as FileTree;
  } catch (e) {
    console.warn(`[gateway] tree fetch fallback`, e);
    return sdkLoadTree(treeTxId);
  }
}

export async function loadBlob(txId: string): Promise<string> {
  try {
    const { data } = await readCodeInGW(txId);
    if (data === null) throw new Error("not found");
    return data;
  } catch (e) {
    console.warn(`[gateway] blob fetch fallback`, e);
    return sdkLoadBlob(txId);
  }
}

// ---------------------------------------------------------------
// Write notify — fire-and-forget
// ---------------------------------------------------------------

/** Tell the primary gateway about a row write so it updates its caches +
 *  SSE stream immediately. Never throws — failures are silent. */
export function notifyGateway(
  tablePda: string,
  txSignature: string,
  row?: object,
  signer?: string,
): void {
  const gw = getGateways()[0];
  fetch(`${gw}/table/${tablePda}/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ txSignature, row, signer }),
  }).catch(() => {});
}
