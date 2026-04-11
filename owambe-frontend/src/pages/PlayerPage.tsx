import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useWallet } from "../hooks/useWallet";
import { WalletButton } from "../components/WalletButton";
import { TimerRing } from "../components/TimerRing";
import { Podium } from "../components/Podium";
import { Confetti } from "../components/Confetti";
import { api } from "../utils/api";

type PlayerPhase = "join" | "waiting" | "playing" | "results";

interface CurrentQuestion {
  index: number;
  question: string;
  options: { A: string; B: string; C: string; D: string };
  totalQuestions: number;
  startedAt: number | null;
}

export function PlayerPage() {
  const [searchParams] = useSearchParams();
  const gameIdParam = searchParams.get("game");

  const wallet = useWallet();

  const [phase, setPhase] = useState<PlayerPhase>("join");
  const [email, setEmail] = useState("");
  const [gameData, setGameData] = useState<any>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentQuestion, setCurrentQuestion] = useState<CurrentQuestion | null>(null);
  const [lastQuestionIndex, setLastQuestionIndex] = useState(-1);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answerResult, setAnswerResult] = useState<{ correct: boolean; correctAnswer: string } | null>(null);
  const [score, setScore] = useState(0);
  const [timer, setTimer] = useState(15);

  const [leaderboard, setLeaderboard] = useState<any>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [isWinner, setIsWinner] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load game info once
  useEffect(() => {
    if (!gameIdParam) return;
    if (phase === "join" && !gameData) {
      api.getGame(gameIdParam).then(setGameData).catch(() => {});
    }
  }, [gameIdParam, phase, gameData]);

  // Active polling
  useEffect(() => {
    if (!gameIdParam || !email || phase === "join") return;
    const poll = setInterval(async () => {
      try {
        const data = await api.getGame(gameIdParam, email);
        setGameData(data);
        if (data.phase === "active" && phase === "waiting") setPhase("playing");
        if (data.phase === "active" && data.currentQuestion) {
          const q = data.currentQuestion as CurrentQuestion;
          if (q.index !== lastQuestionIndex) {
            setCurrentQuestion(q);
            setLastQuestionIndex(q.index);
            setSelectedAnswer(null);
            setAnswerResult(null);
            setTimer(10);
          }
        }
        if (data.phase === "finished" && phase !== "results") {
          const lb = await api.getLeaderboard(gameIdParam);
          setLeaderboard(lb);
          setPhase("results");
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 5000);

          // Check if this player is a winner
          const myRank = lb.leaderboard.findIndex((e: any) => e.email.toLowerCase() === email.toLowerCase());
          if (myRank >= 0 && myRank < lb.sharePercentages.length) {
            setIsWinner(true);
          }
        }
      } catch { /* ignore */ }
    }, 1500);
    return () => clearInterval(poll);
  }, [gameIdParam, email, phase, lastQuestionIndex]);

  // Countdown
  useEffect(() => {
    if (phase !== "playing" || !currentQuestion) return;
    setTimer(10);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimer((prev) => { if (prev <= 0) { clearInterval(timerRef.current!); return 0; } return prev - 1; });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, currentQuestion?.index]);

  const handleJoin = async () => {
    if (!gameIdParam || !email.trim()) return;
    setJoining(true);
    setError(null);
    try {
      await api.joinGame(gameIdParam, email.trim());
      setPhase("waiting");
    } catch (err: any) {
      setError(err.message || "Failed to join");
    } finally {
      setJoining(false);
    }
  };

  const handleAnswer = async (answer: string) => {
    if (selectedAnswer || !gameIdParam || !email || !currentQuestion) return;
    setSelectedAnswer(answer);
    try {
      const result = await api.submitAnswer(gameIdParam, email, currentQuestion.index, answer);
      setAnswerResult({ correct: result.correct, correctAnswer: result.correctAnswer });
      setScore(result.score);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleClaimPrize = async () => {
    if (!gameIdParam || !email || !wallet.address) return;
    setClaiming(true);
    setError(null);
    try {
      await api.claimPrize(gameIdParam, email, wallet.address);
      setClaimed(true);
    } catch (err: any) {
      setError(err.message || "Failed to claim");
    } finally {
      setClaiming(false);
    }
  };

  if (!gameIdParam) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="stone-card arena-border p-10 text-center animate-fade-up">
          <h1 className="font-arena text-3xl text-gold tracking-wider mb-3">OWAMBE</h1>
          <p className="text-cream-dim/50 text-sm">No game ID. Scan a QR code to enter the arena.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-2xl mx-auto">
      <Confetti active={showConfetti} />

      <header className="flex justify-between items-center mb-10">
        <div>
          <span className="font-arena text-xl tracking-wider">
            <span className="text-gold">OWA</span><span className="text-cream/60">MBE</span>
          </span>
          <span className="text-cream-dim/30 text-xs ml-2 font-mono">#{gameIdParam}</span>
        </div>
        {/* Only show wallet button in results phase for winners */}
        {phase === "results" && isWinner && !claimed && (
          <WalletButton
            address={wallet.address}
            connecting={wallet.connecting}
            onConnect={wallet.connect}
            onDisconnect={wallet.disconnect}
            error={wallet.error}
          />
        )}
      </header>

      {phase === "join" ? (
        /* ── JOIN PHASE — email only ── */
        <div className="animate-fade-up space-y-6">
          <div className="text-center mb-6">
            <p className="text-cream-dim/30 text-xs font-arena tracking-[0.3em] mb-2">A CHALLENGE AWAITS</p>
            <h2 className="font-arena text-3xl text-gold tracking-wider">ARENA #{gameIdParam}</h2>
          </div>

          {gameData && (
            <div className="stone-card arena-border arch-top p-6">
              <div className="text-center mb-6">
                <p className="text-cream-dim/40 text-xs font-arena tracking-widest mb-1">PRIZE POOL</p>
                <p className="text-gold font-bold text-4xl font-arena">{gameData.prizePool} <span className="text-lg">MON</span></p>
              </div>

              <div className="grid grid-cols-3 gap-4 text-center border-t border-arena-border pt-4">
                <div>
                  <p className="text-cream-dim/30 text-xs">ENTRY</p>
                  <p className="text-arena-green font-bold text-sm">FREE</p>
                </div>
                <div>
                  <p className="text-cream-dim/30 text-xs">WARRIORS</p>
                  <p className="text-cream font-bold text-sm">{gameData.playerCount}</p>
                </div>
                <div>
                  <p className="text-cream-dim/30 text-xs">SPLIT</p>
                  <p className="text-cream text-xs">{gameData.sharePercentages?.map((s: number) => `${s}%`).join(" / ")}</p>
                </div>
              </div>
            </div>
          )}

          <div className="stone-card arena-border p-6">
            <label className="block text-cream-dim/50 text-xs font-arena tracking-wider mb-2">YOUR EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="warrior@example.com"
              className="w-full bg-arena-stone border border-arena-border rounded-lg px-4 py-3 text-cream placeholder-cream/20 focus:outline-none focus:border-gold/50 transition-colors"
              onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
            />
            <p className="text-cream-dim/30 text-xs mt-2">No wallet needed to play. Just your email.</p>
          </div>

          {error && <p className="text-arena-red text-sm text-center">{error}</p>}

          <button onClick={handleJoin} disabled={joining || !gameData || !email.trim()} className="btn-gold w-full text-lg py-5">
            {joining ? "ENTERING..." : "ENTER THE ARENA"}
          </button>
        </div>
      ) : phase === "waiting" ? (
        /* ── WAITING PHASE ── */
        <div className="flex flex-col items-center justify-center min-h-[50vh] animate-fade-up">
          <div className="stone-card arena-border p-10 text-center max-w-sm">
            <div className="w-12 h-12 border-3 border-gold/40 border-t-gold rounded-full animate-spin mx-auto mb-6" />
            <h2 className="font-arena text-xl text-gold tracking-wider mb-2">YOU ARE IN THE ARENA</h2>
            <p className="text-cream-dim/40 text-sm animate-pulse">Waiting for the host to begin battle...</p>
          </div>
        </div>
      ) : phase === "playing" ? (
        /* ── PLAYING PHASE ── */
        <div className="animate-gate-open space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-cream-dim/30 text-xs font-arena tracking-[0.3em]">ROUND</p>
              <h2 className="font-arena text-3xl text-gold">
                {(currentQuestion?.index ?? 0) + 1}
                <span className="text-cream-dim/20 text-lg ml-1">/ {currentQuestion?.totalQuestions ?? "?"}</span>
              </h2>
              <p className="text-gold/40 text-xs mt-1">Score: {score}</p>
            </div>
            <TimerRing seconds={timer} maxSeconds={10} size={90} />
          </div>

          {currentQuestion ? (
            <div className="space-y-4">
              <div className="stone-card arena-border p-6">
                <h3 className="text-lg md:text-xl font-semibold text-cream leading-relaxed">
                  {currentQuestion.question}
                </h3>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {(["A", "B", "C", "D"] as const).map((key) => {
                  const isSelected = selectedAnswer === key;
                  const showResult = answerResult !== null;
                  const isCorrect = showResult && key === answerResult.correctAnswer;
                  const isWrong = isSelected && showResult && key !== answerResult.correctAnswer;
                  const disabled = !!selectedAnswer || timer === 0;

                  return (
                    <button
                      key={key}
                      onClick={() => handleAnswer(key)}
                      disabled={disabled}
                      className={`stone-tablet text-left flex items-center gap-4 ${
                        isCorrect ? "correct" : isWrong ? "wrong" : isSelected ? "selected" : ""
                      } ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <span className={`font-arena font-bold text-lg w-8 ${
                        isCorrect ? "text-arena-green" : isWrong ? "text-arena-red" : "text-gold"
                      }`}>
                        {key}
                      </span>
                      <span className={`${
                        isCorrect ? "text-arena-green" : isWrong ? "text-arena-red" : "text-cream-dim"
                      }`}>
                        {currentQuestion.options[key]}
                      </span>
                    </button>
                  );
                })}
              </div>

              {answerResult && (
                <div className={`text-center py-3 rounded-lg ${answerResult.correct ? "bg-arena-green/10" : "bg-arena-red/10"}`}>
                  <p className={`font-arena tracking-wider text-sm ${answerResult.correct ? "text-arena-green" : "text-arena-red"}`}>
                    {answerResult.correct ? "CORRECT!" : `WRONG — ANSWER: ${answerResult.correctAnswer}`}
                  </p>
                </div>
              )}

              {timer === 0 && !selectedAnswer && (
                <div className="text-center py-3 rounded-lg bg-arena-red/10">
                  <p className="font-arena tracking-wider text-sm text-arena-red">TIME'S UP</p>
                </div>
              )}
            </div>
          ) : (
            <div className="stone-card arena-border p-10 text-center">
              <div className="w-8 h-8 border-3 border-gold/40 border-t-gold rounded-full animate-spin mx-auto mb-4" />
              <p className="text-cream-dim/40 text-sm">Awaiting next round...</p>
            </div>
          )}
        </div>
      ) : (
        /* ── RESULTS PHASE ── */
        <div className="animate-fade-up space-y-6">
          <div className="text-center">
            <h2 className="font-arena text-3xl text-gold tracking-wider mb-1">THE ARENA HAS SPOKEN</h2>
            <p className="text-cream-dim/50 text-sm">
              Your score: <span className="text-gold font-bold">{score}</span> / {currentQuestion?.totalQuestions ?? "?"}
            </p>
          </div>

          {leaderboard && (
            <>
              <Podium
                entries={leaderboard.leaderboard.slice(0, 3).map((entry: any, i: number) => {
                  const share = leaderboard.sharePercentages[i];
                  const pool = parseFloat(leaderboard.prizePool);
                  return {
                    address: entry.email,
                    score: entry.score,
                    rank: i + 1,
                    winnings: share ? ((pool * share) / 100).toFixed(4) : null,
                  };
                })}
              />

              {/* Winner claim section */}
              {isWinner && !claimed && (
                <div className="stone-card arena-border p-6 text-center bg-gold/5">
                  <p className="font-arena text-gold text-lg tracking-wider mb-2">YOU ARE A CHAMPION</p>
                  <p className="text-cream-dim/60 text-sm mb-4">Connect your wallet to receive your winnings</p>

                  {!wallet.address ? (
                    <button onClick={wallet.connect} disabled={wallet.connecting} className="btn-gold w-full">
                      {wallet.connecting ? "CONNECTING..." : "CONNECT WALLET TO CLAIM"}
                    </button>
                  ) : (
                    <button onClick={handleClaimPrize} disabled={claiming} className="btn-gold w-full">
                      {claiming ? "CLAIMING..." : "CLAIM PRIZE"}
                    </button>
                  )}
                </div>
              )}

              {claimed && (
                <div className="stone-card arena-border p-6 text-center bg-arena-green/5">
                  <p className="font-arena text-arena-green text-lg tracking-wider">WALLET SUBMITTED</p>
                  <p className="text-cream-dim/60 text-sm mt-1">The host will send your winnings shortly</p>
                  <p className="text-cream-dim/30 text-xs font-mono mt-2">{wallet.address}</p>
                </div>
              )}

              {/* Full leaderboard for others */}
              {leaderboard.leaderboard.length > 3 && (
                <div className="stone-card p-4 space-y-2">
                  {leaderboard.leaderboard.slice(3).map((entry: any, i: number) => {
                    const isMe = email.toLowerCase() === entry.email.toLowerCase();
                    return (
                      <div key={entry.email} className={`flex items-center justify-between py-2 px-3 rounded ${isMe ? "bg-gold/5 border border-gold/20" : "bg-arena-stone/30"}`}>
                        <div className="flex items-center gap-3">
                          <span className="text-cream-dim/30 font-arena text-xs">#{i + 4}</span>
                          <span className="text-xs text-cream-dim/60">
                            {entry.email}
                            {isMe && <span className="text-gold ml-1">(You)</span>}
                          </span>
                        </div>
                        <span className="text-cream-dim/40 text-sm">{entry.score} pts</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
