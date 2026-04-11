import { useCallback } from "react";
import { Contract, JsonRpcSigner, ethers } from "ethers";
import { CONTRACT_ADDRESS, OWA_GAME_ABI } from "../utils/contract";

export function useContract(signer: JsonRpcSigner | null) {
  const getContract = useCallback(() => {
    if (!signer || !CONTRACT_ADDRESS) return null;
    return new Contract(CONTRACT_ADDRESS, OWA_GAME_ABI, signer);
  }, [signer]);

  const createGame = useCallback(
    async (prizePool: string, entryFee: string) => {
      const contract = getContract();
      if (!contract) throw new Error("Contract not available");

      const entryFeeWei = ethers.parseEther(entryFee);
      const prizePoolWei = ethers.parseEther(prizePool);

      const tx = await contract.createGame(entryFeeWei, { value: prizePoolWei });
      const receipt = await tx.wait();

      // Extract gameId from GameCreated event
      const event = receipt.logs.find((log: any) => {
        try {
          const parsed = contract.interface.parseLog({ topics: log.topics as string[], data: log.data });
          return parsed?.name === "GameCreated";
        } catch {
          return false;
        }
      });

      if (event) {
        const parsed = contract.interface.parseLog({ topics: event.topics as string[], data: event.data });
        return {
          gameId: Number(parsed!.args.gameId),
          txHash: receipt.hash,
        };
      }

      // Fallback: read gameCount
      const gameCount = await contract.gameCount();
      return { gameId: Number(gameCount), txHash: receipt.hash };
    },
    [getContract]
  );

  const joinGame = useCallback(
    async (gameId: number, entryFee: bigint) => {
      const contract = getContract();
      if (!contract) throw new Error("Contract not available");

      const tx = await contract.joinGame(gameId, { value: entryFee });
      const receipt = await tx.wait();
      return receipt.hash;
    },
    [getContract]
  );

  const startGame = useCallback(
    async (gameId: number) => {
      const contract = getContract();
      if (!contract) throw new Error("Contract not available");

      const tx = await contract.startGame(gameId);
      await tx.wait();
    },
    [getContract]
  );

  const getGameInfo = useCallback(
    async (gameId: number) => {
      const contract = getContract();
      if (!contract) throw new Error("Contract not available");

      const [host, prizePool, entryFee, state, playerCount] = await contract.getGame(gameId);
      const players = await contract.getPlayers(gameId);

      return {
        host: host as string,
        prizePool: prizePool as bigint,
        entryFee: entryFee as bigint,
        state: Number(state),
        playerCount: Number(playerCount),
        players: players as string[],
      };
    },
    [getContract]
  );

  const recordScores = useCallback(
    async (gameId: number, players: string[], scores: number[]) => {
      const contract = getContract();
      if (!contract) throw new Error("Contract not available");

      const tx = await contract.recordScores(gameId, players, scores);
      const receipt = await tx.wait();

      // Extract payout events
      const payouts: { player: string; amount: bigint; rank: number }[] = [];
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog({ topics: log.topics as string[], data: log.data });
          if (parsed?.name === "Payout") {
            payouts.push({
              player: parsed.args.player,
              amount: parsed.args.amount,
              rank: Number(parsed.args.rank),
            });
          }
        } catch {
          // skip non-matching logs
        }
      }

      return { txHash: receipt.hash, payouts };
    },
    [getContract]
  );

  const getRankedPlayers = useCallback(
    async (gameId: number) => {
      const contract = getContract();
      if (!contract) throw new Error("Contract not available");
      return (await contract.getRankedPlayers(gameId)) as string[];
    },
    [getContract]
  );

  return { createGame, joinGame, startGame, getGameInfo, recordScores, getRankedPlayers };
}
