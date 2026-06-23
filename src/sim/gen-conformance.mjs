// Generates conformance fixtures from the JS headless sim: runs a seeded game
// with a scripted action sequence and records the exact per-frame tank/bullet
// positions. The Python sim replays the same seed + actions and must reproduce
// the trajectories (see agent/tests/test_conformance.py).
//
// Run: node src/sim/gen-conformance.mjs
//
// NOTE: this bridges two repos — it writes fixtures into ../agent. Regenerate
// whenever the shared game logic changes.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HeadlessGame } from './headlessSim.js';
import { mulberry32 } from './mulberry32.js';
import { buildObservation, snapshotFromHeadless } from './observation.js';

const here = dirname(fileURLToPath(import.meta.url));
const mapsDir = join(here, '..', '..', '..', 'backend', 'maps');
const outDir = join(here, '..', '..', '..', 'agent', 'tests', 'fixtures');
mkdirSync(outDir, { recursive: true });

const FRAMES = 220;

function generate(seed, level) {
    const mapText = readFileSync(join(mapsDir, `level_${level}.txt`), 'utf8');
    const game = new HeadlessGame({ playerSelector: 'player', rng: mulberry32(seed) });
    game.loadMap(mapText);
    const actionRng = mulberry32(seed + 777);

    const frames = [];
    for (let f = 0; f < FRAMES; f++) {
        if (!game.player) break;
        const ang = f * 0.13;
        const aimX = game.player.body.x + Math.cos(ang) * 120;
        const aimY = game.player.body.y + Math.sin(ang) * 120;
        const action = {
            keys: { w: actionRng() < 0.4, a: actionRng() < 0.4, s: actionRng() < 0.4, d: actionRng() < 0.4 },
            aimX, aimY,
            fire: actionRng() < 0.5
        };
        const event = game.step(action, 1);
        frames.push({
            a: action,
            tanks: game.tanks.map((t) => [t.body.x, t.body.y, t.id]),
            bullets: game.bullets.map((b) => [b.body.x, b.body.y]),
            obs: Array.from(buildObservation(snapshotFromHeadless(game)))
        });
        if (event) break;
    }

    const out = { seed, level, frames };
    const path = join(outDir, `level${level}_seed${seed}.json`);
    writeFileSync(path, JSON.stringify(out));
    console.log(`wrote ${path} (${frames.length} frames)`);
}

for (const seed of [12345, 99, 2026]) {
    generate(seed, 1);
}
generate(7, 3);
