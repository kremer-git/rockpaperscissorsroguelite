# Rock Paper Scissors Roguelite

- Play: open `dist/index.html` (keep `dist/audio/` next to it). GitHub Pages serves the repo root; the root `index.html` forwards to `dist/`.
- Build: `node scripts/build.mjs` (writes `dist/index.html`, `dist/artifact.html`, copies `assets/audio` to `dist/audio`).
- Check before committing: `npx tsc -p .`, `npx tsx --test tests/*.test.ts`, `node tests/e2e.mjs`; balance: `npx tsx src/sim/cli.ts all 2000` (writes `reports/`).
- Every update to the game is committed and pushed here, with a rebuilt `dist/` and updated README/BALANCE notes.
- The published claude.ai version of the game is updated alongside each push.
