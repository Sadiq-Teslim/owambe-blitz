// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract OwaGame {
    enum GameState { OPEN, ACTIVE, FINISHED }

    struct Game {
        address host;
        uint256 prizePool;
        uint256 entryFee;
        GameState state;
        address[] players;
        mapping(address => bool) hasJoined;
        mapping(address => uint256) scores;
        address[] rankedPlayers;
    }

    uint256 public gameCount;
    mapping(uint256 => Game) private games;

    event GameCreated(uint256 indexed gameId, address indexed host, uint256 prizePool, uint256 entryFee);
    event PlayerJoined(uint256 indexed gameId, address indexed player);
    event GameStarted(uint256 indexed gameId);
    event ScoresRecorded(uint256 indexed gameId);
    event Payout(uint256 indexed gameId, address indexed player, uint256 amount, uint256 rank);

    modifier onlyHost(uint256 _gameId) {
        require(games[_gameId].host == msg.sender, "Only host");
        _;
    }

    /// @notice Host creates a game, deposits prize pool, sets entry fee
    function createGame(uint256 _entryFee) external payable returns (uint256) {
        require(msg.value > 0, "Must deposit prize pool");

        gameCount++;
        uint256 gameId = gameCount;

        Game storage g = games[gameId];
        g.host = msg.sender;
        g.prizePool = msg.value;
        g.entryFee = _entryFee;
        g.state = GameState.OPEN;

        emit GameCreated(gameId, msg.sender, msg.value, _entryFee);
        return gameId;
    }

    /// @notice Player joins a game by paying the entry fee
    function joinGame(uint256 _gameId) external payable {
        Game storage g = games[_gameId];
        require(g.host != address(0), "Game does not exist");
        require(g.state == GameState.OPEN, "Game not open");
        require(!g.hasJoined[msg.sender], "Already joined");
        require(msg.sender != g.host, "Host cannot join");
        require(msg.value == g.entryFee, "Wrong entry fee");

        g.hasJoined[msg.sender] = true;
        g.players.push(msg.sender);
        g.prizePool += msg.value;

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

        // Verify all addresses are actual players
        for (uint256 i = 0; i < _players.length; i++) {
            require(g.hasJoined[_players[i]], "Not a player");
            g.scores[_players[i]] = _scores[i];
        }

        // Sort players by score (descending) — simple insertion sort, max ~20 players
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

        // Store ranked players
        for (uint256 i = 0; i < sorted.length; i++) {
            g.rankedPlayers.push(sorted[i]);
        }

        g.state = GameState.FINISHED;
        emit ScoresRecorded(_gameId);

        // Payout
        _payout(_gameId, sorted);
    }

    function _payout(uint256 _gameId, address[] memory _sorted) internal {
        Game storage g = games[_gameId];
        uint256 pot = g.prizePool;
        uint256 playerCount = _sorted.length;

        if (playerCount == 0) {
            // No players — refund host
            (bool sent, ) = g.host.call{value: pot}("");
            require(sent, "Refund failed");
            return;
        }

        if (playerCount == 1) {
            // 1 player — they get everything
            (bool sent, ) = _sorted[0].call{value: pot}("");
            require(sent, "Payout failed");
            emit Payout(_gameId, _sorted[0], pot, 1);
            return;
        }

        if (playerCount == 2) {
            // 2 players — 70% / 30%
            uint256 prize1 = (pot * 70) / 100;
            uint256 prize2 = pot - prize1;

            (bool ok1, ) = _sorted[0].call{value: prize1}("");
            require(ok1, "Payout 1 failed");
            emit Payout(_gameId, _sorted[0], prize1, 1);

            (bool ok2, ) = _sorted[1].call{value: prize2}("");
            require(ok2, "Payout 2 failed");
            emit Payout(_gameId, _sorted[1], prize2, 2);
            return;
        }

        // 3+ players — 60% / 30% / 10%
        uint256 first = (pot * 60) / 100;
        uint256 second = (pot * 30) / 100;
        uint256 third = pot - first - second; // remainder to avoid rounding loss

        (bool sent1, ) = _sorted[0].call{value: first}("");
        require(sent1, "Payout 1 failed");
        emit Payout(_gameId, _sorted[0], first, 1);

        (bool sent2, ) = _sorted[1].call{value: second}("");
        require(sent2, "Payout 2 failed");
        emit Payout(_gameId, _sorted[1], second, 2);

        (bool sent3, ) = _sorted[2].call{value: third}("");
        require(sent3, "Payout 3 failed");
        emit Payout(_gameId, _sorted[2], third, 3);
    }

    // ── View Functions ──────────────────────────────────────────

    function getGame(uint256 _gameId) external view returns (
        address host,
        uint256 prizePool,
        uint256 entryFee,
        GameState state,
        uint256 playerCount
    ) {
        Game storage g = games[_gameId];
        return (g.host, g.prizePool, g.entryFee, g.state, g.players.length);
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
