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
import { GameSession, PlayerState } from "./types";

const router = Router();

// ── POST /api/games — Host creates a game session ───────────────────
router.post("/games", async (req: Request, res: Response) => {
  try {
    const { gameId, host, topic, prizePool, sharePercentages, questionCount } = req.body;

    if (!gameId || !host || !topic) {
      res.status(400).json({ error: "gameId, host, and topic are required" });
      return;
    }

    // Generate questions via Groq
    const count = questionCount || 3;
    const questions = await generateQuestions(topic, count);

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

  const playerAddress = req.query.player as string | undefined;
  res.json(serializeGameForPlayer(game, playerAddress));
});

// ── POST /api/games/:id/join — Player joins a game ─────────────────
router.post("/games/:id/join", (req: Request, res: Response) => {
  const game = getGameSession(paramId(req));
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const { address } = req.body;
  if (!address) {
    res.status(400).json({ error: "address is required" });
    return;
  }

  const addr = address.toLowerCase();
  if (game.phase !== "lobby") {
    res.status(400).json({ error: "Game is not in lobby phase" });
    return;
  }

  if (game.players.has(addr)) {
    res.status(400).json({ error: "Already joined" });
    return;
  }

  const player: PlayerState = {
    address: addr,
    answers: [],
    score: 0,
    totalTime: 0,
    joinedAt: Date.now(),
  };

  game.players.set(addr, player);
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

  if (game.phase !== "active") {
    res.status(400).json({ error: "Game is not active" });
    return;
  }

  const { address, questionIndex, answer } = req.body;
  if (!address || questionIndex === undefined || !answer) {
    res.status(400).json({ error: "address, questionIndex, and answer are required" });
    return;
  }

  const addr = address.toLowerCase();
  const player = game.players.get(addr);
  if (!player) {
    res.status(400).json({ error: "Not a player in this game" });
    return;
  }

  if (questionIndex !== game.currentQuestion) {
    res.status(400).json({ error: "Wrong question index" });
    return;
  }

  // Check if already answered this question
  if (player.answers.some((a) => a.questionIndex === questionIndex)) {
    res.status(400).json({ error: "Already answered this question" });
    return;
  }

  const timeTaken = game.questionStartedAt ? Date.now() - game.questionStartedAt : 15000;

  player.answers.push({
    questionIndex,
    answer,
    timestamp: timeTaken,
  });

  // Check if correct
  const correct = game.questions[questionIndex].answer === answer;
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

// ── POST /api/games/:id/next — Host advances to next question ──────
router.post("/games/:id/next", (req: Request, res: Response) => {
  const game = getGameSession(paramId(req));
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const { host } = req.body;
  if (!host || host.toLowerCase() !== game.host) {
    res.status(403).json({ error: "Only host can advance questions" });
    return;
  }

  if (game.phase !== "active") {
    res.status(400).json({ error: "Game is not active" });
    return;
  }

  const nextQ = game.currentQuestion + 1;
  if (nextQ >= game.questions.length) {
    // Game over
    game.phase = "finished";
    game.currentQuestion = game.questions.length;
    game.questionStartedAt = null;

    const leaderboard = getLeaderboard(game);
    res.json({ success: true, phase: "finished", leaderboard });
    return;
  }

  game.currentQuestion = nextQ;
  game.questionStartedAt = Date.now();

  res.json({ success: true, currentQuestion: nextQ, totalQuestions: game.questions.length });
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

// ── GET /api/games/:id/questions — Host gets questions with answers ─
router.get("/games/:id/questions", (req: Request, res: Response) => {
  const game = getGameSession(paramId(req));
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  // Only return questions with answers if requesting as host
  const { host } = req.query;
  if (host && (host as string).toLowerCase() === game.host) {
    res.json({ questions: game.questions });
  } else {
    // Players get questions without answers
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
