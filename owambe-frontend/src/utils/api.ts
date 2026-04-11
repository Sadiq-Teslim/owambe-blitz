import { API_URL } from "./contract";

async function request(path: string, options?: RequestInit) {
  const res = await fetch(`${API_URL}/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

export const api = {
  createGame: (body: {
    gameId: string;
    host: string;
    topic: string;
    prizePool: string;
    sharePercentages: number[];
    questionCount: number;
  }) => request("/games", { method: "POST", body: JSON.stringify(body) }),

  getGame: (id: string, playerEmail?: string) =>
    request(`/games/${id}${playerEmail ? `?player=${playerEmail}` : ""}`),

  joinGame: (id: string, email: string) =>
    request(`/games/${id}/join`, { method: "POST", body: JSON.stringify({ email }) }),

  startGame: (id: string, host: string) =>
    request(`/games/${id}/start`, { method: "POST", body: JSON.stringify({ host }) }),

  submitAnswer: (id: string, email: string, questionIndex: number, answer: string) =>
    request(`/games/${id}/answer`, {
      method: "POST",
      body: JSON.stringify({ email, questionIndex, answer }),
    }),

  nextQuestion: (id: string, host: string) =>
    request(`/games/${id}/next`, { method: "POST", body: JSON.stringify({ host }) }),

  getLeaderboard: (id: string) => request(`/games/${id}/leaderboard`),

  claimPrize: (id: string, email: string, walletAddress: string) =>
    request(`/games/${id}/claim`, {
      method: "POST",
      body: JSON.stringify({ email, walletAddress }),
    }),
};
