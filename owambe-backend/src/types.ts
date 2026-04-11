export interface TriviaQuestion {
  question: string;
  options: { A: string; B: string; C: string; D: string };
  answer: "A" | "B" | "C" | "D";
}

export interface PlayerAnswer {
  questionIndex: number;
  answer: string;
  timestamp: number; // ms since game start — used for tiebreaking
}

export interface PlayerState {
  email: string;
  walletAddress?: string; // only set when winner claims
  answers: PlayerAnswer[];
  score: number;
  totalTime: number; // total ms taken across all answers
  joinedAt: number;
}

export type GamePhase = "lobby" | "active" | "finished";

export interface GameSession {
  id: string;            // matches on-chain gameId
  host: string;          // host wallet address
  topic: string;
  prizePool: string;     // in MON (for display)
  sharePercentages: number[];
  questions: TriviaQuestion[];
  players: Map<string, PlayerState>; // address → state
  phase: GamePhase;
  currentQuestion: number;
  questionStartedAt: number | null;   // timestamp when current question was shown
  createdAt: number;
  payoutTxHash: string | null;        // set after host triggers on-chain payout
}
