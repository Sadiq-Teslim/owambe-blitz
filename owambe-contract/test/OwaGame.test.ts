import { expect } from "chai";
import { ethers } from "hardhat";
import { OwaGame } from "../typechain-types";

describe("OwaGame", function () {
  let owaGame: OwaGame;
  let host: any;
  let winner1: any;
  let winner2: any;
  let winner3: any;

  const PRIZE_POOL = ethers.parseEther("1.0");

  beforeEach(async function () {
    [host, winner1, winner2, winner3] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("OwaGame");
    owaGame = await Factory.deploy();
    await owaGame.waitForDeployment();
  });

  describe("createGame", function () {
    it("should create with default shares", async function () {
      await owaGame.connect(host).createGame([], { value: PRIZE_POOL });
      const game = await owaGame.getGame(1);
      expect(game.host).to.equal(host.address);
      expect(game.prizePool).to.equal(PRIZE_POOL);
      expect(game.state).to.equal(0); // OPEN
      expect(game.sharePercentages).to.deep.equal([60n, 30n, 10n]);
    });

    it("should create with custom shares", async function () {
      await owaGame.connect(host).createGame([50, 30, 20], { value: PRIZE_POOL });
      const game = await owaGame.getGame(1);
      expect(game.sharePercentages).to.deep.equal([50n, 30n, 20n]);
    });

    it("should allow winner-takes-all", async function () {
      await owaGame.connect(host).createGame([100], { value: PRIZE_POOL });
      const game = await owaGame.getGame(1);
      expect(game.sharePercentages).to.deep.equal([100n]);
    });

    it("should revert if shares don't sum to 100", async function () {
      await expect(owaGame.connect(host).createGame([50, 30], { value: PRIZE_POOL }))
        .to.be.revertedWith("Shares must sum to 100");
    });

    it("should revert if no prize pool", async function () {
      await expect(owaGame.connect(host).createGame([], { value: 0 }))
        .to.be.revertedWith("Must deposit prize pool");
    });
  });

  describe("payoutWinners — 3 winners, default split", function () {
    beforeEach(async function () {
      await owaGame.connect(host).createGame([], { value: PRIZE_POOL });
    });

    it("should pay 60/30/10 to 3 winners", async function () {
      const pot = PRIZE_POOL;
      const exp1 = (pot * 60n) / 100n;
      const exp2 = (pot * 30n) / 100n;
      const exp3 = pot - exp1 - exp2;

      const b1 = await ethers.provider.getBalance(winner1.address);
      const b2 = await ethers.provider.getBalance(winner2.address);
      const b3 = await ethers.provider.getBalance(winner3.address);

      await owaGame.connect(host).payoutWinners(1, [winner1.address, winner2.address, winner3.address]);

      expect((await ethers.provider.getBalance(winner1.address)) - b1).to.equal(exp1);
      expect((await ethers.provider.getBalance(winner2.address)) - b2).to.equal(exp2);
      expect((await ethers.provider.getBalance(winner3.address)) - b3).to.equal(exp3);
    });

    it("should set game state to FINISHED", async function () {
      await owaGame.connect(host).payoutWinners(1, [winner1.address, winner2.address, winner3.address]);
      const game = await owaGame.getGame(1);
      expect(game.state).to.equal(1); // FINISHED
    });

    it("should store ranked players", async function () {
      await owaGame.connect(host).payoutWinners(1, [winner2.address, winner3.address, winner1.address]);
      const ranked = await owaGame.getRankedPlayers(1);
      expect(ranked[0]).to.equal(winner2.address);
      expect(ranked[1]).to.equal(winner3.address);
      expect(ranked[2]).to.equal(winner1.address);
    });

    it("should revert if not host", async function () {
      await expect(owaGame.connect(winner1).payoutWinners(1, [winner1.address]))
        .to.be.revertedWith("Only host");
    });

    it("should revert if called twice", async function () {
      await owaGame.connect(host).payoutWinners(1, [winner1.address, winner2.address, winner3.address]);
      await expect(owaGame.connect(host).payoutWinners(1, [winner1.address]))
        .to.be.revertedWith("Game already finished");
    });
  });

  describe("payoutWinners — edge cases", function () {
    it("should pay single winner 100% with default 3-way split", async function () {
      await owaGame.connect(host).createGame([], { value: PRIZE_POOL });
      const b = await ethers.provider.getBalance(winner1.address);
      await owaGame.connect(host).payoutWinners(1, [winner1.address]);
      expect((await ethers.provider.getBalance(winner1.address)) - b).to.equal(PRIZE_POOL);
    });

    it("should redistribute for 2 winners with 3-way split", async function () {
      await owaGame.connect(host).createGame([], { value: PRIZE_POOL });
      const b1 = await ethers.provider.getBalance(winner1.address);
      const b2 = await ethers.provider.getBalance(winner2.address);

      await owaGame.connect(host).payoutWinners(1, [winner1.address, winner2.address]);

      const g1 = (await ethers.provider.getBalance(winner1.address)) - b1;
      const g2 = (await ethers.provider.getBalance(winner2.address)) - b2;
      expect(g1 + g2).to.equal(PRIZE_POOL);
      expect(g1).to.be.gt(g2);
    });

    it("should handle winner-takes-all", async function () {
      await owaGame.connect(host).createGame([100], { value: PRIZE_POOL });
      const b = await ethers.provider.getBalance(winner1.address);
      await owaGame.connect(host).payoutWinners(1, [winner1.address]);
      expect((await ethers.provider.getBalance(winner1.address)) - b).to.equal(PRIZE_POOL);
    });

    it("should handle custom 50/30/20 split", async function () {
      await owaGame.connect(host).createGame([50, 30, 20], { value: PRIZE_POOL });
      const pot = PRIZE_POOL;

      const b1 = await ethers.provider.getBalance(winner1.address);
      const b2 = await ethers.provider.getBalance(winner2.address);
      const b3 = await ethers.provider.getBalance(winner3.address);

      await owaGame.connect(host).payoutWinners(1, [winner1.address, winner2.address, winner3.address]);

      expect((await ethers.provider.getBalance(winner1.address)) - b1).to.equal((pot * 50n) / 100n);
      expect((await ethers.provider.getBalance(winner2.address)) - b2).to.equal((pot * 30n) / 100n);
      expect((await ethers.provider.getBalance(winner3.address)) - b3).to.equal(pot - (pot * 50n) / 100n - (pot * 30n) / 100n);
    });
  });
});
