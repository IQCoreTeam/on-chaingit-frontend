"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import iqlabs from "iqlabs-sdk";
import { useMemo } from "react";
import QueryProvider from "@/providers/QueryProvider";

// Default styles that can be overridden by your app
import "@solana/wallet-adapter-react-ui/styles.css";

import { Toaster } from 'sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  // GHCR images never carry env (.dockerignore strips .env*), and the SDK's
  // own fallback is api.mainnet-beta — so pin the RPC here on the devnet
  // branch instead of relying on env that won't be present at build/runtime.
  const endpoint = useMemo(
    () => "https://devnet.helius-rpc.com/?api-key=fbb113ce-eeb4-4277-8c44-7153632d175a",
    [],
  );

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
