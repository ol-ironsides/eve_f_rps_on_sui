module greathomes::rps_commit_reveal {
    use sui::tx_context::{TxContext, tx_context};
    use sui::object::{UID, self};
    use sui::hash;
    use sui::transfer;
    use sui::clock;

    const ROCK: u8 = 0;
    const PAPER: u8 = 1;
    const SCISSORS: u8 = 2;

    struct Game has key {
        id: UID,
        player1: address,
        player2: address,
        commit1: vector<u8>,
        commit2: vector<u8>,
        move1: option::Option<u8>,
        move2: option::Option<u8>,
        revealed_count: u8,
        start_time_ms: u64,
        timeout_ms: u64,
        winner: option::Option<address>
    }

    public entry fun create_game(ctx: &mut TxContext, timeout_ms: u64) : Game {
        let sender = tx_context::sender(ctx);
        let now = clock::now_ms();
        Game {
            id: object::new(ctx),
            player1: sender,
            player2: @0x0,
            commit1: vector::empty<u8>(),
            commit2: vector::empty<u8>(),
            move1: option::none<u8>(),
            move2: option::none<u8>(),
            revealed_count: 0,
            start_time_ms: now,
            timeout_ms,
            winner: option::none<address>()
        }
    }

    public entry fun join_game(game: &mut Game, ctx: &mut TxContext) {
        let sender = tx_context::sender(ctx);
        assert!(game.player2 == @0x0, 1);
        game.player2 = sender;
    }

    public entry fun commit_move(game: &mut Game, commitment: vector<u8>, ctx: &mut TxContext) {
        let sender = tx_context::sender(ctx);
        if (sender == game.player1) {
            assert!(vector::is_empty(&game.commit1), 2);
            game.commit1 = commitment;
        } else {
            assert!(vector::is_empty(&game.commit2), 3);
            game.commit2 = commitment;
        }
    }

    public entry fun reveal_move(game: &mut Game, move_val: u8, secret: vector<u8>, ctx: &mut TxContext) {
        let sender = tx_context::sender(ctx);
        let mut data = vector::empty<u8>();
        vector::push_back(&mut data, move_val);
        vector::append(&mut data, secret);

        let expected = hash::keccak256(data);
        if (sender == game.player1) {
            assert!(expected == game.commit1, 4);
            game.move1 = option::some(move_val);
            game.revealed_count = game.revealed_count + 1;
        } else {
            assert!(expected == game.commit2, 5);
            game.move2 = option::some(move_val);
            game.revealed_count = game.revealed_count + 1;
        }

        if (game.revealed_count == 2) {
            resolve_winner(game);
        }
    }

    fun resolve_winner(game: &mut Game) {
        let a_opt = option::borrow(&game.move1);
        let b_opt = option::borrow(&game.move2);
        if (!option::is_some(&a_opt) || !option::is_some(&b_opt)) return;

        let a = option::extract(&mut game.move1);
        let b = option::extract(&mut game.move2);

        if (a == b) {
            game.winner = option::none<address>();
            return;
        }

        let a_wins = (a == ROCK && b == SCISSORS) || (a == PAPER && b == ROCK) || (a == SCISSORS && b == PAPER);
        if (a_wins) {
            game.winner = option::some(game.player1);
        } else {
            game.winner = option::some(game.player2);
        }
    }

    public entry fun claim_timeout(game: &mut Game, ctx: &mut TxContext) {
        let _sender = tx_context::sender(ctx);
        let now = clock::now_ms();
        assert!(now > game.start_time_ms + game.timeout_ms, 6);
        if (game.revealed_count == 1) {
            if (option::is_some(&game.move1)) game.winner = option::some(game.player1);
            else if (option::is_some(&game.move2)) game.winner = option::some(game.player2);
        }
    }
}
