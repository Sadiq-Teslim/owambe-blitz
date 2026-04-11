import { Router, Request, Response } from "express";

function paramId(req: Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}
import { generateQuestions, parseVoiceInput } from "./groq";
import {
  createGameSession,
  getGameSession,
  getAllGames,
  serializeGame,
  serializeGameForPlayer,
  getLeaderboard,
} from "./store";
import type { GameSession, PlayerState, TriviaQuestion } from "./types";

const QUESTION_TIME_MS = 10_000; // 10 seconds per question
const QUESTION_GAP_MS = 3_000;   // 3 seconds between questions (show answer)

const router = Router();

/** Auto-advance logic: call on every poll to tick the game forward */
function tickGame(game: GameSession): void {
  if (game.phase !== "active") return;
  if (!game.questionStartedAt) return;

  const elapsed = Date.now() - game.questionStartedAt;
  const totalSlot = QUESTION_TIME_MS + QUESTION_GAP_MS; // 13s per question slot

  if (elapsed >= totalSlot) {
    // Time to move to next question
    const nextQ = game.currentQuestion + 1;
    if (nextQ >= game.questions.length) {
      // Game over
      game.phase = "finished";
      game.currentQuestion = game.questions.length;
      game.questionStartedAt = null;
    } else {
      game.currentQuestion = nextQ;
      game.questionStartedAt = Date.now();
    }
  }
}

// ── POST /api/games — Host creates a game session ───────────────────
router.post("/games", async (req: Request, res: Response) => {
  try {
    const { gameId, host, topic, prizePool, sharePercentages, questionCount, customQuestions } = req.body;

    if (!gameId || !host || !topic) {
      res.status(400).json({ error: "gameId, host, and topic are required" });
      return;
    }

    let questions: TriviaQuestion[];

    if (customQuestions && Array.isArray(customQuestions) && customQuestions.length > 0) {
      // Validate custom questions
      questions = customQuestions.map((q: any) => {
        if (!q.question || !q.options || !q.answer) {
          throw new Error("Each question needs: question, options {A,B,C,D}, answer");
        }
        return {
          question: q.question,
          options: { A: q.options.A, B: q.options.B, C: q.options.C, D: q.options.D },
          answer: q.answer,
        };
      });
    } else {
      // Generate questions via Groq
      const count = questionCount || 3;
      questions = await generateQuestions(topic, count);
    }

    const session: GameSession = {
      id: String(gameId),
      host: host.toLowerCase(),
      topic,
      prizePool: prizePool || "0",
      sharePercentages: sharePercentages || [60, 30, 10],
      questions,
      players: new Map(),
      phase: "lobby",
      currentQuestion: 0,
      questionStartedAt: null,
      createdAt: Date.now(),
      payoutTxHash: null,
    };

    createGameSession(session);

    res.json({
      gameId: session.id,
      questionCount: questions.length,
      questions, // Host sees questions + answers
    });
  } catch (err: any) {
    console.error("Create game error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/games — List all games ────────────────────────────────
router.get("/games", (_req: Request, res: Response) => {
  const games = getAllGames().map(serializeGame);
  res.json(games);
});

// ── GET /api/games/:id — Get game state (for polling) ──────────────
router.get("/games/:id", (req: Request, res: Response) => {
  const game = getGameSession(paramId(req));
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  // Auto-advance questions based on timer
  tickGame(game);

  const playerEmail = req.query.player as string | undefined;
  res.json(serializeGameForPlayer(game, playerEmail));
});

// ── POST /api/games/:id/join — Player joins with email ─────────────
router.post("/games/:id/join", (req: Request, res: Response) => {
  const game = getGameSession(paramId(req));
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: "email is required" });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (game.phase !== "lobby") {
    res.status(400).json({ error: "Game is not in lobby phase" });
    return;
  }

  if (game.players.has(normalizedEmail)) {
    res.status(400).json({ error: "Already joined" });
    return;
  }

  const player: PlayerState = {
    email: normalizedEmail,
    answers: [],
    score: 0,
    totalTime: 0,
    joinedAt: Date.now(),
  };

  game.players.set(normalizedEmail, player);
  res.json({ success: true, playerCount: game.players.size });
});

// ── POST /api/games/:id/start — Host starts the game ───────────────
router.post("/games/:id/start", (req: Request, res: Response) => {
  const game = getGameSession(paramId(req));
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const { host } = req.body;
  if (!host || host.toLowerCase() !== game.host) {
    res.status(403).json({ error: "Only host can start the game" });
    return;
  }

  if (game.phase !== "lobby") {
    res.status(400).json({ error: "Game already started" });
    return;
  }

  if (game.players.size === 0) {
    res.status(400).json({ error: "Need at least 1 player" });
    return;
  }

  game.phase = "active";
  game.currentQuestion = 0;
  game.questionStartedAt = Date.now();

  res.json({ success: true, phase: "active", currentQuestion: 0 });
});

// ── POST /api/games/:id/answer — Player submits an answer ──────────
router.post("/games/:id/answer", (req: Request, res: Response) => {
  const game = getGameSession(paramId(req));
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  // Tick game forward in case timer expired
  tickGame(game);

  if (game.phase !== "active") {
    res.status(400).json({ error: "Game is not active" });
    return;
  }

  const { email, questionIndex, answer } = req.body;
  if (!email || questionIndex === undefined || !answer) {
    res.status(400).json({ error: "email, questionIndex, and answer are required" });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  const player = game.players.get(normalizedEmail);
  if (!player) {
    res.status(400).json({ error: "Not a player in this game" });
    return;
  }

  if (questionIndex !== game.currentQuestion) {
    res.status(400).json({ error: "Wrong question index" });
    return;
  }

  if (player.answers.some((a) => a.questionIndex === questionIndex)) {
    res.status(400).json({ error: "Already answered this question" });
    return;
  }

  const timeTaken = game.questionStartedAt ? Date.now() - game.questionStartedAt : QUESTION_TIME_MS;

  // Only count if answered within time limit
  const withinTime = timeTaken <= QUESTION_TIME_MS;

  player.answers.push({
    questionIndex,
    answer,
    timestamp: timeTaken,
  });

  const correct = withinTime && game.questions[questionIndex].answer === answer;
  if (correct) {
    player.score += 1;
  }
  player.totalTime += timeTaken;

  res.json({
    success: true,
    correct,
    correctAnswer: game.questions[questionIndex].answer,
    score: player.score,
  });
});

// ── GET /api/games/:id/leaderboard — Get final scores ──────────────
router.get("/games/:id/leaderboard", (req: Request, res: Response) => {
  const game = getGameSession(paramId(req));
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const leaderboard = getLeaderboard(game);
  res.json({
    phase: game.phase,
    leaderboard,
    sharePercentages: game.sharePercentages,
    prizePool: game.prizePool,
  });
});

// ── POST /api/games/:id/claim — Winner submits wallet address ──────
router.post("/games/:id/claim", (req: Request, res: Response) => {
  const game = getGameSession(paramId(req));
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const { email, walletAddress } = req.body;
  if (!email || !walletAddress) {
    res.status(400).json({ error: "email and walletAddress are required" });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  const player = game.players.get(normalizedEmail);
  if (!player) {
    res.status(400).json({ error: "Not a player in this game" });
    return;
  }

  // Check if this player is actually a winner
  const leaderboard = getLeaderboard(game);
  const rank = leaderboard.findIndex((e) => e.email === normalizedEmail);
  if (rank < 0 || rank >= game.sharePercentages.length) {
    res.status(400).json({ error: "You are not a prize winner" });
    return;
  }

  player.walletAddress = walletAddress;

  // Return all winner wallet statuses so host can auto-pay
  const winnerWallets = leaderboard
    .slice(0, game.sharePercentages.length)
    .map((e) => {
      const p = game.players.get(e.email);
      return { email: e.email, walletAddress: p?.walletAddress || null, rank: e.rank };
    });

  res.json({ success: true, rank: rank + 1, winnerWallets });
});

// ── GET /api/games/:id/winners — Get winner wallet claim status ─────
router.get("/games/:id/winners", (req: Request, res: Response) => {
  const game = getGameSession(paramId(req));
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const leaderboard = getLeaderboard(game);
  const winners = leaderboard
    .slice(0, game.sharePercentages.length)
    .map((e) => {
      const p = game.players.get(e.email);
      return { email: e.email, walletAddress: p?.walletAddress || null, rank: e.rank, score: e.score };
    });

  const allClaimed = winners.every((w) => w.walletAddress !== null);

  res.json({ winners, allClaimed, sharePercentages: game.sharePercentages, prizePool: game.prizePool, payoutTxHash: game.payoutTxHash });
});

// ── POST /api/games/:id/payout-tx — Host saves payout tx hash ──────
router.post("/games/:id/payout-tx", (req: Request, res: Response) => {
  const game = getGameSession(paramId(req));
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const { txHash } = req.body;
  if (!txHash) {
    res.status(400).json({ error: "txHash is required" });
    return;
  }

  game.payoutTxHash = txHash;
  res.json({ success: true });
});

// ── GET /api/games/:id/questions — Host gets questions with answers ─
router.get("/games/:id/questions", (req: Request, res: Response) => {
  const game = getGameSession(paramId(req));
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const { host } = req.query;
  if (host && (host as string).toLowerCase() === game.host) {
    res.json({ questions: game.questions });
  } else {
    const safe = game.questions.map((q) => ({
      question: q.question,
      options: q.options,
    }));
    res.json({ questions: safe });
  }
});

// ── POST /api/parse-voice — Parse voice transcript into game config ──
router.post("/parse-voice", async (req: Request, res: Response) => {
  try {
    const { transcript } = req.body;
    if (!transcript) {
      res.status(400).json({ error: "transcript is required" });
      return;
    }

    const config = await parseVoiceInput(transcript);
    res.json(config);
  } catch (err: any) {
    console.error("Voice parse error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
