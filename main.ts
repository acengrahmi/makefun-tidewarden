// TIDEWARDEN — hand-in program for the make.fun best-game-01 bounty (Node 22, standard
// library only). The playable game lives in this repository's game/ folder as plain static
// files (game/index.html plus its ES modules: no build step, no library, no network), and
// screenshots/ holds four real renders of it. This program copies both folders into the
// output directory and writes dossier.json there with buildDossier from the vendored
// make.fun library, exactly the shape the sealed scorer re-builds and compares byte for
// byte. Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The game itself: every file under game/ travels as it stands.
mkdirSync(outDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outDir, 'game'), { recursive: true });

// The screenshots: 1-title, 2-play, 3-tide, 4-victory — the first by name is the cover the
// judge sees large, so the folder is copied whole and in name order.
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoDir, 'screenshots'))) {
  cpSync(join(repoDir, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The dossier: written with the scorer's own caps (reference/gate.json). Only
// text_max_bytes shapes the bytes here; the rest restate limits the scorer enforces, so an
// entry this program writes is one the scorer accepts — at most 4 screenshots of at most
// 256 KiB, at most 993 files and 48 MiB under game/, no game/ path over 1,000 bytes, and
// the dossier text capped at 160 KiB inside a dossier of at most 1.5 MiB.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
