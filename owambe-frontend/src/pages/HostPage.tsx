import { useState, useEffect, useCallback, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ethers } from "ethers";
import { useWallet } from "../hooks/useWallet";
import { useContract } from "../hooks/useContract";
import { WalletButton } from "../components/WalletButton";
import { VoiceInput } from "../components/VoiceInput";
import { generateQuestions } from "../utils/groq";
import type { TriviaQuestion } from "../utils/groq";

type GamePhase = "setup" | "lobby" | "playing" | "results";

export function HostPage() {
  const wallet = useWallet();
  const contract = useContract(wallet.signer);

  // Setup
  const [topic, setTopic] = useState("");
  const [prizePool, setPrizePool] = useState("0.05");
  const [entryFee, setEntryFee] = useState("0.01");
  const [questionCount, setQuestionCount] = useState(3);

  // Game state
  const [phase, setPhase] = useState<GamePhase>("setup");
  const [gameId, setGameId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<TriviaQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [timer, setTimer] = useState(15);
  const [players, setPlayers] = useState<string[]>([]);

  // Player answers (stored in localStorage for sync)
  const [playerAnswers, setPlayerAnswers] = useState<Record<string, Record<number, { answer: string; time: number }>>>({});

  // Results
  const [payoutTxHash, setPayoutTxHash] = useState<string | null>(null);
  const [payouts, setPayouts] = useState<{ player: string; amount: bigint; rank: number }[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});

  // Loading states
  const [creating, setCreating] = useState(false);
  const [generatingQ, setGeneratingQ] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll for players in lobby
  useEffect(() => {
    if (phase !== "lobby" || !gameId) return;

    const poll = setInterval(async () => {
      try {
        const info = await contract.getGameInfo(gameId);
        setPlayers(info.players);
      } catch {
        // ignore polling errors
      }
    }, 2000);

    return () => clearInterval(poll);
  }, [phase, gameId, contract]);

  // Poll for player answers during game
  useEffect(() => {
    if (phase !== "playing" || !gameId) return;

    const poll = setInterval(() => {
      try {
        const stored = localStorage.getItem(`owambe_answers_${gameId}`);
        if (stored) {
          setPlayerAnswers(JSON.parse(stored));
        }
      } catch {
        // ignore
      }
    }, 1000);

    return () => clearInterval(poll);
  }, [phase, gameId]);

  // Countdown timer
  useEffect(() => {
    if (phase !== "playing") return;

    setTimer(15);
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, currentQ]);

  // Auto-advance when timer hits 0
  useEffect(() => {
    if (timer === 0 && phase === "playing") {
      if (currentQ < questions.length - 1) {
        setCurrentQ((prev) => prev + 1);
      } else {
        handleGameEnd();
      }
    }
  }, [timer]);

  const handleCreateGame = async () => {
    if (!topic.trim()) {
      setError("Enter a topic for the trivia");
      return;
    }
    setError(null);
    setCreating(true);

    try {
      // Generate questions first
      setGeneratingQ(true);
      const qs = await generateQuestions(topic, questionCount);
      setQuestions(qs);
      setGeneratingQ(false);

      // Create game on-chain
      const result = await contract.createGame(prizePool, entryFee);
      setGameId(result.gameId);

      // Store questions in localStorage for players to read
      localStorage.setItem(`owambe_questions_${result.gameId}`, JSON.stringify(qs));
      localStorage.setItem(`owambe_game_phase_${result.gameId}`, "lobby");
      localStorage.setItem(`owambe_current_q_${result.gameId}`, "0");

      setPhase("lobby");
    } catch (err: any) {
      setError(err.message || "Failed to create game");
      setGeneratingQ(false);
    } finally {
      setCreating(false);
    }
  };

  const handleStartGame = async () => {
    if (!gameId) return;
    setError(null);

    try {
      await contract.startGame(gameId);
      localStorage.setItem(`owambe_game_phase_${gameId}`, "playing");
      localStorage.setItem(`owambe_current_q_${gameId}`, "0");
      setPhase("playing");
      setCurrentQ(0);
    } catch (err: any) {
      setError(err.message || "Failed to start game");
    }
  };

  const handleNextQuestion = () => {
    if (currentQ < questions.length - 1) {
      const next = currentQ + 1;
      setCurrentQ(next);
      localStorage.setItem(`owambe_current_q_${gameId}`, String(next));
    } else {
      handleGameEnd();
    }
  };

  const handleGameEnd = useCallback(async () => {
    if (!gameId) return;

    localStorage.setItem(`owambe_game_phase_${gameId}`, "results");

    // Calculate scores from playerAnswers
    const stored = localStorage.getItem(`owambe_answers_${gameId}`);
    const allAnswers = stored ? JSON.parse(stored) : playerAnswers;

    const calculatedScores: Record<string, number> = {};
    const totalTimes: Record<string, number> = {};

    for (const player of players) {
      calculatedScores[player] = 0;
      totalTimes[player] = 0;
      const pAnswers = allAnswers[player.toLowerCase()] || {};

      for (let i = 0; i < questions.length; i++) {
        const pa = pAnswers[i];
        if (pa && pa.answer === questions[i].answer) {
          calculatedScores[player]++;
        }
        if (pa) {
          totalTimes[player] += pa.time || 15000;
        } else {
          totalTimes[player] += 15000; // max time if no answer
        }
      }
    }

    setScores(calculatedScores);

    // Sort by score desc, then by time asc (faster = better)
    const sortedPlayers = [...players].sort((a, b) => {
      const scoreDiff = (calculatedScores[b] || 0) - (calculatedScores[a] || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return (totalTimes[a] || 0) - (totalTimes[b] || 0);
    });

    const sortedScores = sortedPlayers.map((p) => calculatedScores[p] || 0);

    // Store results for players
    localStorage.setItem(`owambe_results_${gameId}`, JSON.stringify({ sortedPlayers, scores: calculatedScores }));

    setPhase("results");

    // Record scores and payout on-chain
    setPaying(true);
    try {
      const result = await contract.recordScores(gameId, sortedPlayers, sortedScores);
      setPayoutTxHash(result.txHash);
      setPayouts(result.payouts);

      localStorage.setItem(`owambe_payout_${gameId}`, JSON.stringify({
        txHash: result.txHash,
        payouts: result.payouts.map((p: any) => ({ ...p, amount: p.amount.toString() })),
      }));
    } catch (err: any) {
      setError(err.message || "Payout failed");
    } finally {
      setPaying(false);
    }
  }, [gameId, players, questions, playerAnswers, contract]);

  const joinUrl = gameId ? `${window.location.origin}/join?game=${gameId}` : "";

  // ── Render ──────────────────────────────────────────

  return (
    <div className="min-h-screen p-4 md:p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl md:text-4xl font-bold">
          <span className="text-purple-400">OWA</span>
          <span className="text-gold">MBE</span>
        </h1>
        <WalletButton
          address={wallet.address}
          connecting={wallet.connecting}
          onConnect={wallet.connect}
          onDisconnect={wallet.disconnect}
          error={wallet.error}
        />
      </div>

      {!wallet.address ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <h2 className="text-2xl md:text-4xl font-bold mb-4">Host a Trivia Game</h2>
          <p className="text-purple-300 mb-8">Connect your wallet to get started</p>
        </div>
      ) : phase === "setup" ? (
        /* ── SETUP PHASE ── */
        <div className="max-w-lg mx-auto space-y-6">
          <h2 className="text-2xl font-bold text-center mb-6">Create New Game</h2>

          {/* Topic */}
          <div>
            <label className="block text-purple-300 text-sm mb-2">Topic</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder='e.g. "Afrobeats music" or "Nigerian history"'
                className="flex-1 bg-purple-900/50 border border-purple-500/30 rounded-xl px-4 py-3 text-white placeholder-purple-500 focus:outline-none focus:border-purple-400"
              />
              <VoiceInput onResult={(text) => setTopic(text)} />
            </div>
          </div>

          {/* Prize Pool */}
          <div>
            <label className="block text-purple-300 text-sm mb-2">Prize Pool (MON)</label>
            <input
              type="number"
              value={prizePool}
              onChange={(e) => setPrizePool(e.target.value)}
              step="0.01"
              min="0.01"
              className="w-full bg-purple-900/50 border border-purple-500/30 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-400"
            />
          </div>

          {/* Entry Fee */}
          <div>
            <label className="block text-purple-300 text-sm mb-2">Entry Fee (MON)</label>
            <input
              type="number"
              value={entryFee}
              onChange={(e) => setEntryFee(e.target.value)}
              step="0.001"
              min="0"
              className="w-full bg-purple-900/50 border border-purple-500/30 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-400"
            />
          </div>

          {/* Question Count */}
          <div>
            <label className="block text-purple-300 text-sm mb-2">Number of Questions</label>
            <select
              value={questionCount}
              onChange={(e) => setQuestionCount(Number(e.target.value))}
              className="w-full bg-purple-900/50 border border-purple-500/30 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-400"
            >
              <option value={2}>2 Questions</option>
              <option value={3}>3 Questions (Recommended)</option>
              <option value={5}>5 Questions</option>
            </select>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            onClick={handleCreateGame}
            disabled={creating || !topic.trim()}
            className="w-full bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 disabled:from-purple-800 disabled:to-purple-800 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl text-lg transition-all cursor-pointer"
          >
            {generatingQ ? "Generating Questions..." : creating ? "Creating Game On-Chain..." : "Create Game"}
          </button>
        </div>
      ) : phase === "lobby" ? (
        /* ── LOBBY PHASE ── */
        <div className="max-w-lg mx-auto space-y-6 text-center">
          <h2 className="text-2xl font-bold">Game #{gameId} — Waiting for Players</h2>

          <div className="bg-purple-900/30 border border-purple-500/20 rounded-2xl p-6">
            <p className="text-purple-300 mb-4">Scan to join</p>
            <div className="inline-block bg-white p-4 rounded-xl">
              <QRCodeSVG value={joinUrl} size={200} />
            </div>
            <p className="text-purple-400 text-sm mt-4 font-mono break-all">{joinUrl}</p>
          </div>

          <div className="bg-purple-900/30 border border-purple-500/20 rounded-2xl p-6">
            <div className="flex justify-between text-sm text-purple-300 mb-2">
              <span>Prize Pool</span>
              <span className="text-gold font-bold">{prizePool} MON</span>
            </div>
            <div className="flex justify-between text-sm text-purple-300">
              <span>Entry Fee</span>
              <span className="text-white">{entryFee} MON</span>
            </div>
          </div>

          <div className="bg-purple-900/30 border border-purple-500/20 rounded-2xl p-6">
            <h3 className="text-lg font-semibold mb-3">Players ({players.length})</h3>
            {players.length === 0 ? (
              <p className="text-purple-500">Waiting for players to join...</p>
            ) : (
              <ul className="space-y-2">
                {players.map((p, i) => (
                  <li key={p} className="flex items-center gap-3 bg-purple-800/30 rounded-lg px-4 py-2">
                    <span className="text-gold font-bold">#{i + 1}</span>
                    <span className="font-mono text-sm">{p.slice(0, 6)}...{p.slice(-4)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            onClick={handleStartGame}
            disabled={players.length === 0}
            className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl text-lg transition-all cursor-pointer"
          >
            {players.length === 0 ? "Need at least 1 player" : `Start Game (${players.length} players)`}
          </button>
        </div>
      ) : phase === "playing" ? (
        /* ── PLAYING PHASE ── */
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">
              Question {currentQ + 1} / {questions.length}
            </h2>
            <div
              className={`text-4xl font-bold tabular-nums ${
                timer <= 5 ? "text-red-400 animate-countdown" : "text-gold"
              }`}
            >
              {timer}s
            </div>
          </div>

          {questions[currentQ] && (
            <div className="bg-purple-900/30 border border-purple-500/20 rounded-2xl p-8">
              <h3 className="text-xl md:text-2xl font-semibold mb-6">{questions[currentQ].question}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(["A", "B", "C", "D"] as const).map((key) => (
                  <div
                    key={key}
                    className="bg-purple-800/40 border border-purple-500/20 rounded-xl px-5 py-4 text-left"
                  >
                    <span className="text-gold font-bold mr-3">{key}.</span>
                    {questions[currentQ].options[key]}
                  </div>
                ))}
              </div>
              <p className="text-green-400 text-sm mt-4">
                Answer: <span className="font-bold">{questions[currentQ].answer}</span> — {questions[currentQ].options[questions[currentQ].answer]}
              </p>
            </div>
          )}

          {/* Players who answered */}
          <div className="bg-purple-900/30 border border-purple-500/20 rounded-2xl p-4">
            <h4 className="text-sm text-purple-300 mb-2">
              Answers received: {Object.keys(playerAnswers).filter((p) => playerAnswers[p]?.[currentQ]).length} / {players.length}
            </h4>
          </div>

          <button
            onClick={handleNextQuestion}
            className="w-full bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white font-bold py-4 rounded-xl text-lg transition-all cursor-pointer"
          >
            {currentQ < questions.length - 1 ? "Next Question" : "End Game & Pay Winners"}
          </button>
        </div>
      ) : (
        /* ── RESULTS PHASE ── */
        <div className="max-w-lg mx-auto space-y-6 text-center">
          <h2 className="text-3xl font-bold mb-2">Game Over!</h2>

          {paying ? (
            <div className="bg-purple-900/30 border border-purple-500/20 rounded-2xl p-8">
              <div className="animate-spin w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-purple-300">Recording scores & paying winners on Monad...</p>
            </div>
          ) : (
            <>
              {/* Leaderboard */}
              <div className="bg-purple-900/30 border border-purple-500/20 rounded-2xl p-6">
                <h3 className="text-xl font-bold mb-4">Leaderboard</h3>
                {players
                  .sort((a, b) => (scores[b] || 0) - (scores[a] || 0))
                  .map((player, i) => {
                    const payout = payouts.find((p) => p.player.toLowerCase() === player.toLowerCase());
                    const medals = ["1st", "2nd", "3rd"];
                    const colors = ["text-gold", "text-gray-300", "text-amber-600"];
                    return (
                      <div
                        key={player}
                        className={`flex items-center justify-between py-3 px-4 rounded-lg mb-2 ${
                          i < 3 ? "bg-purple-800/40 border border-purple-500/20" : "bg-purple-900/20"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`font-bold text-lg ${colors[i] || "text-purple-400"}`}>
                            {i < 3 ? medals[i] : `#${i + 1}`}
                          </span>
                          <span className="font-mono text-sm">{player.slice(0, 6)}...{player.slice(-4)}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-white font-bold">{scores[player] || 0} pts</span>
                          {payout && (
                            <span className="text-gold ml-3 font-bold">
                              +{ethers.formatEther(payout.amount)} MON
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Transaction Hash */}
              {payoutTxHash && (
                <div className="bg-green-900/20 border border-green-500/30 rounded-2xl p-6">
                  <p className="text-green-400 font-semibold mb-2">Paid on Monad — Instantly.</p>
                  <a
                    href={`https://testnet.monadexplorer.com/tx/${payoutTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-300 hover:text-white text-sm font-mono break-all underline"
                  >
                    {payoutTxHash}
                  </a>
                </div>
              )}

              {error && <p className="text-red-400 text-sm">{error}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
