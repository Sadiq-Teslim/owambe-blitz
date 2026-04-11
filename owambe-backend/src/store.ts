import { GameSession, PlayerState } from "./types";

// In-memory game store — fine for hackathon
const games = new Map<string, GameSession>();

export function createGameSession(session: GameSession): void {
  games.set(session.id, session);
}

export function getGameSession(id: string): GameSession | undefined {
  return games.get(id);
}

export function getAllGames(): GameSession[] {
  return Array.from(games.values());
}

export function serializeGame(game: GameSession) {
  return {
    id: game.id,
    host: game.host,
    topic: game.topic,
    prizePool: game.prizePool,
    sharePercentages: game.sharePercentages,
    questionCount: game.questions.length,
    phase: game.phase,
    currentQuestion: game.currentQuestion,
    playerCount: game.players.size,
    players: Array.from(game.players.values()).map((p) => ({
      address: p.address,
      score: p.score,
      hasAnswered: p.answers.some((a) => a.questionIndex === game.currentQuestion),
    })),
    createdAt: game.createdAt,
  };
}

export function serializeGameForPlayer(game: GameSession, playerAddress?: string) {
  const base = serializeGame(game);

  // During active game, send current question WITHOUT the answer
  let currentQuestion = null;
  if (game.phase === "active" && game.currentQuestion < game.questions.length) {
    const q = game.questions[game.currentQuestion];
    currentQuestion = {
      index: game.currentQuestion,
      question: q.question,
      options: q.options,
      totalQuestions: game.questions.length,
      startedAt: game.questionStartedAt,
    };
  }

  // Player's own state
  let myState = null;
  if (playerAddress) {
    const ps = game.players.get(playerAddress.toLowerCase());
    if (ps) {
      myState = {
        score: ps.score,
        hasAnsweredCurrent: ps.answers.some((a) => a.questionIndex === game.currentQuestion),
      };
    }
  }

  return { ...base, currentQuestion, myState };
}

export function getLeaderboard(game: GameSession) {
  const players = Array.from(game.players.values());
  players.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.totalTime - b.totalTime; // faster = better
  });

  return players.map((p, i) => ({
    rank: i + 1,
    address: p.address,
    score: p.score,
    totalTime: p.totalTime,
  }));
}
