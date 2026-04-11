interface TimerRingProps {
  seconds: number;
  maxSeconds: number;
  size?: number;
}

export function TimerRing({ seconds, maxSeconds, size = 80 }: TimerRingProps) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = seconds / maxSeconds;
  const offset = circumference * (1 - progress);
  const isUrgent = seconds <= 5;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="timer-ring" width={size} height={size}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#2a2a2a"
          strokeWidth="4"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={isUrgent ? "#ef4444" : "#d4a843"}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s ease" }}
        />
      </svg>
      <span
        className={`absolute text-2xl font-bold font-arena tabular-nums ${
          isUrgent ? "text-arena-red animate-countdown" : "text-gold"
        }`}
      >
        {seconds}
      </span>
    </div>
  );
}
