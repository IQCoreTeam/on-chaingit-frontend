"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { useMemo } from "react";
import QueryProvider from "@/providers/QueryProvider";
import { RPC_ENDPOINT, setSdkRpc } from "@/lib/rpc";

// Default styles that can be overridden by your app
import "@solana/wallet-adapter-react-ui/styles.css";

import { Toaster } from 'sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => RPC_ENDPOINT, []);

  // iqlabs-sdk's reader path uses its own internal `getConnection()` that
  // ignores wallet-adapter's ConnectionProvider. `lib/rpc` already pins this
  // at module load; call again here to be safe if module order ever changes.
  setSdkRpc();

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
