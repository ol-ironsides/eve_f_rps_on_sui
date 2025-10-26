module greathomes::rps_commit_reveal {
    use std::vector;
    use std::option;

    use sui::hash;
    use sui::object;
    use sui::object::UID;
    use sui::transfer;
    use sui::clock::{Clock, timestamp_ms};
    use sui::tx_context::TxContext;

    const ROCK: u8 = 0;
    const PAPER: u8 = 1;
    const SCISSORS: u8 = 2;

    // Error codes
    const E_ALREADY_JOINED: u64 = 1;
    const E_SELF_JOIN: u64 = 2;
    const E_NOT_PLAYER: u64 = 3;
    const E_EMPTY_COMMIT: u64 = 4;
    const E_INVALID_MOVE: u64 = 5;
    const E_BAD_REVEAL_P1: u64 = 6;
    const E_BAD_REVEAL_P2: u64 = 7;
    const E_TOO_SOON_TIMEOUT: u64 = 8;
    const E_NO_START: u64 = 9;

    /// One on-chain Game object per match.
    struct Game has key {
        id: UID,
        player1: address,
        player2: address,
        commit1: vector<u8>,
        commit2: vector<u8>,
        move1: option::Option<u8>,
        move2: option::Option<u8>,
        revealed_count: u8,
        /// Starts at 0; set when player2 joins.
        start_time_ms: u64,
        timeout_ms: u64,
        winner: option::Option<address>,
    }

    /// Create & share a new game.
    /// NOTE: we accept `_clock` to keep your existing frontend call shape, but we don't use it here.
    public entry fun create_game(timeout_ms: u64, _clock: &Clock, ctx: &mut TxContext) {
        let game = Game {
            id: object::new(ctx),
            player1: @0x0,
            player2: @0x0,
            commit1: vector::empty<u8>(),
            commit2: vector::empty<u8>(),
            move1: option::none<u8>(),
            move2: option::none<u8>(),
            revealed_count: 0,
            start_time_ms: 0, // ✅ timeout not started yet
            timeout_ms,
            winner: option::none<address>(),
        };
        transfer::share_object(game);
    }

    /// Join (fills player1 then player2). Starts the clock when player2 joins.
    public entry fun join_game(game: &mut Game, player: address, clock: &Clock) {
        if (game.player1 == @0x0) {
            game.player1 = player;
            return;
        };

        // Prevent same address joining twice
        assert!(player != game.player1, E_SELF_JOIN);

        if (game.player2 == @0x0) {
            game.player2 = player;
            if (game.start_time_ms == 0) {
                game.start_time_ms = timestamp_ms(clock); // ✅ start timeout now
            };
            return;
        };

        // Both seats taken
        assert!(false, E_ALREADY_JOINED);
    }

    /// Commit keccak256([move_byte] ++ secret_bytes). Only registered players can commit.
    public entry fun commit_move(game: &mut Game, player: address, commitment: vector<u8>) {
        assert!(vector::length(&commitment) > 0, E_EMPTY_COMMIT);
        let is_p1 = player == game.player1;
        let is_p2 = player == game.player2;
        assert!(is_p1 || is_p2, E_NOT_PLAYER);

        if (is_p1 && vector::is_empty(&game.commit1)) {
            game.commit1 = commitment;
        } else if (is_p2 && vector::is_empty(&game.commit2)) {
            game.commit2 = commitment;
        };
    }

    /// Reveal `move_val` and `secret`; verifies against commitment.
    public entry fun reveal_move(game: &mut Game, player: address, move_val: u8, secret: vector<u8>) {
        assert!(move_val <= SCISSORS, E_INVALID_MOVE);

        // Build bytes: [move_val] ++ secret
        let data = vector::empty<u8>();
        vector::push_back(&mut data, move_val);
        vector::append(&mut data, secret);
        let expected = hash::keccak256(&data);

        if (player == game.player1) {
            assert!(expected == game.commit1, E_BAD_REVEAL_P1);
            game.move1 = option::some<u8>(move_val);
            game.revealed_count = game.revealed_count + 1;
        } else if (player == game.player2) {
            assert!(expected == game.commit2, E_BAD_REVEAL_P2);
            game.move2 = option::some<u8>(move_val);
            game.revealed_count = game.revealed_count + 1;
        } else {
            assert!(false, E_NOT_PLAYER);
        };

        if (game.revealed_count == 2) {
            resolve_winner(game);
        };
    }

    /// Claim after timeout; only a registered player can call.
    public entry fun claim_timeout(game: &mut Game, clock: &Clock, caller: address) {
        assert!(caller == game.player1 || caller == game.player2, E_NOT_PLAYER);
        assert!(game.start_time_ms > 0, E_NO_START);

        let now = timestamp_ms(clock);
        assert!(now > game.start_time_ms + game.timeout_ms, E_TOO_SOON_TIMEOUT);

        if (game.revealed_count == 1) {
            if (option::is_some<u8>(&game.move1) && caller == game.player1) {
                game.winner = option::some<address>(game.player1);
            } else if (option::is_some<u8>(&game.move2) && caller == game.player2) {
                game.winner = option::some<address>(game.player2);
            };
        };
    }

    fun resolve_winner(game: &mut Game) {
        if (!option::is_some<u8>(&game.move1) || !option::is_some<u8>(&game.move2)) {
            return;
        };

        let a = option::extract<u8>(&mut game.move1);
        let b = option::extract<u8>(&mut game.move2);

        if (a == b) {
            game.winner = option::none<address>();
            return;
        };

        let a_wins =
            (a == ROCK && b == SCISSORS) ||
            (a == PAPER && b == ROCK) ||
            (a == SCISSORS && b == PAPER);

        if (a_wins) {
            game.winner = option::some<address>(game.player1);
        } else {
            game.winner = option::some<address>(game.player2);
        };
    }
}
