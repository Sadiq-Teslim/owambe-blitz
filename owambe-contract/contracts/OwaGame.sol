// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract OwaGame {
    enum GameState { OPEN, ACTIVE, FINISHED }

    struct Game {
        address host;
        uint256 prizePool;
        GameState state;
        address[] players;
        uint256[] sharePercentages; // e.g. [60, 30, 10] — must sum to 100
        mapping(address => bool) hasJoined;
        mapping(address => uint256) scores;
        address[] rankedPlayers;
    }

    uint256 public gameCount;
    mapping(uint256 => Game) private games;

    event GameCreated(uint256 indexed gameId, address indexed host, uint256 prizePool, uint256[] sharePercentages);
    event PlayerJoined(uint256 indexed gameId, address indexed player);
    event GameStarted(uint256 indexed gameId);
    event ScoresRecorded(uint256 indexed gameId);
    event Payout(uint256 indexed gameId, address indexed player, uint256 amount, uint256 rank);

    modifier onlyHost(uint256 _gameId) {
        require(games[_gameId].host == msg.sender, "Only host");
        _;
    }

    /// @notice Host creates a game, deposits prize pool, sets sharing formula
    /// @param _sharePercentages Array of percentages for winners (must sum to 100). Pass empty for default [60, 30, 10].
    function createGame(uint256[] calldata _sharePercentages) external payable returns (uint256) {
        require(msg.value > 0, "Must deposit prize pool");

        gameCount++;
        uint256 gameId = gameCount;

        Game storage g = games[gameId];
        g.host = msg.sender;
        g.prizePool = msg.value;
        g.state = GameState.OPEN;

        if (_sharePercentages.length == 0) {
            // Default: 60/30/10
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

    /// @notice Player joins a game for free
    function joinGame(uint256 _gameId) external {
        Game storage g = games[_gameId];
        require(g.host != address(0), "Game does not exist");
        require(g.state == GameState.OPEN, "Game not open");
        require(!g.hasJoined[msg.sender], "Already joined");
        require(msg.sender != g.host, "Host cannot join");

        g.hasJoined[msg.sender] = true;
        g.players.push(msg.sender);

        emit PlayerJoined(_gameId, msg.sender);
    }

    /// @notice Host starts the game — no more players can join
    function startGame(uint256 _gameId) external onlyHost(_gameId) {
        Game storage g = games[_gameId];
        require(g.state == GameState.OPEN, "Game not open");
        require(g.players.length >= 1, "Need at least 1 player");
        g.state = GameState.ACTIVE;

        emit GameStarted(_gameId);
    }

    /// @notice Host submits final scores and triggers payout
    function recordScores(
        uint256 _gameId,
        address[] calldata _players,
        uint256[] calldata _scores
    ) external onlyHost(_gameId) {
        Game storage g = games[_gameId];
        require(g.state == GameState.ACTIVE, "Game not active");
        require(_players.length == _scores.length, "Length mismatch");

        for (uint256 i = 0; i < _players.length; i++) {
            require(g.hasJoined[_players[i]], "Not a player");
            g.scores[_players[i]] = _scores[i];
        }

        // Sort players by score descending — insertion sort, max ~50 players
        address[] memory sorted = new address[](_players.length);
        for (uint256 i = 0; i < _players.length; i++) {
            sorted[i] = _players[i];
        }

        for (uint256 i = 1; i < sorted.length; i++) {
            address key = sorted[i];
            uint256 keyScore = g.scores[key];
            int256 j = int256(i) - 1;
            while (j >= 0 && g.scores[sorted[uint256(j)]] < keyScore) {
                sorted[uint256(j + 1)] = sorted[uint256(j)];
                j--;
            }
            sorted[uint256(j + 1)] = key;
        }

        for (uint256 i = 0; i < sorted.length; i++) {
            g.rankedPlayers.push(sorted[i]);
        }

        g.state = GameState.FINISHED;
        emit ScoresRecorded(_gameId);

        _payout(_gameId, sorted);
    }

    function _payout(uint256 _gameId, address[] memory _sorted) internal {
        Game storage g = games[_gameId];
        uint256 pot = g.prizePool;
        uint256 playerCount = _sorted.length;
        uint256 winnerSlots = g.sharePercentages.length;

        if (playerCount == 0) {
            // No players — refund host
            (bool sent, ) = g.host.call{value: pot}("");
            require(sent, "Refund failed");
            return;
        }

        // Number of actual winners = min(playerCount, winnerSlots)
        uint256 actualWinners = playerCount < winnerSlots ? playerCount : winnerSlots;

        if (actualWinners < winnerSlots) {
            // Fewer players than winner slots — redistribute shares among existing players
            // Recalculate: take only the first `actualWinners` shares and scale to 100
            uint256 usedTotal = 0;
            for (uint256 i = 0; i < actualWinners; i++) {
                usedTotal += g.sharePercentages[i];
            }

            uint256 paid = 0;
            for (uint256 i = 0; i < actualWinners; i++) {
                uint256 amount;
                if (i == actualWinners - 1) {
                    amount = pot - paid; // last winner gets remainder
                } else {
                    amount = (pot * g.sharePercentages[i]) / usedTotal;
                }
                paid += amount;

                (bool sent, ) = _sorted[i].call{value: amount}("");
                require(sent, "Payout failed");
                emit Payout(_gameId, _sorted[i], amount, i + 1);
            }
        } else {
            // Normal case — enough players for all winner slots
            uint256 paid = 0;
            for (uint256 i = 0; i < winnerSlots; i++) {
                uint256 amount;
                if (i == winnerSlots - 1) {
                    amount = pot - paid; // last winner gets remainder to avoid rounding loss
                } else {
                    amount = (pot * g.sharePercentages[i]) / 100;
                }
                paid += amount;

                (bool sent, ) = _sorted[i].call{value: amount}("");
                require(sent, "Payout failed");
                emit Payout(_gameId, _sorted[i], amount, i + 1);
            }
        }
    }

    // ── View Functions ──────────────────────────────────────────

    function getGame(uint256 _gameId) external view returns (
        address host,
        uint256 prizePool,
        GameState state,
        uint256 playerCount,
        uint256[] memory sharePercentages
    ) {
        Game storage g = games[_gameId];
        return (g.host, g.prizePool, g.state, g.players.length, g.sharePercentages);
    }

    function getPlayers(uint256 _gameId) external view returns (address[] memory) {
        return games[_gameId].players;
    }

    function getRankedPlayers(uint256 _gameId) external view returns (address[] memory) {
        return games[_gameId].rankedPlayers;
    }

    function getScore(uint256 _gameId, address _player) external view returns (uint256) {
        return games[_gameId].scores[_player];
    }

    function hasPlayerJoined(uint256 _gameId, address _player) external view returns (bool) {
        return games[_gameId].hasJoined[_player];
    }
}
