// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract OwaGame {
    enum GameState { OPEN, FINISHED }

    struct Game {
        address host;
        uint256 prizePool;
        GameState state;
        uint256[] sharePercentages;
        address[] rankedPlayers;
        mapping(address => uint256) payoutAmounts;
    }

    uint256 public gameCount;
    mapping(uint256 => Game) private games;

    event GameCreated(uint256 indexed gameId, address indexed host, uint256 prizePool, uint256[] sharePercentages);
    event Payout(uint256 indexed gameId, address indexed player, uint256 amount, uint256 rank);
    event GameFinished(uint256 indexed gameId);

    modifier onlyHost(uint256 _gameId) {
        require(games[_gameId].host == msg.sender, "Only host");
        _;
    }

    /// @notice Host creates a game and deposits the prize pool
    function createGame(uint256[] calldata _sharePercentages) external payable returns (uint256) {
        require(msg.value > 0, "Must deposit prize pool");

        gameCount++;
        uint256 gameId = gameCount;

        Game storage g = games[gameId];
        g.host = msg.sender;
        g.prizePool = msg.value;
        g.state = GameState.OPEN;

        if (_sharePercentages.length == 0) {
            g.sharePercentages.push(60);
            g.sharePercentages.push(30);
            g.sharePercentages.push(10);
        } else {
            uint256 total = 0;
            for (uint256 i = 0; i < _sharePercentages.length; i++) {
                require(_sharePercentages[i] > 0, "Share must be > 0");
                total += _sharePercentages[i];
                g.sharePercentages.push(_sharePercentages[i]);
            }
            require(total == 100, "Shares must sum to 100");
        }

        emit GameCreated(gameId, msg.sender, msg.value, g.sharePercentages);
        return gameId;
    }

    /// @notice Host submits winner wallet addresses (ranked) and triggers payout
    /// @param _winners Wallet addresses in order: 1st place, 2nd place, etc.
    function payoutWinners(
        uint256 _gameId,
        address[] calldata _winners
    ) external onlyHost(_gameId) {
        Game storage g = games[_gameId];
        require(g.state == GameState.OPEN, "Game already finished");
        require(_winners.length > 0, "Need at least 1 winner");

        uint256 pot = g.prizePool;
        uint256 winnerSlots = g.sharePercentages.length;
        uint256 actualWinners = _winners.length < winnerSlots ? _winners.length : winnerSlots;

        // Store ranked players
        for (uint256 i = 0; i < _winners.length; i++) {
            g.rankedPlayers.push(_winners[i]);
        }

        g.state = GameState.FINISHED;
        emit GameFinished(_gameId);

        // Calculate shares — if fewer winners than slots, redistribute proportionally
        uint256 usedTotal = 0;
        for (uint256 i = 0; i < actualWinners; i++) {
            usedTotal += g.sharePercentages[i];
        }

        // If all slots filled, usedTotal should be 100
        // If fewer winners, we scale up so they split the full pot

        uint256 paid = 0;
        for (uint256 i = 0; i < actualWinners; i++) {
            uint256 amount;
            if (i == actualWinners - 1) {
                amount = pot - paid; // last winner gets remainder
            } else {
                amount = (pot * g.sharePercentages[i]) / usedTotal;
            }
            paid += amount;

            g.payoutAmounts[_winners[i]] = amount;

            (bool sent, ) = _winners[i].call{value: amount}("");
            require(sent, "Payout failed");
            emit Payout(_gameId, _winners[i], amount, i + 1);
        }
    }

    // ── View Functions ──────────────────────────────────────────

    function getGame(uint256 _gameId) external view returns (
        address host,
        uint256 prizePool,
        GameState state,
        uint256[] memory sharePercentages
    ) {
        Game storage g = games[_gameId];
        return (g.host, g.prizePool, g.state, g.sharePercentages);
    }

    function getRankedPlayers(uint256 _gameId) external view returns (address[] memory) {
        return games[_gameId].rankedPlayers;
    }

    function getPayoutAmount(uint256 _gameId, address _player) external view returns (uint256) {
        return games[_gameId].payoutAmounts[_player];
    }
}
