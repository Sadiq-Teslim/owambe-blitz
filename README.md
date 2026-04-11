# OWAMBE — On-Chain Party Trivia on Monad

**Where knowledge pays. Instantly.**

Owambe is a live, multiplayer trivia game where hosts fund a prize pool in MON, players compete for free, and winners get paid on-chain the moment the battle ends. No middleman. No delay. Just brains, speed, and blockchain finality.

---

## What is Owambe?

In Yoruba culture, *Owambe* means a lavish party — music, food, energy. We brought that energy on-chain. Owambe turns any gathering (hackathon, meetup, classroom, Twitter Space) into a high-stakes trivia arena where real crypto is on the line.

We built this because we've been on the other side. We've won competitions, topped leaderboards, put in the work — and never seen a dime. Organizers ghost. Payments "come next week." Promises evaporate. With Owambe, the prize pool is locked in a smart contract the moment the game is created. It's escrow by default. The host can't take it back, can't change the rules, can't ghost. When you win, the contract pays you — not a person, not a promise. Code.

A host speaks or types a topic. AI generates the questions. Players scan a QR code and join with just an email — no wallet, no friction. Ten seconds per question. The leaderboard is ruthless. And when the dust settles, winners connect a wallet and get paid instantly on Monad.

## How It Works

1. **Host creates an arena** — picks a topic (or writes custom questions), funds a prize pool in MON, sets the winner split
2. **Players scan & join** — QR code or link. Just an email. Zero cost to enter.
3. **AI generates questions** — powered by Groq (Llama 3.3 70B). Or the host writes their own.
4. **10-second rounds** — questions auto-advance. No waiting. Pure speed.
5. **Winners get paid** — top players connect a wallet and receive MON directly from the smart contract. Instantly.

## Tech Stack

| Layer | Tech |
|-------|------|
| **Blockchain** | Monad Testnet (Chain ID 10143) |
| **Smart Contract** | Solidity ^0.8.24, Hardhat 2 |
| **Frontend** | React + TypeScript + Vite + Tailwind CSS 4 |
| **Backend** | Express.js (Node.js) |
| **AI** | Groq API (llama-3.3-70b-versatile) |
| **Wallet** | ethers.js v6 + MetaMask |
| **Voice Input** | Web Speech API |

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Frontend   │────>│   Backend    │────>│   Groq API (AI)  │
│  React+Vite  │<────│  Express.js  │<────│  Question Gen    │
└──────┬───────┘     └──────────────┘     └──────────────────┘
       │
       │  ethers.js
       v
┌──────────────┐
│  OwaGame.sol │  Monad Testnet
│  Smart Contract
└──────────────┘
```

- **Host flow**: Connect wallet → Create game on-chain (funds prize pool) → Share QR → Start battle → Winners auto-paid
- **Player flow**: Scan QR → Enter email → Play → Win → Connect wallet → MON arrives

## Smart Contract

Deployed on Monad Testnet: `0xD85b5e7F990F8C6d57eC6a168BCDD02EB6e836D5`

Two functions. That's it:
- `createGame(uint256[] sharePercentages)` — host deposits MON, sets winner split
- `payoutWinners(uint256 gameId, address[] winners)` — pays winners ranked by score

Default split: 60% / 30% / 10%. Fully customizable.

## Project Structure

```
owambe-contract/    — Solidity smart contract + Hardhat tests (14/14 passing)
owambe-backend/     — Express API server (game state, scoring, AI questions)
owambe-frontend/    — React SPA (host dashboard, player game, results)
```

## Running Locally

**Contract**
```bash
cd owambe-contract
npm install
npx hardhat test          # 14/14 tests pass
npx hardhat run scripts/deploy.ts --network monad
```

**Backend**
```bash
cd owambe-backend
npm install
echo "PORT=3001\nGROQ_API_KEY=your_key" > .env
npm run dev
```

**Frontend**
```bash
cd owambe-frontend
npm install
echo "VITE_CONTRACT_ADDRESS=0xD85b5e7F990F8C6d57eC6a168BCDD02EB6e836D5\nVITE_API_URL=http://localhost:3001" > .env
npm run dev
```

## Key Features

- **Voice-powered game creation** — speak your topic, AI parses it
- **Custom questions** — hosts can write their own trivia
- **Zero-friction for players** — email only, no wallet to play
- **Instant on-chain payouts** — winners claim wallet, MON arrives immediately
- **Auto-advancing rounds** — 10-second server-side timer, no host intervention
- **Persistent state** — reload the page, pick up where you left off
- **Arena aesthetic** — Colosseum-inspired UI with gold accents and stone textures

## Team

**Lattice** — Built at Monad Blitz Lagos 2026

---

*Owambe: where the party meets the chain.*
