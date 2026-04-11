interface PodiumEntry {
  address: string;
  score: number;
  winnings: string | null;
  rank: number;
}

interface PodiumProps {
  entries: PodiumEntry[];
}

const CROWN = (
  <svg viewBox="0 0 24 24" className="w-6 h-6 text-gold animate-crown-bounce inline-block" fill="currentColor">
    <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm0 2h14v2H5v-2z" />
  </svg>
);

export function Podium({ entries }: PodiumProps) {
  // Reorder for visual: 2nd, 1st, 3rd
  const [first, second, third] = entries;
  const display = [second, first, third].filter(Boolean);
  const heights = ["h-28", "h-40", "h-20"];
  const bgColors = ["bg-cream/5", "bg-gold/10", "bg-cream/5"];
  const borderColors = ["border-cream/20", "border-gold/40", "border-cream/10"];
  const labels = ["II", "I", "III"];

  return (
    <div className="flex items-end justify-center gap-3 mt-8 mb-4">
      {display.map((entry, i) => {
        if (!entry) return <div key={i} className="w-28" />;
        const isFirst = i === 1;
        return (
          <div
            key={entry.address}
            className="animate-podium-rise flex flex-col items-center"
            style={{ animationDelay: `${i * 0.2}s` }}
          >
            {/* Crown for 1st */}
            {isFirst && <div className="mb-2">{CROWN}</div>}

            {/* Player info */}
            <div className="text-center mb-2">
              <p className="font-mono text-xs text-cream-dim">
                {entry.address.slice(0, 6)}...{entry.address.slice(-4)}
              </p>
              <p className={`font-bold font-arena ${isFirst ? "text-gold text-lg" : "text-cream text-sm"}`}>
                {entry.score} pts
              </p>
              {entry.winnings && (
                <p className="text-gold text-xs font-bold">+{entry.winnings} MON</p>
              )}
            </div>

            {/* Podium block */}
            <div
              className={`${heights[i]} w-24 sm:w-28 ${bgColors[i]} border ${borderColors[i]} rounded-t-lg flex items-end justify-center pb-3 transition-all`}
            >
              <span className={`font-arena text-xl ${isFirst ? "text-gold" : "text-cream/40"}`}>
                {labels[i]}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
