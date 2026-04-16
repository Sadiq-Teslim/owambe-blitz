// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract OwaGame {
    using SafeERC20 for IERC20;

    enum GameState { OPEN, FINISHED }

    struct Game {
        address host;
        uint256 prizePool;
        GameState state;
        address token;                    // address(0) = ETH, otherwise ERC-20
        uint256[] sharePercentages;
        address[] rankedPlayers;
        mapping(address => uint256) payoutAmounts;
    }

    uint256 public gameCount;
    address public admin;
    uint256 public constant PLATFORM_FEE_BPS = 250; // 2.5%

    mapping(uint256 => Game) private games;

    event GameCreated(uint256 indexed gameId, address indexed host, uint256 prizePool, address token, uint256[] sharePercentages);
    event Payout(uint256 indexed gameId, address indexed player, uint256 amount, uint256 rank);
    event GameFinished(uint256 indexed gameId, uint256 feeAmount);

    modifier onlyHost(uint256 _gameId) {
        require(games[_gameId].host == msg.sender, "Only host");
        _;
    }

    constructor(address _admin) {
        require(_admin != address(0), "Invalid admin");
        admin = _admin;
    }

    /// @notice Host creates a game with ETH (token = address(0)) or an ERC-20
    function createGame(
        uint256[] calldata _sharePercentages,
        address _token,
        uint256 _amount
    ) external payable returns (uint256) {
        uint256 prizePool;

        if (_token == address(0)) {
            // ETH game
            require(msg.value > 0, "Must deposit prize pool");
            prizePool = msg.value;
        } else {
            // ERC-20 game
            require(msg.value == 0, "Do not send ETH for token games");
            require(_amount > 0, "Must deposit prize pool");
            IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
            prizePool = _amount;
        }

        gameCount++;
        uint256 gameId = gameCount;

        Game storage g = games[gameId];
        g.host = msg.sender;
        g.prizePool = prizePool;
        g.state = GameState.OPEN;
        g.token = _token;

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

        emit GameCreated(gameId, msg.sender, prizePool, _token, g.sharePercentages);
        return gameId;
    }

    /// @notice Host submits winner wallet addresses (ranked) and triggers payout.
    ///         Deducts 2.5% platform fee first, then distributes the rest.
    function payoutWinners(
        uint256 _gameId,
        address[] calldata _winners
    ) external onlyHost(_gameId) {
        Game storage g = games[_gameId];
        require(g.state == GameState.OPEN, "Game already finished");
        require(_winners.length > 0, "Need at least 1 winner");

        // Deduct platform fee
        uint256 fee = (g.prizePool * PLATFORM_FEE_BPS) / 10_000;
        uint256 pot = g.prizePool - fee;

        // Send fee to admin
        _transfer(g.token, admin, fee);

        uint256 winnerSlots = g.sharePercentages.length;
        uint256 actualWinners = _winners.length < winnerSlots ? _winners.length : winnerSlots;

        // Store ranked players
        for (uint256 i = 0; i < _winners.length; i++) {
            g.rankedPlayers.push(_winners[i]);
        }

        g.state = GameState.FINISHED;
        emit GameFinished(_gameId, fee);

        // Calculate shares — if fewer winners than slots, redistribute proportionally
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

            g.payoutAmounts[_winners[i]] = amount;

            _transfer(g.token, _winners[i], amount);
            emit Payout(_gameId, _winners[i], amount, i + 1);
        }
    }

    /// @dev Internal transfer helper — handles ETH and ERC-20
    function _transfer(address _token, address _to, uint256 _amount) internal {
        if (_amount == 0) return;
        if (_token == address(0)) {
            (bool sent, ) = _to.call{value: _amount}("");
            require(sent, "ETH transfer failed");
        } else {
            IERC20(_token).safeTransfer(_to, _amount);
        }
    }

    // ── View Functions ──────────────────────────────────────────

    function getGame(uint256 _gameId) external view returns (
        address host,
        uint256 prizePool,
        GameState state,
        address token,
        uint256[] memory sharePercentages
    ) {
        Game storage g = games[_gameId];
        return (g.host, g.prizePool, g.state, g.token, g.sharePercentages);
    }

    function getRankedPlayers(uint256 _gameId) external view returns (address[] memory) {
        return games[_gameId].rankedPlayers;
    }

    function getPayoutAmount(uint256 _gameId, address _player) external view returns (uint256) {
        return games[_gameId].payoutAmounts[_player];
    }
}
