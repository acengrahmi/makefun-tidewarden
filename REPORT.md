# TIDEWARDEN — best-game-01 entry, build report

A tidal tower-defense game written from scratch for this entry: vanilla JS ES
modules on a 2D canvas, no libraries, no network requests, keyboard + mouse.
The tide alternates every wave — at high tide the six low build plots flood and
their towers sleep underwater while boat enemies sail two water lanes; the
eight high plots never flood. Twelve waves, five tower kinds × three levels,
eight enemy kinds, three multi-phase bosses (waves 4, 8, 12), three
difficulties, and a full economy (wave bonus, 6% hoard interest capped at 40,
flawless bonus, kill-streak combo multiplier, 70% sell refund).

## Layout

- `main.ts` — entrypoint: copies `game/` + `screenshots/` to the output dir and
  writes `dossier.json` via `buildDossier` from the kit vendor file (unchanged,
  sha256 `dc67187521b24025ff952f8c231485a6eb92d6d71d29edd2a08154ffb4376129`).
- `game/index.html` + `game/src/` — one file per job: `config.js` (map, plots,
  palette, layouts), `tide.js`, `economy.js`, `towers.js`, `enemies.js`,
  `waves.js`, `audio.js` (generative WebAudio music + synthesized SFX),
  `input.js`, `render.js`, `screens.js`, `main.js` (state machine + the
  deterministic `?shot=<scene>&seed=<n>` staging used for screenshots).
- `tools/` — `logic-tests.mjs` (headless rules tests), `capture.mjs`
  (screenshot renderer over CDP), `playtest.mjs` (interactive CDP play-test).

## Measured validation

- **Logic tests: 32 passed, 0 failed** (`node tools/logic-tests.mjs`).
  Coverage: economy math (start gold 230, combo ×1.02 on the second kill,
  settle = bonus 30 + capped interest + flawless 15, sell refund = 70%
  floored); build/upgrade/sell (bolt 50 → upgrades 45/80 → invested 175 →
  refund 122); tide alternation and dormancy (a low-plot tower deals zero
  damage at high tide, wakes at low tide); water-lane routing (skiffs sail the
  lane paths, raiders walk the road); boss phases (phase 2 under 2/3 HP,
  phase 3 under 1/3 HP with armor up); win on clearing wave 12 (17 lives →
  3 stars), defeat on a leak at 1 life, title/restart reset.
- **Autopilot: a fixed 34-step shopping list WINS Normal** — victory with
  5 lives left, 283 kills, score 31,100. Balance was tuned against this test
  over several measured iterations (boss HP is priced by route coverage: the
  road boss is the toughest hull, the lane bosses are escort fights).
- **Build determinism:** `MAKEFUN_OUTPUT_DIR=<dir> node main.ts` run twice —
  outputs byte-identical (`diff -r` clean). `dossier.json` = **657,299 bytes**
  (cap 1.5 MiB). `game/` = **12 files, 94,195 bytes** of source text (caps:
  993 files, 48 MiB, ~160 KiB dossier text). The kit's own `buildDossier`
  cap checks pass.

## Screenshots (headless Chromium, real renders, seed 7)

| file | bytes | scene |
| --- | --- | --- |
| `screenshots/1-title.jpg` | 107,979 | title over the bay: tagline, three how-to cards, three difficulty cards |
| `screenshots/2-play.jpg` | 111,225 | wave 3 at low tide: road action, HUD, build cards, selected tower + upgrade/sell |
| `screenshots/3-tide.jpg` | 129,972 | wave 8 at high tide: flooded plots, two dormant towers asleep ("z z"), boats on both lanes, Dread Barge boss bar at PHASE 2 |
| `screenshots/4-victory.jpg` | 70,407 | "THE BAY HOLDS!" — 3 stars, full stats, PLAY AGAIN |

All four are 1280×720 JPEGs under the 256 KiB cap, captured with
**0 console errors and 0 requests outside localhost**. They were viewed and
revised once: the first pass had the tide note colliding with the BUILD hint
in the side panel, two info-box lines overflowing the panel width, and the
victory footer sitting on the panel border — all three fixed in `render.js` /
`screens.js` and re-captured.

## Interactive play-test (headless Chromium, real input events)

`node tools/playtest.mjs` clicked through the actual game: title → NORMAL
card → build phase; clicked plot (1,3) and a Bolt Spire was raised (gold
230 → 180, info box shows Lv 1 stats, UPGRADE ◉45, SELL +◉35 = 70% of 50);
clicked START WAVE 1 and watched kills register (score 60, tower at 1 kill,
"WAVE 1 — 9 left"); pressed P and confirmed the frame freezes exactly
(two captures 1.5 s apart byte-identical), then resumed and doubled speed.
0 console errors, 0 outside requests throughout.

## Notes for the pipeline

- Nothing has been submitted and no GitHub repo created — this directory is
  the finished build only, committed locally.
- `serve.ts` plays the game locally at http://localhost:8080.
- Difficulty check: the autopilot test covers Normal; Calm (hull ×0.8,
  salvage ×1.15) is strictly easier, Storm (hull ×1.3, salvage ×0.9) is the
  challenge mode and is expected to need adaptive sell/rebuild play.
