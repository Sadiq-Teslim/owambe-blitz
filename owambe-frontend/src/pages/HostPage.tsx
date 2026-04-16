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
import { TOKEN_ADDRESSES } from "../utils/contract";

type GamePhase = "setup" | "lobby" | "playing" | "results";

interface LeaderboardEntry {
  rank: number;
  email: string;
  walletAddress?: string | null;
  score: number;
  totalTime: number;
}

interface CustomQuestion {
  question: string;
  options: { A: string; B: string; C: string; D: string };
  answer: "A" | "B" | "C" | "D";
}

const HOST_STORAGE_KEY = "owambe_host_state";

interface HostSavedState {
  phase: GamePhase;
  gameId: string | null;
  questions: any[];
  topic: string;
  prizePool: string;
  splitType: "default" | "custom";
  customSplits: string;
  questionCount: number;
  tokenSymbol: string;
  leaderboard: LeaderboardEntry[];
  payoutTxHash: string | null;
  // payouts stored as string amounts (bigint not JSON-serializable)
  payoutsSerialized: { player: string; amount: string; rank: number }[];
}

function loadHostState(): Partial<HostSavedState> {
  try {
    const raw = localStorage.getItem(HOST_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch { return {}; }
}

function saveHostState(state: HostSavedState) {
  try { localStorage.setItem(HOST_STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

function clearHostState() {
  try { localStorage.removeItem(HOST_STORAGE_KEY); } catch { /* ignore */ }
}

export function HostPage() {
  const wallet = useWallet();
  const contract = useContract(wallet.signer);

  const saved = useRef(loadHostState()).current;

  // Setup
  const [topic, setTopic] = useState(saved.topic || "");
  const [prizePool, setPrizePool] = useState(saved.prizePool || "0.05");
  const [questionCount, setQuestionCount] = useState(saved.questionCount || 3);
  const [splitType, setSplitType] = useState<"default" | "custom">(saved.splitType || "default");
  const [customSplits, setCustomSplits] = useState(saved.customSplits || "60,30,10");
  const [inputMode, setInputMode] = useState<"voice" | "manual">("voice");
  const [questionMode, setQuestionMode] = useState<"ai" | "custom">("ai");
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>([]);
  const [tokenSymbol, setTokenSymbol] = useState(saved.tokenSymbol || "ETH");

  // Game state
  const [phase, setPhase] = useState<GamePhase>(saved.phase || "setup");
  const [gameId, setGameId] = useState<string | null>(saved.gameId || null);
  const [questions, setQuestions] = useState<any[]>(saved.questions || []);
  const [currentQ, setCurrentQ] = useState(0);
  const [timer, setTimer] = useState(7);
  const [gameData, setGameData] = useState<any>(null);

  // Results
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(saved.leaderboard || []);
  const [payoutTxHash, setPayoutTxHash] = useState<string | null>(saved.payoutTxHash || null);
  const [payouts, setPayouts] = useState<{ player: string; amount: bigint; rank: number }[]>(
    (saved.payoutsSerialized || []).map((p) => ({ ...p, amount: BigInt(p.amount) }))
  );
  const [showConfetti, setShowConfetti] = useState(false);

  // Loading
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const payoutTriggered = useRef(!!saved.payoutTxHash);

  const sharePercentages = splitType === "default"
    ? [60, 30, 10]
    : customSplits.split(",").map((s) => Number(s.trim()));

  // Persist state to localStorage on key changes
  useEffect(() => {
    if (phase === "setup" && !gameId) return; // Don't save empty setup
    saveHostState({
      phase, gameId, questions, topic, prizePool, splitType, customSplits,
      questionCount, tokenSymbol, leaderboard, payoutTxHash,
      payoutsSerialized: payouts.map((p) => ({ ...p, amount: p.amount.toString() })),
    });
  }, [phase, gameId, questions, topic, prizePool, splitType, customSplits, questionCount, tokenSymbol, leaderboard, payoutTxHash, payouts]);

  // Poll game state — auto-advance is server-side, we just read it
  useEffect(() => {
    if (!gameId || phase === "setup") return;
    const poll = setInterval(async () => {
      try {
        const data = await api.getGame(gameId);
        setGameData(data);

        if (data.phase === "active") {
          if (data.currentQuestion !== undefined) {
            setCurrentQ(data.currentQuestion.index ?? data.currentQuestion);
          }
        }

        if (data.phase === "finished" && phase === "playing") {
          // Game just ended — fetch leaderboard
          const lb = await api.getLeaderboard(gameId);
          setLeaderboard(lb.leaderboard);
          setPhase("results");
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 5000);
        }
      } catch { /* ignore */ }
    }, 1500);
    return () => clearInterval(poll);
  }, [gameId, phase]);

  // In results phase, poll for winner wallet claims and auto-pay immediately
  useEffect(() => {
    if (phase !== "results" || !gameId || payoutTriggered.current || payoutTxHash) return;
    const poll = setInterval(async () => {
      try {
        const data = await api.getWinners(gameId);
        // Pay as soon as ANY winner has submitted a wallet
        const claimedWinners = data.winners.filter((w: any) => w.walletAddress);
        if (claimedWinners.length > 0 && !payoutTriggered.current) {
          payoutTriggered.current = true;
          clearInterval(poll);
          await triggerPayout(claimedWinners);
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(poll);
  }, [phase, gameId, payoutTxHash]);

  // Countdown timer — syncs with server questionStartedAt
  useEffect(() => {
    if (phase !== "playing") return;

    if (timerRef.current) clearInterval(timerRef.current);

    const updateTimer = () => {
      if (gameData?.currentQuestion?.startedAt) {
        const elapsed = (Date.now() - gameData.currentQuestion.startedAt) / 1000;
        const remaining = Math.max(0, 7 - Math.floor(elapsed));
        setTimer(remaining);
      }
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, gameData?.currentQuestion?.index]);

  const triggerPayout = async (winners: { email: string; walletAddress: string | null; rank: number }[]) => {
    setPaying(true);
    setError(null);
    try {
      const wallets = winners
        .filter((w) => w.walletAddress)
        .map((w) => ethers.getAddress(w.walletAddress!));

      if (wallets.length === 0) {
        setError("No winners have submitted wallet addresses yet");
        setPaying(false);
        return;
      }

      const result = await contract.payoutWinners(Number(gameId), wallets);
      setPayoutTxHash(result.txHash);
      setPayouts(result.payouts);
      // Save tx hash to backend so players can detect payout
      try { await api.savePayoutTx(gameId!, result.txHash); } catch { /* non-critical */ }
    } catch (err: any) {
      setError(err.reason || err.message || "Payout failed");
      payoutTriggered.current = false; // Allow retry
    } finally {
      setPaying(false);
    }
  };

  const handleVoiceConfig = (config: { topic: string; prizePool: string; questionCount: number; sharePercentages: number[] }) => {
    setTopic(config.topic);
    setPrizePool(config.prizePool);
    setQuestionCount(config.questionCount);
    if (JSON.stringify(config.sharePercentages) !== JSON.stringify([60, 30, 10])) {
      setSplitType("custom");
      setCustomSplits(config.sharePercentages.join(","));
    }
    setInputMode("manual");
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
    if (questionMode === "custom") {
      if (customQuestions.length === 0) { setError("Add at least one question"); return; }
      for (const q of customQuestions) {
        if (!q.question || !q.options.A || !q.options.B || !q.options.C || !q.options.D || !q.answer) {
          setError("All custom questions must be fully filled out");
          return;
        }
      }
    }

    setError(null);
    setCreating(true);
    try {
      const chainResult = await contract.createGame(prizePool, sharePercentages, tokenSymbol);
      const backendResult = await api.createGame({
        gameId: String(chainResult.gameId),
        host: wallet.address!,
        topic,
        prizePool,
        sharePercentages,
        questionCount,
        ...(questionMode === "custom" ? { customQuestions } : {}),
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
      await api.startGame(gameId, wallet.address!);
      setPhase("playing");
      setCurrentQ(0);
    } catch (err: any) {
      setError(err.reason || err.message || "Failed to start");
    }
  };

  // Custom question helpers
  const addCustomQuestion = () => {
    setCustomQuestions([...customQuestions, { question: "", options: { A: "", B: "", C: "", D: "" }, answer: "A" }]);
  };

  const updateCustomQuestion = (index: number, field: string, value: string) => {
    const updated = [...customQuestions];
    if (field === "question") updated[index].question = value;
    else if (field === "answer") updated[index].answer = value as "A" | "B" | "C" | "D";
    else if (field.startsWith("option_")) {
      const key = field.replace("option_", "") as "A" | "B" | "C" | "D";
      updated[index].options[key] = value;
    }
    setCustomQuestions(updated);
  };

  const removeCustomQuestion = (index: number) => {
    setCustomQuestions(customQuestions.filter((_, i) => i !== index));
  };

  const joinUrl = gameId ? `${window.location.origin}/join?game=${gameId}` : "";
  const playerCount = gameData?.playerCount || 0;
  const playerList = gameData?.players || [];

  const handleShare = async () => {
    if (!joinUrl) return;
    if (navigator.share) {
      await navigator.share({ title: "Join my OWAMBE trivia!", text: `Join the arena! Prize pool: ${prizePool} ${tokenSymbol}`, url: joinUrl });
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
            <p className="text-white/80 text-sm mb-6">Connect your wallet to create a trivia game and fund the prize pool.</p>
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
            <p className="text-white text-sm">Speak your game into existence, or type it out</p>
          </div>

          {/* Mode toggle */}
          <div className="flex justify-center gap-2 mb-6">
            <button
              onClick={() => setInputMode("voice")}
              className={`px-4 py-2 rounded-lg text-sm font-arena tracking-wider transition-all cursor-pointer ${
                inputMode === "voice" ? "bg-gold/15 text-gold border border-gold/30" : "text-white/70 border border-transparent hover:text-white"
              }`}
            >
              VOICE
            </button>
            <button
              onClick={() => setInputMode("manual")}
              className={`px-4 py-2 rounded-lg text-sm font-arena tracking-wider transition-all cursor-pointer ${
                inputMode === "manual" ? "bg-gold/15 text-gold border border-gold/30" : "text-white/70 border border-transparent hover:text-white"
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
                <label className="block text-white text-xs font-arena tracking-wider mb-2">TOPIC</label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder='e.g. "Afrobeats legends", "Nigerian history"'
                  className="w-full bg-arena-stone border border-arena-border rounded-lg px-4 py-3 text-cream placeholder-cream/20 focus:outline-none focus:border-gold/50 transition-colors"
                />
              </div>

              {/* Token Selection */}
              <div>
                <label className="block text-white text-xs font-arena tracking-wider mb-2">CURRENCY</label>
                <div className="flex gap-2">
                  {Object.keys(TOKEN_ADDRESSES).map((sym) => (
                    <button
                      key={sym}
                      onClick={() => setTokenSymbol(sym)}
                      className={`flex-1 py-2 rounded-lg text-xs font-arena tracking-wider transition-all cursor-pointer ${
                        tokenSymbol === sym
                          ? "bg-gold/15 text-gold border border-gold/40"
                          : "bg-arena-stone border border-arena-border text-white/70"
                      }`}
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </div>

              {/* Prize Pool */}
              <div>
                <label className="block text-white text-xs font-arena tracking-wider mb-2">PRIZE POOL ({tokenSymbol})</label>
                <input
                  type="number"
                  value={prizePool}
                  onChange={(e) => setPrizePool(e.target.value)}
                  step={tokenSymbol === "ETH" ? "0.001" : "1"}
                  min={tokenSymbol === "ETH" ? "0.001" : "1"}
                  className="w-full bg-arena-stone border border-arena-border rounded-lg px-4 py-3 text-gold font-bold focus:outline-none focus:border-gold/50 transition-colors"
                />
              </div>

              {/* Question source toggle */}
              <div>
                <label className="block text-white text-xs font-arena tracking-wider mb-2">QUESTIONS</label>
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setQuestionMode("ai")}
                    className={`flex-1 py-2 rounded-lg text-xs font-arena tracking-wider transition-all cursor-pointer ${
                      questionMode === "ai"
                        ? "bg-gold/15 text-gold border border-gold/40"
                        : "bg-arena-stone border border-arena-border text-white/70"
                    }`}
                  >
                    AI GENERATED
                  </button>
                  <button
                    onClick={() => setQuestionMode("custom")}
                    className={`flex-1 py-2 rounded-lg text-xs font-arena tracking-wider transition-all cursor-pointer ${
                      questionMode === "custom"
                        ? "bg-gold/15 text-gold border border-gold/40"
                        : "bg-arena-stone border border-arena-border text-white/70"
                    }`}
                  >
                    WRITE YOUR OWN
                  </button>
                </div>
              </div>

              {questionMode === "ai" ? (
                /* AI question count */
                <div>
                  <label className="block text-white text-xs font-arena tracking-wider mb-2">NUMBER OF ROUNDS</label>
                  <input
                    type="number"
                    value={questionCount}
                    onChange={(e) => setQuestionCount(Math.max(1, Number(e.target.value)))}
                    min="1"
                    max="20"
                    className="w-full bg-arena-stone border border-arena-border rounded-lg px-4 py-3 text-cream focus:outline-none focus:border-gold/50 transition-colors"
                  />
                </div>
              ) : (
                /* Custom questions editor */
                <div className="space-y-4">
                  {customQuestions.map((q, i) => (
                    <div key={i} className="bg-arena-stone/50 rounded-lg p-4 space-y-3 border border-arena-border">
                      <div className="flex justify-between items-center">
                        <span className="text-gold font-arena text-sm">QUESTION {i + 1}</span>
                        <button onClick={() => removeCustomQuestion(i)} className="text-arena-red/60 hover:text-arena-red text-xs cursor-pointer">REMOVE</button>
                      </div>
                      <input
                        type="text"
                        value={q.question}
                        onChange={(e) => updateCustomQuestion(i, "question", e.target.value)}
                        placeholder="Type your question..."
                        className="w-full bg-arena-stone border border-arena-border rounded px-3 py-2 text-cream text-sm placeholder-cream/20 focus:outline-none focus:border-gold/50"
                      />
                      {(["A", "B", "C", "D"] as const).map((key) => (
                        <div key={key} className="flex items-center gap-2">
                          <button
                            onClick={() => updateCustomQuestion(i, "answer", key)}
                            className={`w-8 h-8 rounded text-xs font-arena font-bold flex items-center justify-center cursor-pointer transition-all ${
                              q.answer === key ? "bg-arena-green/20 text-arena-green border border-arena-green/40" : "bg-arena-stone border border-arena-border text-white/70"
                            }`}
                          >
                            {key}
                          </button>
                          <input
                            type="text"
                            value={q.options[key]}
                            onChange={(e) => updateCustomQuestion(i, `option_${key}`, e.target.value)}
                            placeholder={`Option ${key}`}
                            className="flex-1 bg-arena-stone border border-arena-border rounded px-3 py-1.5 text-cream text-sm placeholder-cream/20 focus:outline-none focus:border-gold/50"
                          />
                        </div>
                      ))}
                      <p className="text-white/60 text-xs">Click a letter to mark it as the correct answer</p>
                    </div>
                  ))}
                  <button onClick={addCustomQuestion} className="w-full py-3 rounded-lg border border-dashed border-gold/30 text-gold/60 text-sm font-arena tracking-wider hover:border-gold/60 hover:text-gold transition-all cursor-pointer">
                    + ADD QUESTION
                  </button>
                </div>
              )}

              {/* Split */}
              <div>
                <label className="block text-white text-xs font-arena tracking-wider mb-2">PRIZE SPLIT</label>
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => setSplitType("default")}
                    className={`flex-1 py-2 rounded-lg text-xs transition-all cursor-pointer ${
                      splitType === "default"
                        ? "bg-gold/15 text-gold border border-gold/40"
                        : "bg-arena-stone border border-arena-border text-white/70"
                    }`}
                  >
                    60 / 30 / 10
                  </button>
                  <button
                    onClick={() => setSplitType("custom")}
                    className={`flex-1 py-2 rounded-lg text-xs transition-all cursor-pointer ${
                      splitType === "custom"
                        ? "bg-gold/15 text-gold border border-gold/40"
                        : "bg-arena-stone border border-arena-border text-white/70"
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
            <p className="text-white text-sm">Warriors are gathering...</p>
          </div>

          {/* QR Shield */}
          <div className="stone-card arena-border arch-top p-8 flex flex-col items-center">
            <p className="text-white text-xs font-arena tracking-widest mb-4">SCAN TO ENTER — FREE</p>
            <div className="bg-cream/95 p-4 rounded-xl shadow-[0_0_40px_rgba(212,168,67,0.2)]">
              <QRCodeSVG value={joinUrl} size={180} bgColor="#f5e6c8" fgColor="#0a0a0a" />
            </div>
            <p className="text-white/60 text-xs font-mono mt-4 break-all max-w-xs text-center">{joinUrl}</p>

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
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-arena-stone border border-arena-border text-white/80 text-sm hover:text-white transition-all cursor-pointer"
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
              <p className="text-white/70 text-xs font-arena tracking-wider">PRIZE</p>
              <p className="text-gold font-bold text-lg">{prizePool} {tokenSymbol}</p>
            </div>
            <div className="w-px bg-arena-border" />
            <div>
              <p className="text-white/70 text-xs font-arena tracking-wider">SPLIT</p>
              <p className="text-cream text-sm">{sharePercentages.join(" / ")}</p>
            </div>
            <div className="w-px bg-arena-border" />
            <div>
              <p className="text-white/70 text-xs font-arena tracking-wider">ROUNDS</p>
              <p className="text-cream text-sm">{questions.length}</p>
            </div>
          </div>

          {/* Players */}
          <div className="stone-card arena-border p-5">
            <h3 className="font-arena text-sm text-gold/60 tracking-widest mb-4">
              GLADIATORS ({playerCount})
            </h3>
            {playerCount === 0 ? (
              <p className="text-white/60 text-sm text-center py-4 animate-pulse">
                Waiting for warriors to enter...
              </p>
            ) : (
              <div className="space-y-2">
                {playerList.map((p: any, i: number) => (
                  <div key={p.email} className="flex items-center gap-3 bg-arena-stone/50 rounded-lg px-4 py-2.5 animate-fade-up" style={{ animationDelay: `${i * 0.1}s` }}>
                    <span className="text-gold/60 font-arena text-xs w-6">{i + 1}.</span>
                    <span className="text-sm text-white">{p.email}</span>
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
        /* ── PLAYING PHASE — auto-advancing ── */
        <div className="animate-gate-open space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-white/70 text-xs font-arena tracking-widest">ROUND</p>
              <h2 className="font-arena text-2xl text-gold">
                {currentQ + 1} <span className="text-white/60 text-lg">OF {questions.length}</span>
              </h2>
            </div>
            <TimerRing seconds={timer} maxSeconds={7} />
          </div>

          {questions[currentQ] && (
            <div className="stone-card arena-border p-6 md:p-8">
              <h3 className="text-lg md:text-xl font-semibold text-cream leading-relaxed mb-6">
                {questions[currentQ].question}
              </h3>

              <div className="grid grid-cols-1 gap-3 stagger-children">
                {(["A", "B", "C", "D"] as const).map((key) => (
                  <div key={key} className="stone-tablet flex items-center gap-3">
                    <span className="text-gold font-arena font-bold text-lg w-8">{key}</span>
                    <span className="text-white">{questions[currentQ].options[key]}</span>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-arena-border">
                <p className="text-arena-green/80 text-xs font-arena tracking-wider">
                  CORRECT: <span className="text-arena-green font-bold">{questions[currentQ].answer}</span> — {questions[currentQ].options[questions[currentQ].answer]}
                </p>
              </div>
            </div>
          )}

          <div className="stone-card p-4 flex items-center justify-between">
            <span className="text-white/70 text-xs font-arena tracking-wider">ANSWERS RECEIVED</span>
            <span className="text-gold font-bold">
              {gameData?.players?.filter((p: any) => p.hasAnswered).length || 0} / {playerCount}
            </span>
          </div>

          <div className="text-center">
            <p className="text-white/60 text-xs font-arena tracking-wider animate-pulse">QUESTIONS AUTO-ADVANCE EVERY 7 SECONDS</p>
          </div>

          {error && <p className="text-arena-red text-sm text-center">{error}</p>}
        </div>
      ) : (
        /* ── RESULTS PHASE ── */
        <div className="animate-fade-up space-y-6">
          <div className="text-center">
            <h2 className="font-arena text-3xl text-gold tracking-wider mb-1">THE ARENA HAS SPOKEN</h2>
            <p className="text-white text-sm">Champions have been decided</p>
          </div>

          <Podium
            entries={leaderboard.slice(0, 3).map((entry, i) => ({
              address: entry.email,
              score: entry.score,
              rank: i + 1,
              winnings: payouts.find((p) => p.rank === i + 1)
                ? ethers.formatEther(payouts.find((p) => p.rank === i + 1)!.amount)
                : null,
            }))}
          />

          {leaderboard.length > 3 && (
            <div className="stone-card p-4 space-y-2">
              {leaderboard.slice(3).map((entry, i) => (
                <div key={entry.email} className="flex items-center justify-between py-2 px-3 rounded bg-arena-stone/30">
                  <div className="flex items-center gap-3">
                    <span className="text-white/60 font-arena text-xs">#{i + 4}</span>
                    <span className="text-xs text-white/80">{entry.email}</span>
                  </div>
                  <span className="text-white/70 text-sm">{entry.score} pts</span>
                </div>
              ))}
            </div>
          )}

          {/* Auto-payout status */}
          {paying && (
            <div className="stone-card arena-border p-6 text-center">
              <div className="animate-spin w-10 h-10 border-3 border-gold border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-white/80 text-sm font-arena tracking-wider">SETTLING ON BASE...</p>
            </div>
          )}

          {!payoutTxHash && !paying && (
            <div className="stone-card arena-border p-6 text-center">
              <div className="w-8 h-8 border-3 border-gold/40 border-t-gold rounded-full animate-spin mx-auto mb-4" />
              <p className="text-white/80 text-sm font-arena tracking-wider">WAITING FOR WINNERS TO CONNECT WALLETS...</p>
              <p className="text-white/60 text-xs mt-2">Payment triggers automatically once all winners claim</p>
            </div>
          )}

          {payoutTxHash && (
            <div className="stone-card arena-border p-6 text-center">
              <p className="text-arena-green font-arena text-sm tracking-wider mb-2">PAID ON BASE — INSTANTLY</p>
              <a
                href={`https://sepolia.basescan.org/tx/${payoutTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/70 hover:text-gold text-xs font-mono break-all underline transition-colors"
              >
                {payoutTxHash}
              </a>
            </div>
          )}

          {error && <p className="text-arena-red text-sm text-center">{error}</p>}

          <button onClick={() => { clearHostState(); setPhase("setup"); setGameId(null); setQuestions([]); setLeaderboard([]); setPayouts([]); setPayoutTxHash(null); payoutTriggered.current = false; setTopic(""); setPrizePool("0.05"); }} className="btn-gold w-full py-4">
            NEW ARENA
          </button>
        </div>
      )}
    </div>
  );
}
