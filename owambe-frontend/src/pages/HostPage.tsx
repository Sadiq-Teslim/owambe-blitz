import { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ethers } from "ethers";
import { useWallet } from "../hooks/useWallet";
import { useContract } from "../hooks/useContract";
import { WalletButton } from "../components/WalletButton";
import { VoiceAssistant } from "../components/VoiceAssistant";
import { TimerRing } from "../components/TimerRing";
import { Podium } from "../components/Podium";
import { Confetti } from "../components/Confetti";
import { api } from "../utils/api";

type GamePhase = "setup" | "lobby" | "playing" | "results";

interface LeaderboardEntry {
  rank: number;
  address: string;
  score: number;
  totalTime: number;
}

export function HostPage() {
  const wallet = useWallet();
  const contract = useContract(wallet.signer);

  // Setup
  const [topic, setTopic] = useState("");
  const [prizePool, setPrizePool] = useState("0.05");
  const [questionCount, setQuestionCount] = useState(3);
  const [splitType, setSplitType] = useState<"default" | "custom">("default");
  const [customSplits, setCustomSplits] = useState("60,30,10");
  const [inputMode, setInputMode] = useState<"voice" | "manual">("voice");

  // Game state
  const [phase, setPhase] = useState<GamePhase>("setup");
  const [gameId, setGameId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [timer, setTimer] = useState(15);
  const [gameData, setGameData] = useState<any>(null);

  // Results
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [payoutTxHash, setPayoutTxHash] = useState<string | null>(null);
  const [payouts, setPayouts] = useState<{ player: string; amount: bigint; rank: number }[]>([]);
  const [showConfetti, setShowConfetti] = useState(false);

  // Loading
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sharePercentages = splitType === "default"
    ? [60, 30, 10]
    : customSplits.split(",").map((s) => Number(s.trim()));

  // Poll game state from backend
  useEffect(() => {
    if (!gameId || phase === "setup" || phase === "results") return;
    const poll = setInterval(async () => {
      try { setGameData(await api.getGame(gameId)); } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(poll);
  }, [gameId, phase]);

  // Countdown timer
  useEffect(() => {
    if (phase !== "playing") return;
    setTimer(15);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, currentQ]);

  const handleVoiceConfig = (config: { topic: string; prizePool: string; questionCount: number; sharePercentages: number[] }) => {
    setTopic(config.topic);
    setPrizePool(config.prizePool);
    setQuestionCount(config.questionCount);
    if (JSON.stringify(config.sharePercentages) !== JSON.stringify([60, 30, 10])) {
      setSplitType("custom");
      setCustomSplits(config.sharePercentages.join(","));
    }
    setInputMode("manual"); // Switch to manual so they can review/edit
  };

  const handleCreateGame = async () => {
    if (!topic.trim()) { setError("Enter a topic"); return; }
    if (splitType === "custom") {
      const total = sharePercentages.reduce((a, b) => a + b, 0);
      if (total !== 100 || sharePercentages.some((n) => isNaN(n) || n <= 0)) {
        setError("Shares must be positive and sum to 100");
        return;
      }
    }
    setError(null);
    setCreating(true);
    try {
      const chainResult = await contract.createGame(prizePool, sharePercentages);
      const backendResult = await api.createGame({
        gameId: String(chainResult.gameId),
        host: wallet.address!,
        topic,
        prizePool,
        sharePercentages,
        questionCount,
      });
      setGameId(String(chainResult.gameId));
      setQuestions(backendResult.questions);
      setPhase("lobby");
    } catch (err: any) {
      setError(err.reason || err.message || "Failed to create game");
    } finally {
      setCreating(false);
    }
  };

  const handleStartGame = async () => {
    if (!gameId) return;
    setError(null);
    try {
      await contract.startGame(Number(gameId));
      await api.startGame(gameId, wallet.address!);
      setPhase("playing");
      setCurrentQ(0);
    } catch (err: any) {
      setError(err.reason || err.message || "Failed to start");
    }
  };

  const handleNextQuestion = async () => {
    if (!gameId) return;
    setError(null);
    try {
      const result = await api.nextQuestion(gameId, wallet.address!);
      if (result.phase === "finished") {
        await handleGameEnd(result.leaderboard);
      } else {
        setCurrentQ(result.currentQuestion);
      }
    } catch (err: any) { setError(err.message); }
  };

  const handleGameEnd = async (lb?: LeaderboardEntry[]) => {
    if (!gameId) return;
    let finalLb = lb;
    if (!finalLb) {
      const result = await api.getLeaderboard(gameId);
      finalLb = result.leaderboard;
    }
    setLeaderboard(finalLb!);
    setPhase("results");
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 5000);

    setPaying(true);
    try {
      const sortedPlayers = finalLb!.map((e: LeaderboardEntry) => e.address);
      const sortedScores = finalLb!.map((e: LeaderboardEntry) => e.score);
      const checksummed = sortedPlayers.map((a: string) => ethers.getAddress(a));
      const result = await contract.recordScores(Number(gameId), checksummed, sortedScores);
      setPayoutTxHash(result.txHash);
      setPayouts(result.payouts);
    } catch (err: any) {
      setError(err.reason || err.message || "Payout failed");
    } finally {
      setPaying(false);
    }
  };

  const joinUrl = gameId ? `${window.location.origin}/join?game=${gameId}` : "";
  const playerCount = gameData?.playerCount || 0;
  const playerList = gameData?.players || [];

  const handleShare = async () => {
    if (!joinUrl) return;
    if (navigator.share) {
      await navigator.share({ title: "Join my OWAMBE trivia!", text: `Join the arena! Prize pool: ${prizePool} MON`, url: joinUrl });
    } else {
      await navigator.clipboard.writeText(joinUrl);
      alert("Link copied!");
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-2xl mx-auto">
      <Confetti active={showConfetti} />

      {/* Header */}
      <header className="flex justify-between items-center mb-10">
        <a href="/" className="font-arena text-2xl md:text-3xl tracking-wider">
          <span className="text-gold">OWA</span><span className="text-cream/60">MBE</span>
        </a>
        <WalletButton
          address={wallet.address}
          connecting={wallet.connecting}
          onConnect={wallet.connect}
          onDisconnect={wallet.disconnect}
          error={wallet.error}
        />
      </header>

      {!wallet.address ? (
        /* ── Not Connected ── */
        <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-up">
          <div className="stone-card arena-border p-10 text-center max-w-md">
            <h2 className="font-arena text-2xl text-gold mb-3 tracking-wider">HOST THE ARENA</h2>
            <p className="text-cream-dim/60 text-sm mb-6">Connect your wallet to create a trivia game and fund the prize pool.</p>
            <button onClick={wallet.connect} disabled={wallet.connecting} className="btn-gold w-full">
              {wallet.connecting ? "CONNECTING..." : "CONNECT WALLET"}
            </button>
          </div>
        </div>
      ) : phase === "setup" ? (
        /* ── SETUP PHASE ── */
        <div className="animate-fade-up space-y-6">
          <div className="text-center mb-8">
            <h2 className="font-arena text-3xl text-gold tracking-wider mb-1">CREATE YOUR ARENA</h2>
            <p className="text-cream-dim/50 text-sm">Speak your game into existence, or type it out</p>
          </div>

          {/* Mode toggle */}
          <div className="flex justify-center gap-2 mb-6">
            <button
              onClick={() => setInputMode("voice")}
              className={`px-4 py-2 rounded-lg text-sm font-arena tracking-wider transition-all cursor-pointer ${
                inputMode === "voice" ? "bg-gold/15 text-gold border border-gold/30" : "text-cream-dim/40 border border-transparent hover:text-cream-dim"
              }`}
            >
              VOICE
            </button>
            <button
              onClick={() => setInputMode("manual")}
              className={`px-4 py-2 rounded-lg text-sm font-arena tracking-wider transition-all cursor-pointer ${
                inputMode === "manual" ? "bg-gold/15 text-gold border border-gold/30" : "text-cream-dim/40 border border-transparent hover:text-cream-dim"
              }`}
            >
              MANUAL
            </button>
          </div>

          {inputMode === "voice" ? (
            <div className="stone-card arena-border p-8">
              <VoiceAssistant onConfigParsed={handleVoiceConfig} />
            </div>
          ) : (
            <div className="stone-card arena-border p-6 space-y-5 stagger-children">
              {/* Topic */}
              <div>
                <label className="block text-cream-dim/50 text-xs font-arena tracking-wider mb-2">TOPIC</label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder='e.g. "Afrobeats legends", "Nigerian history"'
                  className="w-full bg-arena-stone border border-arena-border rounded-lg px-4 py-3 text-cream placeholder-cream/20 focus:outline-none focus:border-gold/50 transition-colors"
                />
              </div>

              {/* Prize Pool */}
              <div>
                <label className="block text-cream-dim/50 text-xs font-arena tracking-wider mb-2">PRIZE POOL (MON)</label>
                <input
                  type="number"
                  value={prizePool}
                  onChange={(e) => setPrizePool(e.target.value)}
                  step="0.01"
                  min="0.01"
                  className="w-full bg-arena-stone border border-arena-border rounded-lg px-4 py-3 text-gold font-bold focus:outline-none focus:border-gold/50 transition-colors"
                />
              </div>

              {/* Question Count */}
              <div>
                <label className="block text-cream-dim/50 text-xs font-arena tracking-wider mb-2">ROUNDS</label>
                <div className="flex gap-2">
                  {[2, 3, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setQuestionCount(n)}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-arena tracking-wider transition-all cursor-pointer ${
                        questionCount === n
                          ? "bg-gold/15 text-gold border border-gold/40"
                          : "bg-arena-stone border border-arena-border text-cream-dim/40 hover:text-cream-dim"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Split */}
              <div>
                <label className="block text-cream-dim/50 text-xs font-arena tracking-wider mb-2">PRIZE SPLIT</label>
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => setSplitType("default")}
                    className={`flex-1 py-2 rounded-lg text-xs transition-all cursor-pointer ${
                      splitType === "default"
                        ? "bg-gold/15 text-gold border border-gold/40"
                        : "bg-arena-stone border border-arena-border text-cream-dim/40"
                    }`}
                  >
                    60 / 30 / 10
                  </button>
                  <button
                    onClick={() => setSplitType("custom")}
                    className={`flex-1 py-2 rounded-lg text-xs transition-all cursor-pointer ${
                      splitType === "custom"
                        ? "bg-gold/15 text-gold border border-gold/40"
                        : "bg-arena-stone border border-arena-border text-cream-dim/40"
                    }`}
                  >
                    Custom
                  </button>
                </div>
                {splitType === "custom" && (
                  <input
                    type="text"
                    value={customSplits}
                    onChange={(e) => setCustomSplits(e.target.value)}
                    placeholder="e.g. 50,30,20"
                    className="w-full bg-arena-stone border border-arena-border rounded-lg px-4 py-2.5 text-cream text-sm focus:outline-none focus:border-gold/50 transition-colors"
                  />
                )}
              </div>
            </div>
          )}

          {error && <p className="text-arena-red text-sm text-center">{error}</p>}

          {/* CTA — only show when we have a topic (from voice or manual) */}
          {(topic.trim() || inputMode === "manual") && (
            <button
              onClick={handleCreateGame}
              disabled={creating || !topic.trim()}
              className="btn-gold w-full text-lg py-5"
            >
              {creating ? "FORGING THE ARENA..." : "OPEN THE ARENA"}
            </button>
          )}
        </div>
      ) : phase === "lobby" ? (
        /* ── LOBBY PHASE ── */
        <div className="animate-gate-open space-y-6">
          <div className="text-center mb-6">
            <h2 className="font-arena text-2xl text-gold tracking-wider mb-1">ARENA #{gameId}</h2>
            <p className="text-cream-dim/50 text-sm">Warriors are gathering...</p>
          </div>

          {/* QR Shield */}
          <div className="stone-card arena-border arch-top p-8 flex flex-col items-center">
            <p className="text-cream-dim/50 text-xs font-arena tracking-widest mb-4">SCAN TO ENTER — FREE</p>
            <div className="bg-cream/95 p-4 rounded-xl shadow-[0_0_40px_rgba(212,168,67,0.2)]">
              <QRCodeSVG value={joinUrl} size={180} bgColor="#f5e6c8" fgColor="#0a0a0a" />
            </div>
            <p className="text-cream-dim/30 text-xs font-mono mt-4 break-all max-w-xs text-center">{joinUrl}</p>

            {/* Share buttons */}
            <div className="flex gap-3 mt-4">
              <button onClick={handleShare} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold/10 border border-gold/20 text-gold text-sm hover:bg-gold/20 transition-all cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
                Share
              </button>
              <button
                onClick={() => { navigator.clipboard.writeText(joinUrl); }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-arena-stone border border-arena-border text-cream-dim/60 text-sm hover:text-cream-dim transition-all cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy Link
              </button>
            </div>
          </div>

          {/* Game info */}
          <div className="stone-card p-4 flex justify-around text-center">
            <div>
              <p className="text-cream-dim/40 text-xs font-arena tracking-wider">PRIZE</p>
              <p className="text-gold font-bold text-lg">{prizePool} MON</p>
            </div>
            <div className="w-px bg-arena-border" />
            <div>
              <p className="text-cream-dim/40 text-xs font-arena tracking-wider">SPLIT</p>
              <p className="text-cream text-sm">{sharePercentages.join(" / ")}</p>
            </div>
            <div className="w-px bg-arena-border" />
            <div>
              <p className="text-cream-dim/40 text-xs font-arena tracking-wider">ROUNDS</p>
              <p className="text-cream text-sm">{questions.length}</p>
            </div>
          </div>

          {/* Players */}
          <div className="stone-card arena-border p-5">
            <h3 className="font-arena text-sm text-gold/60 tracking-widest mb-4">
              GLADIATORS ({playerCount})
            </h3>
            {playerCount === 0 ? (
              <p className="text-cream-dim/30 text-sm text-center py-4 animate-pulse">
                Waiting for warriors to enter...
              </p>
            ) : (
              <div className="space-y-2">
                {playerList.map((p: any, i: number) => (
                  <div key={p.address} className="flex items-center gap-3 bg-arena-stone/50 rounded-lg px-4 py-2.5 animate-fade-up" style={{ animationDelay: `${i * 0.1}s` }}>
                    <span className="text-gold/60 font-arena text-xs w-6">{i + 1}.</span>
                    <span className="font-mono text-sm text-cream-dim">{p.address.slice(0, 6)}...{p.address.slice(-4)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-arena-red text-sm text-center">{error}</p>}

          <button onClick={handleStartGame} disabled={playerCount === 0} className="btn-gold w-full text-lg py-5">
            {playerCount === 0 ? "AWAITING GLADIATORS" : "BEGIN BATTLE"}
          </button>
        </div>
      ) : phase === "playing" ? (
        /* ── PLAYING PHASE ── */
        <div className="animate-gate-open space-y-6">
          {/* Round header */}
          <div className="flex justify-between items-center">
            <div>
              <p className="text-cream-dim/40 text-xs font-arena tracking-widest">ROUND</p>
              <h2 className="font-arena text-2xl text-gold">
                {currentQ + 1} <span className="text-cream-dim/30 text-lg">OF {questions.length}</span>
              </h2>
            </div>
            <TimerRing seconds={timer} maxSeconds={15} />
          </div>

          {/* Question */}
          {questions[currentQ] && (
            <div className="stone-card arena-border p-6 md:p-8">
              <h3 className="text-lg md:text-xl font-semibold text-cream leading-relaxed mb-6">
                {questions[currentQ].question}
              </h3>

              <div className="grid grid-cols-1 gap-3 stagger-children">
                {(["A", "B", "C", "D"] as const).map((key) => (
                  <div key={key} className="stone-tablet flex items-center gap-3">
                    <span className="text-gold font-arena font-bold text-lg w-8">{key}</span>
                    <span className="text-cream-dim">{questions[currentQ].options[key]}</span>
                  </div>
                ))}
              </div>

              {/* Host sees the answer */}
              <div className="mt-4 pt-4 border-t border-arena-border">
                <p className="text-arena-green/80 text-xs font-arena tracking-wider">
                  CORRECT: <span className="text-arena-green font-bold">{questions[currentQ].answer}</span> — {questions[currentQ].options[questions[currentQ].answer]}
                </p>
              </div>
            </div>
          )}

          {/* Answers received */}
          <div className="stone-card p-4 flex items-center justify-between">
            <span className="text-cream-dim/40 text-xs font-arena tracking-wider">ANSWERS RECEIVED</span>
            <span className="text-gold font-bold">
              {gameData?.players?.filter((p: any) => p.hasAnswered).length || 0} / {playerCount}
            </span>
          </div>

          {error && <p className="text-arena-red text-sm text-center">{error}</p>}

          <button onClick={handleNextQuestion} className="btn-gold w-full text-lg py-4">
            {currentQ < questions.length - 1 ? "NEXT ROUND" : "END BATTLE — PAY WINNERS"}
          </button>
        </div>
      ) : (
        /* ── RESULTS PHASE ── */
        <div className="animate-fade-up space-y-6">
          <div className="text-center">
            <h2 className="font-arena text-3xl text-gold tracking-wider mb-1">THE ARENA HAS SPOKEN</h2>
            <p className="text-cream-dim/50 text-sm">Champions have been decided</p>
          </div>

          {paying ? (
            <div className="stone-card arena-border p-10 text-center">
              <div className="animate-spin w-10 h-10 border-3 border-gold border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-cream-dim/60 text-sm font-arena tracking-wider">SETTLING ON MONAD...</p>
            </div>
          ) : (
            <>
              {/* Podium */}
              <Podium
                entries={leaderboard.slice(0, 3).map((entry, i) => ({
                  address: entry.address,
                  score: entry.score,
                  rank: i + 1,
                  winnings: payouts.find((p) => p.player.toLowerCase() === entry.address.toLowerCase())
                    ? ethers.formatEther(payouts.find((p) => p.player.toLowerCase() === entry.address.toLowerCase())!.amount)
                    : null,
                }))}
              />

              {/* Full leaderboard */}
              {leaderboard.length > 3 && (
                <div className="stone-card p-4 space-y-2">
                  {leaderboard.slice(3).map((entry, i) => (
                    <div key={entry.address} className="flex items-center justify-between py-2 px-3 rounded bg-arena-stone/30">
                      <div className="flex items-center gap-3">
                        <span className="text-cream-dim/30 font-arena text-xs">#{i + 4}</span>
                        <span className="font-mono text-xs text-cream-dim/60">{entry.address.slice(0, 6)}...{entry.address.slice(-4)}</span>
                      </div>
                      <span className="text-cream-dim/40 text-sm">{entry.score} pts</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Tx Hash */}
              {payoutTxHash && (
                <div className="stone-card arena-border p-6 text-center">
                  <p className="text-arena-green font-arena text-sm tracking-wider mb-2">PAID ON MONAD — INSTANTLY</p>
                  <a
                    href={`https://testnet.monadexplorer.com/tx/${payoutTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cream-dim/40 hover:text-gold text-xs font-mono break-all underline transition-colors"
                  >
                    {payoutTxHash}
                  </a>
                </div>
              )}

              {error && <p className="text-arena-red text-sm text-center">{error}</p>}

              <button onClick={() => { setPhase("setup"); setGameId(null); setQuestions([]); setLeaderboard([]); setPayouts([]); setPayoutTxHash(null); }} className="btn-gold w-full py-4">
                NEW ARENA
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
