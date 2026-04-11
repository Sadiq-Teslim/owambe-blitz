import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { ethers } from "ethers";
import { useWallet } from "../hooks/useWallet";
import { useContract } from "../hooks/useContract";
import { WalletButton } from "../components/WalletButton";
import type { TriviaQuestion } from "../utils/groq";

type PlayerPhase = "join" | "waiting" | "playing" | "results";

export function PlayerPage() {
  const [searchParams] = useSearchParams();
  const gameIdParam = searchParams.get("game");
  const gameId = gameIdParam ? Number(gameIdParam) : null;

  const wallet = useWallet();
  const contract = useContract(wallet.signer);

  const [phase, setPhase] = useState<PlayerPhase>("join");
  const [gameInfo, setGameInfo] = useState<{
    host: string;
    prizePool: bigint;
    entryFee: bigint;
    state: number;
    playerCount: number;
  } | null>(null);
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Game
  const [questions, setQuestions] = useState<TriviaQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [timer, setTimer] = useState(15);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [myAnswers, setMyAnswers] = useState<Record<number, { answer: string; time: number }>>({});
  const [score, setScore] = useState(0);

  // Results
  const [results, setResults] = useState<{ sortedPlayers: string[]; scores: Record<string, number> } | null>(null);
  const [payoutInfo, setPayoutInfo] = useState<{ txHash: string; payouts: { player: string; amount: string; rank: number }[] } | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const questionStartTime = useRef<number>(Date.now());

  // Load game info
  useEffect(() => {
    if (!gameId || !wallet.signer) return;

    const load = async () => {
      try {
        const info = await contract.getGameInfo(gameId);
        setGameInfo(info);

        // Check if already joined
        const address = await wallet.signer!.getAddress();
        const alreadyJoined = info.players.some(
          (p: string) => p.toLowerCase() === address.toLowerCase()
        );
        if (alreadyJoined) {
          setJoined(true);
          if (info.state === 0) setPhase("waiting");
          else if (info.state === 1) setPhase("playing");
          else if (info.state === 2) setPhase("results");
        }
      } catch (err: any) {
        setError("Could not load game info");
      }
    };

    load();
  }, [gameId, wallet.signer, contract]);

  // Poll for game phase changes (waiting → playing → results)
  useEffect(() => {
    if (!gameId || !joined) return;

    const poll = setInterval(() => {
      // Check localStorage for phase changes from host
      const storedPhase = localStorage.getItem(`owambe_game_phase_${gameId}`);
      if (storedPhase === "playing" && phase === "waiting") {
        const qs = localStorage.getItem(`owambe_questions_${gameId}`);
        if (qs) {
          setQuestions(JSON.parse(qs));
          setPhase("playing");
          setCurrentQ(0);
          questionStartTime.current = Date.now();
        }
      }

      if (storedPhase === "playing") {
        const cq = localStorage.getItem(`owambe_current_q_${gameId}`);
        if (cq !== null) {
          const newQ = Number(cq);
          if (newQ !== currentQ) {
            setCurrentQ(newQ);
            setSelectedAnswer(null);
            setTimer(15);
            questionStartTime.current = Date.now();
          }
        }
      }

      if (storedPhase === "results" && phase !== "results") {
        const res = localStorage.getItem(`owambe_results_${gameId}`);
        if (res) setResults(JSON.parse(res));
        const pay = localStorage.getItem(`owambe_payout_${gameId}`);
        if (pay) setPayoutInfo(JSON.parse(pay));
        setPhase("results");
      }
    }, 1000);

    return () => clearInterval(poll);
  }, [gameId, joined, phase, currentQ]);

  // Countdown timer during playing
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

  const handleJoin = async () => {
    if (!gameId || !gameInfo) return;
    setJoining(true);
    setError(null);

    try {
      await contract.joinGame(gameId, gameInfo.entryFee);
      setJoined(true);
      setPhase("waiting");
    } catch (err: any) {
      setError(err.reason || err.message || "Failed to join game");
    } finally {
      setJoining(false);
    }
  };

  const handleAnswer = (answer: string) => {
    if (selectedAnswer) return; // already answered this question

    const timeTaken = Date.now() - questionStartTime.current;
    setSelectedAnswer(answer);

    const updatedAnswers = { ...myAnswers, [currentQ]: { answer, time: timeTaken } };
    setMyAnswers(updatedAnswers);

    // Check if correct
    if (questions[currentQ] && answer === questions[currentQ].answer) {
      setScore((prev) => prev + 1);
    }

    // Store in localStorage for host to read
    if (gameId && wallet.address) {
      const storageKey = `owambe_answers_${gameId}`;
      const existing = localStorage.getItem(storageKey);
      const allAnswers = existing ? JSON.parse(existing) : {};
      allAnswers[wallet.address.toLowerCase()] = updatedAnswers;
      localStorage.setItem(storageKey, JSON.stringify(allAnswers));
    }
  };

  // ── Render ──────────────────────────────────────────

  if (!gameId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">
            <span className="text-purple-400">OWA</span>
            <span className="text-gold">MBE</span>
          </h1>
          <p className="text-purple-300">No game ID provided. Scan a QR code to join a game.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">
          <span className="text-purple-400">OWA</span>
          <span className="text-gold">MBE</span>
          <span className="text-purple-500 text-sm ml-2">Game #{gameId}</span>
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
          <h2 className="text-2xl font-bold mb-4">Join Trivia Game #{gameId}</h2>
          <p className="text-purple-300 mb-8">Connect your wallet to play</p>
        </div>
      ) : phase === "join" ? (
        /* ── JOIN PHASE ── */
        <div className="max-w-md mx-auto space-y-6 text-center">
          <h2 className="text-2xl font-bold">Join Game #{gameId}</h2>

          {gameInfo && (
            <div className="bg-purple-900/30 border border-purple-500/20 rounded-2xl p-6 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-purple-300">Prize Pool</span>
                <span className="text-gold font-bold">{ethers.formatEther(gameInfo.prizePool)} MON</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-purple-300">Entry Fee</span>
                <span className="text-white font-bold">{ethers.formatEther(gameInfo.entryFee)} MON</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-purple-300">Players</span>
                <span className="text-white">{gameInfo.playerCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-purple-300">Split</span>
                <span className="text-white">1st: 60% | 2nd: 30% | 3rd: 10%</span>
              </div>
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            onClick={handleJoin}
            disabled={joining || !gameInfo}
            className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl text-lg transition-all cursor-pointer"
          >
            {joining
              ? "Joining..."
              : gameInfo
              ? `Join Game — Pay ${ethers.formatEther(gameInfo.entryFee)} MON`
              : "Loading game..."}
          </button>
        </div>
      ) : phase === "waiting" ? (
        /* ── WAITING PHASE ── */
        <div className="max-w-md mx-auto text-center space-y-6">
          <div className="animate-spin w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full mx-auto" />
          <h2 className="text-2xl font-bold">You're In!</h2>
          <p className="text-purple-300">Waiting for the host to start the game...</p>
          <div className="bg-purple-900/30 border border-purple-500/20 rounded-2xl p-6">
            <p className="text-purple-400 text-sm">Get ready. Questions are coming.</p>
          </div>
        </div>
      ) : phase === "playing" ? (
        /* ── PLAYING PHASE ── */
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold">
                Q{currentQ + 1} / {questions.length}
              </h2>
              <p className="text-purple-400 text-sm">Score: {score}</p>
            </div>
            <div
              className={`text-5xl font-bold tabular-nums ${
                timer <= 5 ? "text-red-400 animate-countdown" : "text-gold"
              }`}
            >
              {timer}
            </div>
          </div>

          {questions[currentQ] && (
            <div className="space-y-4">
              <div className="bg-purple-900/30 border border-purple-500/20 rounded-2xl p-6">
                <h3 className="text-lg md:text-xl font-semibold">{questions[currentQ].question}</h3>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {(["A", "B", "C", "D"] as const).map((key) => {
                  const isSelected = selectedAnswer === key;
                  const isCorrect = selectedAnswer && key === questions[currentQ].answer;
                  const isWrong = isSelected && key !== questions[currentQ].answer;

                  return (
                    <button
                      key={key}
                      onClick={() => handleAnswer(key)}
                      disabled={!!selectedAnswer || timer === 0}
                      className={`text-left px-5 py-4 rounded-xl border transition-all cursor-pointer ${
                        isCorrect
                          ? "bg-green-600/30 border-green-500 text-green-300"
                          : isWrong
                          ? "bg-red-600/30 border-red-500 text-red-300"
                          : isSelected
                          ? "bg-purple-600/50 border-purple-400"
                          : "bg-purple-800/40 border-purple-500/20 hover:border-purple-400 hover:bg-purple-700/40"
                      } ${!!selectedAnswer || timer === 0 ? "cursor-not-allowed" : ""}`}
                    >
                      <span className="text-gold font-bold mr-3">{key}.</span>
                      {questions[currentQ].options[key]}
                    </button>
                  );
                })}
              </div>

              {selectedAnswer && (
                <p className={`text-center font-semibold ${selectedAnswer === questions[currentQ].answer ? "text-green-400" : "text-red-400"}`}>
                  {selectedAnswer === questions[currentQ].answer ? "Correct!" : `Wrong! Answer: ${questions[currentQ].answer}`}
                </p>
              )}

              {timer === 0 && !selectedAnswer && (
                <p className="text-center text-red-400 font-semibold">Time's up!</p>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ── RESULTS PHASE ── */
        <div className="max-w-md mx-auto text-center space-y-6">
          <h2 className="text-3xl font-bold">Game Over!</h2>
          <p className="text-purple-300">
            Your Score: <span className="text-gold font-bold text-2xl">{score}</span> / {questions.length}
          </p>

          {results && (
            <div className="bg-purple-900/30 border border-purple-500/20 rounded-2xl p-6">
              <h3 className="text-xl font-bold mb-4">Leaderboard</h3>
              {results.sortedPlayers.map((player, i) => {
                const payout = payoutInfo?.payouts.find(
                  (p) => p.player.toLowerCase() === player.toLowerCase()
                );
                const medals = ["1st", "2nd", "3rd"];
                const colors = ["text-gold", "text-gray-300", "text-amber-600"];
                const isMe = wallet.address?.toLowerCase() === player.toLowerCase();

                return (
                  <div
                    key={player}
                    className={`flex items-center justify-between py-3 px-4 rounded-lg mb-2 ${
                      isMe ? "bg-purple-600/30 border border-purple-400" : "bg-purple-800/20"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`font-bold ${colors[i] || "text-purple-400"}`}>
                        {i < 3 ? medals[i] : `#${i + 1}`}
                      </span>
                      <span className="font-mono text-sm">
                        {player.slice(0, 6)}...{player.slice(-4)}
                        {isMe && <span className="text-purple-300 ml-1">(You)</span>}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-white font-bold">{results.scores[player] || 0} pts</span>
                      {payout && (
                        <span className="text-gold ml-2 font-bold">
                          +{ethers.formatEther(BigInt(payout.amount))} MON
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {payoutInfo?.txHash && (
            <div className="bg-green-900/20 border border-green-500/30 rounded-2xl p-6">
              <p className="text-green-400 font-semibold mb-2">Paid on Monad — Instantly.</p>
              <a
                href={`https://testnet.monadexplorer.com/tx/${payoutInfo.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-300 hover:text-white text-sm font-mono break-all underline"
              >
                {payoutInfo.txHash}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
