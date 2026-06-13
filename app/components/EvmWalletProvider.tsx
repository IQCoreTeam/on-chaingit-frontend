"use client";

// Shared EVM (MetaMask / window.ethereum) wallet state. One connection for the
// whole app: the header connect button and the write hooks/services all read
// the same address + ethers Signer, so we never open duplicate connections.
//
// Only relevant when the active network family is "eth". The Solana wallet
// keeps flowing through @solana/wallet-adapter as before.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { BrowserProvider, type Signer } from "ethers";
import type { NetworkConfig } from "@/lib/network";

interface EvmWalletContextValue {
  address: string | null;
  connected: boolean;
  connecting: boolean;
  signer: Signer | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  /** Ask the wallet to switch/add the chain for an EVM network config. */
  switchChain: (cfg: NetworkConfig) => Promise<void>;
}

const EvmWalletContext = createContext<EvmWalletContextValue | null>(null);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getEth(): any {
  return typeof window !== "undefined" ? (window as any).ethereum : undefined;
}

export function EvmWalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [signer, setSigner] = useState<Signer | null>(null);
  const [connecting, setConnecting] = useState(false);

  const resolve = useCallback(async () => {
    const eth = getEth();
    if (!eth) return;
    const provider = new BrowserProvider(eth);
    const s = await provider.getSigner();
    setSigner(s);
    setAddress(await s.getAddress());
  }, []);

  const connect = useCallback(async () => {
    const eth = getEth();
    if (!eth) throw new Error("No EVM wallet found — install MetaMask");
    setConnecting(true);
    try {
      await eth.request({ method: "eth_requestAccounts" });
      await resolve();
    } finally {
      setConnecting(false);
    }
  }, [resolve]);

  const disconnect = useCallback(() => {
    setSigner(null);
    setAddress(null);
  }, []);

  const switchChain = useCallback(async (cfg: NetworkConfig) => {
    const eth = getEth();
    if (!eth || !cfg.chainIdHex) return;
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: cfg.chainIdHex }],
      });
    } catch (e: unknown) {
      // 4902 = chain not added; add it then it's selected.
      const code = (e as { code?: number })?.code;
      if (code === 4902 && cfg.chainParams) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [cfg.chainParams],
        });
      } else {
        throw e;
      }
    }
    await resolve();
  }, [resolve]);

  // Track account/chain changes from the wallet.
  useEffect(() => {
    const eth = getEth();
    if (!eth?.on) return;
    const onAccounts = (accts: string[]) => {
      if (!accts.length) disconnect();
      else resolve().catch(() => {});
    };
    const onChain = () => resolve().catch(() => {});
    eth.on("accountsChanged", onAccounts);
    eth.on("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, [disconnect, resolve]);

  const value: EvmWalletContextValue = {
    address,
    connected: !!address && !!signer,
    connecting,
    signer,
    connect,
    disconnect,
    switchChain,
  };

  return <EvmWalletContext.Provider value={value}>{children}</EvmWalletContext.Provider>;
}

export function useEvmWallet(): EvmWalletContextValue {
  const ctx = useContext(EvmWalletContext);
  if (!ctx) throw new Error("useEvmWallet must be used within <EvmWalletProvider>");
  return ctx;
}
