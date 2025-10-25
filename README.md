# Rock-paper-scissors on Sui — Prebuilt for GitHub Pages

**Deploy in 60 seconds:**
1) Create or open your repo (e.g. `ol-ironsides/eve_f`).
2) Copy everything from this ZIP into the repo.
3) Commit & push.
4) In GitHub: Settings → Pages → Source: `main` / Folder: `/docs` → Save.
5) Go to `https://ol-ironsides.github.io/eve_f/`.

**Configure on-chain:**
- Edit `docs/index.html` and replace `0xYOUR_PACKAGE_ID` with your Sui package id after you publish your Move module.
- Install a Sui-compatible wallet in your browser. On-chain actions will use it.

**Folders**
- `move/` — Move commit–reveal contract (timeouts).
- `frontend/` — Vite+React source (optional).
- `docs/` — Prebuilt static site for GitHub Pages.
