interface WalletButtonProps {
  address: string | null;
  connecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  error: string | null;
}

export function WalletButton({ address, connecting, onConnect, onDisconnect, error }: WalletButtonProps) {
  if (address) {
    return (
      <div className="flex items-center gap-3">
        <div className="stone-card px-4 py-2 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-arena-green" />
          <span className="text-cream-dim text-xs">Connected</span>
          <span className="text-gold font-mono text-sm">{address.slice(0, 6)}...{address.slice(-4)}</span>
        </div>
        <button
          onClick={onDisconnect}
          className="text-cream-dim/50 hover:text-cream text-xs transition-colors cursor-pointer"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={onConnect}
        disabled={connecting}
        className="stone-card px-5 py-2.5 text-gold font-arena text-sm tracking-wider hover:border-gold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border border-gold/20"
      >
        {connecting ? "CONNECTING..." : "CONNECT WALLET"}
      </button>
      {error && <p className="text-arena-red text-xs mt-1 text-right">{error}</p>}
    </div>
  );
}
