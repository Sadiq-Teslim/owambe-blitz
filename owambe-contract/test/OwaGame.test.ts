import { expect } from "chai";
import { ethers } from "hardhat";
import { OwaGame } from "../typechain-types";

describe("OwaGame", function () {
  let owaGame: OwaGame;
  let host: any;
  let player1: any;
  let player2: any;
  let player3: any;

  const PRIZE_POOL = ethers.parseEther("1.0"); // 1 MON
  const ENTRY_FEE = ethers.parseEther("0.1");  // 0.1 MON

  beforeEach(async function () {
    [host, player1, player2, player3] = await ethers.getSigners();
    const OwaGameFactory = await ethers.getContractFactory("OwaGame");
    owaGame = await OwaGameFactory.deploy();
    await owaGame.waitForDeployment();
  });

  describe("createGame", function () {
    it("should create a game with correct parameters", async function () {
      const tx = await owaGame.connect(host).createGame(ENTRY_FEE, { value: PRIZE_POOL });
      await tx.wait();

      const game = await owaGame.getGame(1);
      expect(game.host).to.equal(host.address);
      expect(game.prizePool).to.equal(PRIZE_POOL);
      expect(game.entryFee).to.equal(ENTRY_FEE);
      expect(game.state).to.equal(0); // OPEN
      expect(game.playerCount).to.equal(0);
    });

    it("should emit GameCreated event", async function () {
      await expect(owaGame.connect(host).createGame(ENTRY_FEE, { value: PRIZE_POOL }))
        .to.emit(owaGame, "GameCreated")
        .withArgs(1, host.address, PRIZE_POOL, ENTRY_FEE);
    });

    it("should revert if no prize pool sent", async function () {
      await expect(owaGame.connect(host).createGame(ENTRY_FEE, { value: 0 }))
        .to.be.revertedWith("Must deposit prize pool");
    });

    it("should increment game count", async function () {
      await owaGame.connect(host).createGame(ENTRY_FEE, { value: PRIZE_POOL });
      await owaGame.connect(host).createGame(ENTRY_FEE, { value: PRIZE_POOL });
      expect(await owaGame.gameCount()).to.equal(2);
    });
  });

  describe("joinGame", function () {
    beforeEach(async function () {
      await owaGame.connect(host).createGame(ENTRY_FEE, { value: PRIZE_POOL });
    });

    it("should allow a player to join", async function () {
      await owaGame.connect(player1).joinGame(1, { value: ENTRY_FEE });
      const players = await owaGame.getPlayers(1);
      expect(players).to.include(player1.address);
    });

    it("should add entry fee to prize pool", async function () {
      await owaGame.connect(player1).joinGame(1, { value: ENTRY_FEE });
      const game = await owaGame.getGame(1);
      expect(game.prizePool).to.equal(PRIZE_POOL + ENTRY_FEE);
    });

    it("should revert if wrong entry fee", async function () {
      await expect(owaGame.connect(player1).joinGame(1, { value: ethers.parseEther("0.05") }))
        .to.be.revertedWith("Wrong entry fee");
    });

    it("should revert if already joined", async function () {
      await owaGame.connect(player1).joinGame(1, { value: ENTRY_FEE });
      await expect(owaGame.connect(player1).joinGame(1, { value: ENTRY_FEE }))
        .to.be.revertedWith("Already joined");
    });

    it("should revert if host tries to join own game", async function () {
      await expect(owaGame.connect(host).joinGame(1, { value: ENTRY_FEE }))
        .to.be.revertedWith("Host cannot join");
    });
  });

  describe("startGame", function () {
    beforeEach(async function () {
      await owaGame.connect(host).createGame(ENTRY_FEE, { value: PRIZE_POOL });
      await owaGame.connect(player1).joinGame(1, { value: ENTRY_FEE });
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

  describe("recordScores and payout — 3 players", function () {
    beforeEach(async function () {
      await owaGame.connect(host).createGame(ENTRY_FEE, { value: PRIZE_POOL });
      await owaGame.connect(player1).joinGame(1, { value: ENTRY_FEE });
      await owaGame.connect(player2).joinGame(1, { value: ENTRY_FEE });
      await owaGame.connect(player3).joinGame(1, { value: ENTRY_FEE });
      await owaGame.connect(host).startGame(1);
    });

    it("should pay out 60/30/10 to top 3", async function () {
      const totalPot = PRIZE_POOL + ENTRY_FEE * 3n;
      const expectedFirst = (totalPot * 60n) / 100n;
      const expectedSecond = (totalPot * 30n) / 100n;
      const expectedThird = totalPot - expectedFirst - expectedSecond;

      const bal1Before = await ethers.provider.getBalance(player1.address);
      const bal2Before = await ethers.provider.getBalance(player2.address);
      const bal3Before = await ethers.provider.getBalance(player3.address);

      // player1: 3 correct, player2: 2, player3: 1
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

    it("should set game state to FINISHED", async function () {
      await owaGame.connect(host).recordScores(
        1,
        [player1.address, player2.address, player3.address],
        [3, 2, 1]
      );
      const game = await owaGame.getGame(1);
      expect(game.state).to.equal(2); // FINISHED
    });

    it("should store ranked players", async function () {
      await owaGame.connect(host).recordScores(
        1,
        [player1.address, player2.address, player3.address],
        [1, 3, 2] // player2 wins, player3 second, player1 third
      );
      const ranked = await owaGame.getRankedPlayers(1);
      expect(ranked[0]).to.equal(player2.address);
      expect(ranked[1]).to.equal(player3.address);
      expect(ranked[2]).to.equal(player1.address);
    });

    it("should revert if not host", async function () {
      await expect(owaGame.connect(player1).recordScores(
        1,
        [player1.address, player2.address, player3.address],
        [3, 2, 1]
      )).to.be.revertedWith("Only host");
    });
  });

  describe("payout — edge cases", function () {
    it("should pay 100% to single player", async function () {
      await owaGame.connect(host).createGame(ENTRY_FEE, { value: PRIZE_POOL });
      await owaGame.connect(player1).joinGame(1, { value: ENTRY_FEE });
      await owaGame.connect(host).startGame(1);

      const totalPot = PRIZE_POOL + ENTRY_FEE;
      const balBefore = await ethers.provider.getBalance(player1.address);

      await owaGame.connect(host).recordScores(1, [player1.address], [3]);

      const balAfter = await ethers.provider.getBalance(player1.address);
      expect(balAfter - balBefore).to.equal(totalPot);
    });

    it("should pay 70/30 with 2 players", async function () {
      await owaGame.connect(host).createGame(ENTRY_FEE, { value: PRIZE_POOL });
      await owaGame.connect(player1).joinGame(1, { value: ENTRY_FEE });
      await owaGame.connect(player2).joinGame(1, { value: ENTRY_FEE });
      await owaGame.connect(host).startGame(1);

      const totalPot = PRIZE_POOL + ENTRY_FEE * 2n;
      const expectedFirst = (totalPot * 70n) / 100n;
      const expectedSecond = totalPot - expectedFirst;

      const bal1Before = await ethers.provider.getBalance(player1.address);
      const bal2Before = await ethers.provider.getBalance(player2.address);

      await owaGame.connect(host).recordScores(
        1,
        [player1.address, player2.address],
        [3, 1]
      );

      const bal1After = await ethers.provider.getBalance(player1.address);
      const bal2After = await ethers.provider.getBalance(player2.address);

      expect(bal1After - bal1Before).to.equal(expectedFirst);
      expect(bal2After - bal2Before).to.equal(expectedSecond);
    });
  });
});
