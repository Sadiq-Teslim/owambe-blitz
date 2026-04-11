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
        <div className="bg-purple-800/50 border border-purple-500/30 rounded-lg px-4 py-2 text-sm">
          <span className="text-purple-300">Connected: </span>
          <span className="text-white font-mono">{address.slice(0, 6)}...{address.slice(-4)}</span>
        </div>
        <button
          onClick={onDisconnect}
          className="text-purple-400 hover:text-white text-sm transition-colors cursor-pointer"
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
        className="bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-xl transition-all cursor-pointer animate-pulse-glow"
      >
        {connecting ? "Connecting..." : "Connect Wallet"}
      </button>
      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
    </div>
  );
}
