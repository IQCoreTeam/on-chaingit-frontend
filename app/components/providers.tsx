"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { useMemo } from "react";
import QueryProvider from "@/providers/QueryProvider";
import { NETWORK_CONFIGS } from "@/lib/network";
import { NetworkProvider, useNetwork } from "./NetworkProvider";
import { EvmWalletProvider } from "./EvmWalletProvider";

// Default styles that can be overridden by your app
import "@solana/wallet-adapter-react-ui/styles.css";

import { Toaster } from "sonner";

// A safe Solana RPC for the wallet adapter when the active network is EVM —
// the Solana connection just sits idle in that case (EVM writes use ethers).
const SOLANA_FALLBACK_RPC = NETWORK_CONFIGS.mainnet.rpcEndpoint!;

// Inner shell: reads the active network for the Solana ConnectionProvider RPC.
// Network routing side-effects (setNetwork / gateway / setRpcUrl) live in
// NetworkProvider, so nothing here touches the SDK singletons during render.
function SolanaProviders({ children }: { children: React.ReactNode }) {
  const { network } = useNetwork();
  const endpoint = useMemo(
    () => network.rpcEndpoint ?? SOLANA_FALLBACK_RPC,
    [network.rpcEndpoint],
  );

  // Wallets are implicitly detected by the Wallet Standard.
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <EvmWalletProvider>
            <QueryProvider>{children}</QueryProvider>
            <Toaster position="bottom-right" theme="dark" richColors />
          </EvmWalletProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NetworkProvider>
      <SolanaProviders>{children}</SolanaProviders>
    </NetworkProvider>
  );
}
