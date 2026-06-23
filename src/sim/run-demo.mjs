// Demo / smoke test for the headless sim. Run with:
//   node src/sim/run-demo.mjs
// It loads a real campaign level, (1) lets an enemy AI play it solo, and
// (2) measures raw step throughput with a random agent through the RL env —
// to confirm the env is headless and fast enough for training.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { HeadlessGame } from './headlessSim.js';
import { GridTanksEnv } from './env.js';

const here = dirname(fileURLToPath(import.meta.url));
const mapPath = join(here, '..', '..', '..', 'backend', 'maps', 'level_1.txt');
const mapText = readFileSync(mapPath, 'utf8');

// --- 1. Watch an AI tank play the level solo ---
const aiGame = new HeadlessGame({ playerSelector: 'red' });
aiGame.loadMap(mapText);
let frame = 0;
let outcome = 'timeout';
for (; frame < 6000; frame++) {
    const event = aiGame.step(null, 1);
    if (event === 'level_complete') { outcome = 'AI cleared the level'; break; }
    if (event === 'player_dead') { outcome = 'AI tank died'; break; }
}
console.log(`[AI-plays] red tank: ${outcome} after ${frame} frames (enemies left: ${aiGame.teamB.length})`);

// --- 2. Throughput: random agent through the env ---
const env = new GridTanksEnv(new HeadlessGame({ playerSelector: 'player' }), mapText);
let obs = env.reset();
console.log(`[env] observation length: ${obs.length}`);

const TOTAL = 200000;
let episodes = 0;
let steps = 0;
const start = process.hrtime.bigint();
for (let i = 0; i < TOTAL; i++) {
    const action = { move: Math.floor(Math.random() * 9), fire: Math.random() < 0.3 ? 1 : 0 };
    const { done } = env.step(action);
    steps++;
    if (done) { env.reset(); episodes++; }
}
const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
const perSec = Math.round((steps / elapsedMs) * 1000);
console.log(`[env] ${steps} steps across ${episodes} episodes in ${elapsedMs.toFixed(0)}ms → ${perSec.toLocaleString()} steps/sec (single-threaded)`);
console.log(`[env] ~${(perSec * 16 / 1e6).toFixed(1)}M steps/sec projected across 16 parallel envs`);
