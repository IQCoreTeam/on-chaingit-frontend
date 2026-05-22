// Gateway-first reader/notifier. Mirrors solchat-web/lib/gateway/reader.ts.
// Try the gateway list in order; on total failure fall back to the SDK's
// direct-RPC path. Writes get a fire-and-forget POST /notify so the gateway
// updates its head-page cache and SSE stream without waiting for a refresh.

import { PublicKey } from "@solana/web3.js";
import iqlabs from "iqlabs-sdk";
import {
  loadBlob as sdkLoadBlob,
  loadTree as sdkLoadTree,
  readCommitHistory as sdkReadCommitHistory,
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
  commitTablePda,
  repoListHint,
} from "@iqlabs-official/git-sdk";
import { NETWORK } from "@/lib/network";

const GATEWAY_OVERRIDE_KEY = "iqgit_gateway";

function getGateways(): string[] {
  if (typeof window !== "undefined") {
    const custom = window.localStorage.getItem(GATEWAY_OVERRIDE_KEY);
    if (custom) return [custom, ...NETWORK.gateways];
  }
  return NETWORK.gateways;
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
// PDA derivation. The commit-table PDA comes straight from the SDK
// (commitTablePda). registry / repo-list still derive locally because the SDK
// only exposes their hints, not a PDA helper — small duplication of the SDK's
// chain layer, kept until the SDK exposes those too.
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
export const pdaForCommitTable = commitTablePda;

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

// Commit history keyed by the commit-table PDA. owner/repo callers derive the
// PDA with pdaForCommitTable; a .sol / dbroot caller passes its PDA straight in.
export function readCommitHistoryByPda(pda: PublicKey, opts?: RowsOpts): Promise<Commit[]> {
  return readTableRowsGW<Commit>(pda, opts, () => sdkReadCommitHistory(pda, opts));
}

export function readCommitHistory(owner: string, repo: string, opts?: RowsOpts): Promise<Commit[]> {
  return readCommitHistoryByPda(pdaForCommitTable(owner, repo), opts);
}

export async function readLatestCommitByPda(pda: PublicKey): Promise<Commit | null> {
  const rows = await readCommitHistoryByPda(pda, { limit: 1 });
  return rows[0] ?? null;
}

export async function readLatestCommit(owner: string, repo: string): Promise<Commit | null> {
  return readLatestCommitByPda(pdaForCommitTable(owner, repo));
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

// ---------------------------------------------------------------
// Entry resolution (.sol + "is this pubkey a table?") — used by the /[ident]
// page to dispatch a domain / commit-table PDA / owner wallet.
// Small overlap with iq-wide-web's resolver: both just call the same gateway
// endpoints. The dispatch logic itself isn't shared (different apps).
// ---------------------------------------------------------------

/** Resolve a .sol domain to {owner, record} via the gateway. */
export async function fetchSnsResolution(
  domain: string,
): Promise<{ owner: string | null; record: string | null }> {
  const res = await gwFetch(`/sns/${domain}`);
  const data = await res.json();
  return { owner: data.owner ?? null, record: data.record ?? null };
}

/** Table meta for a pubkey, or null when it isn't a table (404). `name` is the
 *  table hint, e.g. "git_commits:<owner>:<repo>". Lets a caller tell a
 *  commit-table PDA from a wallet without a heavy scan (gateway caches both). */
export async function fetchTableMeta(
  pubkey: string,
): Promise<{ name: string; columns: string[] } | null> {
  const gw = getGateways()[0];
  const res = await fetch(`${gw}/table/${pubkey}/meta`);
  if (!res.ok) return null;
  return res.json();
}
