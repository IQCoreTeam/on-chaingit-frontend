"use client";

// Runtime network state for the whole app. Replaces the build-fixed `NETWORK`
// constant: the user picks Solana / Sepolia / Monad in the header and every
// read/write follows. On each change we re-run the SDK routing side-effects
// (setNetwork → reader + gateway routing; iqlabs.setRpcUrl → solana reader
// singleton) and persist the choice to localStorage.
//
// Hydration-safety (Next app-router): state initializes to the branch-pinned
// DEFAULT_NETWORK_KEY so SSR and the first client render agree; the persisted
// choice is restored in an effect (client-only), and the SDK side-effects also
// run in an effect — never during render/SSR, which must not touch the SDK
// singletons.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import iqlabs from "iqlabs-sdk";
import { setGatewayUrls, setNetwork } from "@iqlabs-official/git-sdk/browser";
import {
  DEFAULT_NETWORK_KEY,
  NETWORK_CONFIGS,
  type NetworkConfig,
} from "@/lib/network";

const STORAGE_KEY = "iqgit_network";

interface NetworkContextValue {
  networkKey: string;
  network: NetworkConfig;
  setNetworkKey: (key: string) => void;
  /** True once the localStorage-restore effect has run (post-hydration). */
  ready: boolean;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [networkKey, setNetworkKeyState] = useState<string>(DEFAULT_NETWORK_KEY);
  const [ready, setReady] = useState(false);

  // Restore the persisted choice once, after hydration.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && stored in NETWORK_CONFIGS && stored !== networkKey) {
        setNetworkKeyState(stored);
      }
    } catch {
      /* localStorage unavailable — keep default */
    }
    setReady(true);
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply SDK routing + persist whenever the active network changes (incl. the
  // initial default, so reads work before any user interaction).
  useEffect(() => {
    const cfg = NETWORK_CONFIGS[networkKey];
    if (!cfg) return;
    setNetwork(cfg.token);
    setGatewayUrls(cfg.gateways);
    if (cfg.rpcEndpoint) iqlabs.setRpcUrl(cfg.rpcEndpoint);
    try {
      localStorage.setItem(STORAGE_KEY, networkKey);
    } catch {
      /* ignore */
    }
  }, [networkKey]);

  const setNetworkKey = (key: string) => {
    if (key in NETWORK_CONFIGS) setNetworkKeyState(key);
  };

  const value: NetworkContextValue = {
    networkKey,
    network: NETWORK_CONFIGS[networkKey],
    setNetworkKey,
    ready,
  };

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork(): NetworkContextValue {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error("useNetwork must be used within <NetworkProvider>");
  return ctx;
}
