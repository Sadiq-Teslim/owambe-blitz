import { useCallback } from "react";
import { Contract, JsonRpcSigner, ethers } from "ethers";
import { CONTRACT_ADDRESS, OWA_GAME_ABI } from "../utils/contract";

export function useContract(signer: JsonRpcSigner | null) {
  const getContract = useCallback(() => {
    if (!signer || !CONTRACT_ADDRESS) return null;
    return new Contract(CONTRACT_ADDRESS, OWA_GAME_ABI, signer);
  }, [signer]);

  const createGame = useCallback(
    async (prizePool: string, sharePercentages: number[]) => {
      const contract = getContract();
      if (!contract) throw new Error("Contract not available. Check wallet and contract address.");

      const prizePoolWei = ethers.parseEther(prizePool);
      const tx = await contract.createGame(sharePercentages, { value: prizePoolWei });
      const receipt = await tx.wait();

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
        return { gameId: Number(parsed!.args.gameId), txHash: receipt.hash };
      }

      const gameCount = await contract.gameCount();
      return { gameId: Number(gameCount), txHash: receipt.hash };
    },
    [getContract]
  );

  const payoutWinners = useCallback(
    async (gameId: number, winners: string[]) => {
      const contract = getContract();
      if (!contract) throw new Error("Contract not available");

      const tx = await contract.payoutWinners(gameId, winners);
      const receipt = await tx.wait();

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
          // skip
        }
      }

      return { txHash: receipt.hash, payouts };
    },
    [getContract]
  );

  return { createGame, payoutWinners };
}
