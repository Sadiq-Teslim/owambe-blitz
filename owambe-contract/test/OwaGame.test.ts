import { expect } from "chai";
import { ethers } from "hardhat";
import { OwaGame } from "../typechain-types";

describe("OwaGame", function () {
  let owaGame: OwaGame;
  let host: any;
  let player1: any;
  let player2: any;
  let player3: any;

  const PRIZE_POOL = ethers.parseEther("1.0");

  beforeEach(async function () {
    [host, player1, player2, player3] = await ethers.getSigners();
    const OwaGameFactory = await ethers.getContractFactory("OwaGame");
    owaGame = await OwaGameFactory.deploy();
    await owaGame.waitForDeployment();
  });

  describe("createGame", function () {
    it("should create a game with default shares (60/30/10)", async function () {
      await owaGame.connect(host).createGame([], { value: PRIZE_POOL });

      const game = await owaGame.getGame(1);
      expect(game.host).to.equal(host.address);
      expect(game.prizePool).to.equal(PRIZE_POOL);
      expect(game.state).to.equal(0); // OPEN
      expect(game.playerCount).to.equal(0);
      expect(game.sharePercentages).to.deep.equal([60n, 30n, 10n]);
    });

    it("should create a game with custom shares", async function () {
      await owaGame.connect(host).createGame([50, 30, 20], { value: PRIZE_POOL });
      const game = await owaGame.getGame(1);
      expect(game.sharePercentages).to.deep.equal([50n, 30n, 20n]);
    });

    it("should allow 2-winner split", async function () {
      await owaGame.connect(host).createGame([70, 30], { value: PRIZE_POOL });
      const game = await owaGame.getGame(1);
      expect(game.sharePercentages).to.deep.equal([70n, 30n]);
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

    it("should emit GameCreated event", async function () {
      await expect(owaGame.connect(host).createGame([], { value: PRIZE_POOL }))
        .to.emit(owaGame, "GameCreated")
        .withArgs(1, host.address, PRIZE_POOL, [60, 30, 10]);
    });
  });

  describe("joinGame — free", function () {
    beforeEach(async function () {
      await owaGame.connect(host).createGame([], { value: PRIZE_POOL });
    });

    it("should allow a player to join for free", async function () {
      await owaGame.connect(player1).joinGame(1);
      const players = await owaGame.getPlayers(1);
      expect(players).to.include(player1.address);
    });

    it("should not change prize pool when player joins", async function () {
      await owaGame.connect(player1).joinGame(1);
      const game = await owaGame.getGame(1);
      expect(game.prizePool).to.equal(PRIZE_POOL);
    });

    it("should revert if already joined", async function () {
      await owaGame.connect(player1).joinGame(1);
      await expect(owaGame.connect(player1).joinGame(1))
        .to.be.revertedWith("Already joined");
    });

    it("should revert if host tries to join", async function () {
      await expect(owaGame.connect(host).joinGame(1))
        .to.be.revertedWith("Host cannot join");
    });
  });

  describe("startGame", function () {
    beforeEach(async function () {
      await owaGame.connect(host).createGame([], { value: PRIZE_POOL });
      await owaGame.connect(player1).joinGame(1);
    });

    it("should start the game", async function () {
      await owaGame.connect(host).startGame(1);
      const game = await owaGame.getGame(1);
      expect(game.state).to.equal(1); // ACTIVE
    });

    it("should revert if not host", async function () {
      await expect(owaGame.connect(player1).startGame(1))
        .to.be.revertedWith("Only host");
    });
  });

  describe("recordScores + payout — 3 players, default split", function () {
    beforeEach(async function () {
      await owaGame.connect(host).createGame([], { value: PRIZE_POOL });
      await owaGame.connect(player1).joinGame(1);
      await owaGame.connect(player2).joinGame(1);
      await owaGame.connect(player3).joinGame(1);
      await owaGame.connect(host).startGame(1);
    });

    it("should pay 60/30/10 to top 3", async function () {
      const pot = PRIZE_POOL;
      const expectedFirst = (pot * 60n) / 100n;
      const expectedSecond = (pot * 30n) / 100n;
      const expectedThird = pot - expectedFirst - expectedSecond;

      const bal1Before = await ethers.provider.getBalance(player1.address);
      const bal2Before = await ethers.provider.getBalance(player2.address);
      const bal3Before = await ethers.provider.getBalance(player3.address);

      await owaGame.connect(host).recordScores(
        1,
        [player1.address, player2.address, player3.address],
        [3, 2, 1]
      );

      const bal1After = await ethers.provider.getBalance(player1.address);
      const bal2After = await ethers.provider.getBalance(player2.address);
      const bal3After = await ethers.provider.getBalance(player3.address);

      expect(bal1After - bal1Before).to.equal(expectedFirst);
      expect(bal2After - bal2Before).to.equal(expectedSecond);
      expect(bal3After - bal3Before).to.equal(expectedThird);
    });

    it("should store ranked players correctly", async function () {
      await owaGame.connect(host).recordScores(
        1,
        [player1.address, player2.address, player3.address],
        [1, 3, 2]
      );
      const ranked = await owaGame.getRankedPlayers(1);
      expect(ranked[0]).to.equal(player2.address);
      expect(ranked[1]).to.equal(player3.address);
      expect(ranked[2]).to.equal(player1.address);
    });
  });

  describe("payout — custom splits", function () {
    it("should handle 50/30/20 split", async function () {
      await owaGame.connect(host).createGame([50, 30, 20], { value: PRIZE_POOL });
      await owaGame.connect(player1).joinGame(1);
      await owaGame.connect(player2).joinGame(1);
      await owaGame.connect(player3).joinGame(1);
      await owaGame.connect(host).startGame(1);

      const pot = PRIZE_POOL;
      const expected1 = (pot * 50n) / 100n;
      const expected2 = (pot * 30n) / 100n;
      const expected3 = pot - expected1 - expected2;

      const b1 = await ethers.provider.getBalance(player1.address);
      const b2 = await ethers.provider.getBalance(player2.address);
      const b3 = await ethers.provider.getBalance(player3.address);

      await owaGame.connect(host).recordScores(
        1,
        [player1.address, player2.address, player3.address],
        [5, 3, 1]
      );

      expect((await ethers.provider.getBalance(player1.address)) - b1).to.equal(expected1);
      expect((await ethers.provider.getBalance(player2.address)) - b2).to.equal(expected2);
      expect((await ethers.provider.getBalance(player3.address)) - b3).to.equal(expected3);
    });

    it("should handle winner-takes-all", async function () {
      await owaGame.connect(host).createGame([100], { value: PRIZE_POOL });
      await owaGame.connect(player1).joinGame(1);
      await owaGame.connect(player2).joinGame(1);
      await owaGame.connect(host).startGame(1);

      const b1 = await ethers.provider.getBalance(player1.address);

      await owaGame.connect(host).recordScores(
        1,
        [player1.address, player2.address],
        [5, 2]
      );

      expect((await ethers.provider.getBalance(player1.address)) - b1).to.equal(PRIZE_POOL);
    });
  });

  describe("payout — fewer players than winner slots", function () {
    it("should redistribute to single player with default split", async function () {
      await owaGame.connect(host).createGame([], { value: PRIZE_POOL });
      await owaGame.connect(player1).joinGame(1);
      await owaGame.connect(host).startGame(1);

      const balBefore = await ethers.provider.getBalance(player1.address);
      await owaGame.connect(host).recordScores(1, [player1.address], [3]);
      const balAfter = await ethers.provider.getBalance(player1.address);

      // Single player gets 100% (60 out of 60 redistributed)
      expect(balAfter - balBefore).to.equal(PRIZE_POOL);
    });

    it("should redistribute to 2 players with default 3-way split", async function () {
      await owaGame.connect(host).createGame([], { value: PRIZE_POOL });
      await owaGame.connect(player1).joinGame(1);
      await owaGame.connect(player2).joinGame(1);
      await owaGame.connect(host).startGame(1);

      // Shares [60, 30, 10] but only 2 players
      // Used total = 60 + 30 = 90
      // Player1 gets: (1e18 * 60) / 90 = 0.6666... ETH
      // Player2 gets remainder

      const b1 = await ethers.provider.getBalance(player1.address);
      const b2 = await ethers.provider.getBalance(player2.address);

      await owaGame.connect(host).recordScores(
        1,
        [player1.address, player2.address],
        [3, 1]
      );

      const gain1 = (await ethers.provider.getBalance(player1.address)) - b1;
      const gain2 = (await ethers.provider.getBalance(player2.address)) - b2;

      // Total should equal prize pool
      expect(gain1 + gain2).to.equal(PRIZE_POOL);
      // First player gets more than second
      expect(gain1).to.be.gt(gain2);
    });
  });
});
