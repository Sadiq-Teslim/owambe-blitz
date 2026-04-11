export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "";
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export const MONAD_TESTNET = {
  chainId: "0x279F", // 10143
  chainName: "Monad Testnet",
  rpcUrls: ["https://testnet-rpc.monad.xyz"],
  nativeCurrency: {
    name: "MON",
    symbol: "MON",
    decimals: 18,
  },
  blockExplorerUrls: ["https://testnet.monadexplorer.com"],
};

export const OWA_GAME_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "gameId", type: "uint256" },
      { indexed: true, internalType: "address", name: "host", type: "address" },
      { indexed: false, internalType: "uint256", name: "prizePool", type: "uint256" },
      { indexed: false, internalType: "uint256[]", name: "sharePercentages", type: "uint256[]" },
    ],
    name: "GameCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "gameId", type: "uint256" },
      { indexed: true, internalType: "address", name: "player", type: "address" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "rank", type: "uint256" },
    ],
    name: "Payout",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [{ indexed: true, internalType: "uint256", name: "gameId", type: "uint256" }],
    name: "GameFinished",
    type: "event",
  },
  {
    inputs: [{ internalType: "uint256[]", name: "_sharePercentages", type: "uint256[]" }],
    name: "createGame",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "_gameId", type: "uint256" },
      { internalType: "address[]", name: "_winners", type: "address[]" },
    ],
    name: "payoutWinners",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "gameCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "_gameId", type: "uint256" }],
    name: "getGame",
    outputs: [
      { internalType: "address", name: "host", type: "address" },
      { internalType: "uint256", name: "prizePool", type: "uint256" },
      { internalType: "enum OwaGame.GameState", name: "state", type: "uint8" },
      { internalType: "uint256[]", name: "sharePercentages", type: "uint256[]" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "_gameId", type: "uint256" }],
    name: "getRankedPlayers",
    outputs: [{ internalType: "address[]", name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "_gameId", type: "uint256" },
      { internalType: "address", name: "_player", type: "address" },
    ],
    name: "getPayoutAmount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
