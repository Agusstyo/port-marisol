// Port Marisol — hand-in program for the make.fun gta6-01 bounty (Node 22, standard library only).
//
// The game itself is the static site in game/ (open game/index.html in a desktop browser, fully
// offline). This program's whole job is delivery: copy game/ and screenshots/ from beside this
// file into the output directory, then write dossier.json there with buildDossier from
// vendor/makefun-game.ts — the kit's library, byte for byte the scorer's own copy, so the dossier
// the gate rebuilds from the same files matches this one exactly.
//
// Run it the way the grader does, with MAKEFUN_OUTPUT_DIR naming the output outside the grader:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's caps, mirrored from the kit's reference gate so this program refuses locally what
// the scorer would refuse: dossier text, screenshot count and size, game tree size and paths.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function deliverGameTree() {
  cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
}

function deliverScreenshots() {
  const target = join(outputDir, 'screenshots');
  mkdirSync(target, { recursive: true });
  const source = join(repoRoot, 'screenshots');
  if (existsSync(source)) cpSync(source, target, { recursive: true });
}

mkdirSync(outputDir, { recursive: true });
deliverGameTree();
deliverScreenshots();
writeFileSync(join(outputDir, 'dossier.json'), buildDossier(outputDir, DOSSIER_CAPS));
console.log(`Port Marisol delivered to ${outputDir} (game/, screenshots/, dossier.json)`);
