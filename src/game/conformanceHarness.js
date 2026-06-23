// In-browser conformance: runs the REAL PixiJS game and the headless JS sim
// (frontend/src/sim/headlessSim.js) with the same seed + same scripted actions,
// and reports the largest trajectory divergence. This closes the last link in
// the chain — the headless sim is already verified bit-identical to the Python
// training sim, so if the real game matches the headless sim, a policy trained
// in Python is valid here.
//
// It needs a DOM (the real Game creates a PixiJS Application), so it runs in a
// browser, not Node. Under `vite dev` you can drive it straight from the page:
//
//   const h = await import('/src/game/conformanceHarness.js');
//   await h.runConformance(7, 3, 120, mapText);   // seed, level, frames, map
//
// Pass the map text in directly (the driver reads backend/maps/level_N.txt), so
// nothing has to be copied into public/ and the shipped bundle is untouched.
//
// Both engines draw gameplay randomness from the SAME seed: the headless sim via
// its injected mulberry32, the real game via gameRandom.seedGameRandom — so the
// enemy AI makes identical decisions and the paths should coincide.

import { Game } from './Game.js';
import { seedGameRandom, clearGameRandom } from './gameRandom.js';
import { HeadlessGame } from '../sim/headlessSim.js';
import { mulberry32 } from '../sim/mulberry32.js';

// Identical to the scripted actions in gen-conformance.mjs, so the same seed
// produces the same input stream the Python fixtures already validate against.
function makeActions(seed, frames, playerX0) {
    const rng = mulberry32(seed + 777);
    const actions = [];
    for (let f = 0; f < frames; f++) {
        const ang = f * 0.13;
        actions.push({
            keys: { w: rng() < 0.4, a: rng() < 0.4, s: rng() < 0.4, d: rng() < 0.4 },
            // aim is relative to the spawn X so both engines compute the same angle
            angle: ang,
            fire: rng() < 0.5,
        });
    }
    return actions;
}

function aimFor(action, baseX, baseY) {
    return { aimX: baseX + Math.cos(action.angle) * 120, aimY: baseY + Math.sin(action.angle) * 120 };
}

export async function runConformance(seed, level, frames, mapText) {
    frames = frames || 120;
    if (!mapText) throw new Error('pass the map text as the 4th argument');

    // --- real game ---
    seedGameRandom(seed);
    const game = new Game({ sessionMode: 'solo', playerSelector: 'player' });
    const parsed = game.parseMapData(mapText);
    game.updateMap(parsed);
    game.countdown = null; // skip the "Get Ready" freeze
    game.transition = null;
    const spawnX = game.player.body.x;
    const spawnY = game.player.body.y;

    const actions = makeActions(seed, frames, spawnX);

    const gameTrace = [];
    for (let f = 0; f < frames; f++) {
        if (!game.player || game.transition) break; // death / level clear ends it
        const a = actions[f];
        const { aimX, aimY } = aimFor(a, game.player.body.x, game.player.body.y);
        game.mouseX = aimX;
        game.mouseY = aimY;
        game.player.keyState = { ...a.keys };
        game.player.setMouseDown(a.fire);
        game.gameLoop(1);
        gameTrace.push({
            tanks: game.tanks.map((t) => [t.body.x, t.body.y, t.id]),
            bullets: (game.allBullets || []).map((b) => [b.body.x, b.body.y]),
        });
    }
    clearGameRandom();
    game.destroy?.();

    // --- headless sim ---
    const sim = new HeadlessGame({ playerSelector: 'player', rng: mulberry32(seed) });
    sim.loadMap(mapText);
    const simTrace = [];
    for (let f = 0; f < frames; f++) {
        if (!sim.player) break;
        const a = actions[f];
        const { aimX, aimY } = aimFor(a, sim.player.body.x, sim.player.body.y);
        const event = sim.step({ keys: a.keys, aimX, aimY, fire: a.fire }, 1);
        simTrace.push({
            tanks: sim.tanks.map((t) => [t.body.x, t.body.y, t.id]),
            bullets: sim.bullets.map((b) => [b.body.x, b.body.y]),
        });
        if (event) break;
    }

    // --- diff ---
    const n = Math.min(gameTrace.length, simTrace.length);
    let maxDiff = 0;
    let firstDivergeFrame = -1;
    let detail = null;
    for (let f = 0; f < n; f++) {
        const g = gameTrace[f];
        const s = simTrace[f];
        let frameDiff = 0;
        if (g.tanks.length !== s.tanks.length) {
            return { seed, level, framesCompared: f, maxDiff, firstDivergeFrame: f,
                     reason: `tank count ${g.tanks.length} vs ${s.tanks.length} at frame ${f}` };
        }
        for (let k = 0; k < g.tanks.length; k++) {
            frameDiff = Math.max(frameDiff, Math.abs(g.tanks[k][0] - s.tanks[k][0]), Math.abs(g.tanks[k][1] - s.tanks[k][1]));
        }
        const bn = Math.min(g.bullets.length, s.bullets.length);
        for (let k = 0; k < bn; k++) {
            frameDiff = Math.max(frameDiff, Math.abs(g.bullets[k][0] - s.bullets[k][0]), Math.abs(g.bullets[k][1] - s.bullets[k][1]));
        }
        if (g.bullets.length !== s.bullets.length && firstDivergeFrame < 0) {
            firstDivergeFrame = f;
            detail = `bullet count ${g.bullets.length} vs ${s.bullets.length}`;
        }
        if (frameDiff > maxDiff) maxDiff = frameDiff;
        if (frameDiff > 1e-6 && firstDivergeFrame < 0) {
            firstDivergeFrame = f;
            detail = `pos diff ${frameDiff.toFixed(4)}`;
        }
    }

    return { seed, level, framesCompared: n, gameFrames: gameTrace.length, simFrames: simTrace.length,
             maxDiff, firstDivergeFrame, detail };
}

// maps: { [level]: mapText }. Runs the standard fixture cases.
export async function runSuite(maps) {
    const results = [];
    for (const [seed, level] of [[12345, 1], [99, 1], [2026, 1], [7, 3]]) {
        // eslint-disable-next-line no-await-in-loop
        results.push(await runConformance(seed, level, 120, maps[level]));
    }
    return results;
}
