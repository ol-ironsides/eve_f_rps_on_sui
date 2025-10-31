<!-- Copilot / AI agent guidance for contributors and automated coding agents -->
# Copilot instructions — rock-paper-scissors-on-sui

Purpose: short, actionable guidance so an AI agent can make safe, useful changes in this repo quickly.

Big picture
- The on-chain Move contract is `move/rps_commit_reveal.move`. It implements a commit-reveal 1v1 RPS game using a single shareable `Game` object.
- The UI is a minimal static client. Use `docs/` (prebuilt demo) to quickly validate behavior; use `frontend/` (Vite + React) for development.
- The frontend talks to Sui via a browser wallet and a fullnode RPC (`https://fullnode.testnet.sui.io` in the demo). The frontend must be given the Move `PACKAGE_ID` (placeholder in `frontend/index.html` and `docs/index.html`).

Files worth reading first
- `move/rps_commit_reveal.move` — authoritative contract. Check argument order, types, and error codes before changing client/server calls.
- `frontend/index.html` — single-file client that demonstrates wallet detection, tx construction, and how to compute commitments (keccak256) and pass arguments (object vs pure).
- `docs/index.html` — prebuilt static site (quick smoke tests).
- `frontend/package.json` & `frontend/vite.config.ts` — how to run/build the frontend.
- `README.md` — overview and deployment hints.

Authoritative references
- Consult the Move Book for language and stdlib guidance: https://move-book.com/ (primary guide).
- Reference index (types, modules, stdlib): https://move-book.com/reference — use this for precise type/ABI rules (vectors, options, modules, resource semantics).


Concrete run/build commands
- Frontend dev:
  - cd frontend
  - npm install
  - npm run dev
- Frontend build/preview:
  - npm run build
  - npm run preview
- Quick smoke: open `docs/index.html` in a browser (no build) — replace `PACKAGE_ID` after you publish the Move package to talk to mainnet/testnet.
- Move development: this repo does not include Sui tool config, but expect the standard Sui flow (confirm with maintainers): `sui move build` and `sui move publish` — update `PACKAGE_ID` in the frontend after publishing.

Important integration details & gotchas (be precise)
- Commit encoding: the frontend does keccak256([move_byte] ++ secret_bytes). The Move contract recomputes keccak256 on reveal. Keep encoding exact: first byte = move (0: Rock, 1: Paper, 2: Scissors), remainder = UTF-8 secret bytes.
- Argument kinds: frontend uses a small helper that marks arguments as `object` or `pure`. Match these to Move signatures exactly (e.g. `commit_move(game: &mut Game, player: address, commitment: vector<u8>)` requires the Game object id as an `object` arg and the commitment as a `pure` vector/array of u8).
- Wallet APIs: the client supports both the modern `signAndExecuteTransactionBlock` and legacy `signAndExecuteTransaction`. Prefer building TransactionBlock when adding features, but keep the legacy path if you need older wallets.
- Extracting Game ID: the frontend reads `objectChanges` from transaction effects to find the created Game object id — follow that pattern when writing helper code that creates games.
- Timeouts: `start_time_ms` is set when player2 joins; `claim_timeout` requires clock timestamp > `start_time_ms + timeout_ms`. Tests that involve timeouts must either mock the clock or use real network time progression.

What to change vs what to avoid
- Safe to change: client UX (styling, local demo logic in `frontend/index.html`), dev tooling in `frontend/` (Vite config, React wrappers) provided you keep the Move call semantics identical.
- Avoid changing: Move `Game` field names/types, entry function argument order, or the commit/reveal encoding without updating both the Move module and all client call sites (including `docs/index.html`). These are central invariants.

Examples (use these exact references)
- How commitment is computed (see `frontend/index.html`): `commitBytes(move, secret)` → keccak256 of a byte array whose first byte is the move value.
- Move entry points (read signatures in `move/rps_commit_reveal.move`):
  - `create_game(timeout_ms: u64, _clock: &Clock, ctx: &mut TxContext)`
  - `join_game(game: &mut Game, player: address, clock: &Clock)`
  - `commit_move(game: &mut Game, player: address, commitment: vector<u8>)`
  - `reveal_move(game: &mut Game, player: address, move_val: u8, secret: vector<u8>)`
  - `claim_timeout(game: &mut Game, clock: &Clock, caller: address)`

If you update the contract
- Build/publish with the Sui toolchain (confirm exact commands with the maintainer). After publish, update `PACKAGE_ID` in `frontend/index.html` and `docs/index.html`. Re-run client flows and verify the Game object is created and the UI can read `winner` from the Game object.

When in doubt
- Re-run the client flow against the `docs/index.html` static demo first.
- If changing Move signatures or storage, update every place that constructs move calls (search `PACKAGE_ID` and `rps_commit_reveal` across the repo).

Questions for maintainers (leave as TODO comments when editing)
- Confirm preferred Sui CLI commands and the intended `CLOCK_ID` value used in production/testnet.
- Confirm whether `docs/` should be regenerated from `frontend/` after changes, or if it's intentionally static.

End of instructions.
