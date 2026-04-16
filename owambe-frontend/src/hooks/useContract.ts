import { useCallback } from "react";
import { Contract, JsonRpcSigner, ethers } from "ethers";
import { CONTRACT_ADDRESS, OWA_GAME_ABI, ERC20_ABI, TOKEN_ADDRESSES } from "../utils/contract";

export function useContract(signer: JsonRpcSigner | null) {
  const getContract = useCallback(() => {
    if (!signer || !CONTRACT_ADDRESS) return null;
    return new Contract(CONTRACT_ADDRESS, OWA_GAME_ABI, signer);
  }, [signer]);

  const createGame = useCallback(
    async (prizePool: string, sharePercentages: number[], tokenSymbol: string = "ETH") => {
      const contract = getContract();
      if (!contract || !signer) throw new Error("Contract not available. Check wallet and contract address.");

      const tokenAddress = TOKEN_ADDRESSES[tokenSymbol] || TOKEN_ADDRESSES.ETH;
      const isETH = tokenAddress === TOKEN_ADDRESSES.ETH;

      let amount: bigint;

      if (isETH) {
        // ETH: 18 decimals
        amount = ethers.parseEther(prizePool);
        const tx = await contract.createGame(sharePercentages, tokenAddress, 0, { value: amount });
        const receipt = await tx.wait();
        return parseGameCreated(contract, receipt);
      } else {
        // ERC-20: get decimals, approve, then create
        const tokenContract = new Contract(tokenAddress, ERC20_ABI, signer);
        const decimals = await tokenContract.decimals();
        amount = ethers.parseUnits(prizePool, decimals);

        // Check allowance and approve if needed
        const currentAllowance = await tokenContract.allowance(await signer.getAddress(), CONTRACT_ADDRESS);
        if (currentAllowance < amount) {
          const approveTx = await tokenContract.approve(CONTRACT_ADDRESS, amount);
          await approveTx.wait();
        }

        const tx = await contract.createGame(sharePercentages, tokenAddress, amount);
        const receipt = await tx.wait();
        return parseGameCreated(contract, receipt);
      }
    },
    [getContract, signer]
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

function parseGameCreated(contract: Contract, receipt: any) {
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

  return { gameId: 0, txHash: receipt.hash };
}
