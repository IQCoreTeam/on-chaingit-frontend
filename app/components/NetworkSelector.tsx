"use client";

// Header controls: the network dropdown (Solana / Sepolia / Monad / ...) plus a
// family-aware wallet control — Solana's WalletMultiButton when the active
// network is Solana, an EVM connect button when it's an EVM chain. Mount this in
// each page's nav next to where the wallet button used to be.

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { NETWORK_CONFIGS } from "@/lib/network";
import { useNetwork } from "./NetworkProvider";
import { useEvmWallet } from "./EvmWalletProvider";

function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function EvmWalletButton() {
  const { network } = useNetwork();
  const { address, connected, connecting, connect, switchChain } = useEvmWallet();

  const onClick = async () => {
    try {
      if (!connected) await connect();
      await switchChain(network);
    } catch (e) {
      // surfaced by the wallet UI; keep the button resilient
      console.error(e);
    }
  };

  return (
    <button
      onClick={onClick}
      className="px-4 py-1 border border-neon-purple text-neon-purple hover:bg-neon-purple/10 font-tech text-xs uppercase tracking-wider transition-colors"
      title={connected ? address ?? "" : "Connect an EVM wallet"}
    >
      {connecting ? "CONNECTING…" : connected && address ? short(address) : "CONNECT EVM"}
    </button>
  );
}

export function NetworkSelector() {
  const { networkKey, network, setNetworkKey, ready } = useNetwork();

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Network"
        value={networkKey}
        onChange={(e) => setNetworkKey(e.target.value)}
        suppressHydrationWarning
        className="bg-black/40 border border-neon-cyan text-neon-cyan font-tech text-xs uppercase tracking-wider px-2 py-1 focus:outline-none"
      >
        {Object.entries(NETWORK_CONFIGS).map(([key, cfg]) => (
          <option key={key} value={key} className="bg-black text-neon-cyan">
            {cfg.label}
          </option>
        ))}
      </select>
      {/* Render the wallet control only after hydration to avoid a flash where
          the family differs between SSR default and the restored network. */}
      {ready &&
        (network.family === "solana" ? <WalletMultiButton /> : <EvmWalletButton />)}
    </div>
  );
}
