"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import iqlabs from "iqlabs-sdk";
import { useMemo } from "react";
import QueryProvider from "@/providers/QueryProvider";
import { NETWORK } from "@/lib/network";

// Default styles that can be overridden by your app
import "@solana/wallet-adapter-react-ui/styles.css";

import { Toaster } from 'sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  // GHCR images never carry env (.dockerignore strips .env*), so the RPC is
  // pinned in lib/network.ts and selected per branch (see NETWORK).
  const endpoint = useMemo(() => NETWORK.rpcEndpoint, []);

  // iqlabs-sdk's reader path uses its own internal `getConnection()` that
  // ignores wallet-adapter's ConnectionProvider. Push our endpoint into that
  // singleton so reads (readTableRows / readCodeIn) hit the same RPC.
  iqlabs.setRpcUrl(endpoint);

  // Wallets are implicitly detected by the Wallet Standard
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
            <QueryProvider>
                {children}
            </QueryProvider>
            <Toaster position="bottom-right" theme="dark" richColors />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
