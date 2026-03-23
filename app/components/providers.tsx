"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import { useMemo } from "react";
import QueryProvider from "@/providers/QueryProvider";

// Default styles that can be overridden by your app
import "@solana/wallet-adapter-react-ui/styles.css";

import { Toaster } from 'sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => "https://devnet.helius-rpc.com/?api-key=0831d2dc-eac5-40e9-bfef-114ae11baaef", []);
  
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
