// Mirror of agent/gridtanks_sim/observation.py — MUST stay bit-for-bit
// equivalent. This is the input a trained policy sees; if the browser builds it
// differently than training did, the policy gets garbage. Parity is verified by
// the conformance harness (agent/tests/test_conformance.py compares the obs this
// records against the Python build_observation on the same frames).

export const MAX_ENEMIES = 6;
export const MAX_BULLETS = 12;
export const FIRE_SPEED = 6.5;
export const W = 40 * 20;
export const H = 30 * 20;
export const OBS_DIM = 5 + MAX_ENEMIES * 6 + MAX_BULLETS * 4; // 89

// snapshot shape (engine-agnostic, so it works for both the headless sim and
// the live PIXI game):
//   player:  { cx, cy, turretRotation, firedBullets, maxBullets } | null
//   enemies: [{ x, y, cx, cy, vx, vy, id }]   (x,y = top-left; cx,cy = center)
//   bullets: [{ x, y, vx, vy }]
export function buildObservation(snap) {
    const obs = new Float32Array(OBS_DIM);
    let o = 0;
    let pcx = 0;
    let pcy = 0;

    const p = snap.player;
    if (p) {
        pcx = p.cx;
        pcy = p.cy;
        obs[o++] = pcx / W;
        obs[o++] = pcy / H;
        obs[o++] = Math.cos(p.turretRotation);
        obs[o++] = Math.sin(p.turretRotation);
        obs[o++] = p.firedBullets / Math.max(1, p.maxBullets);
    } else {
        o += 5;
    }

    // Sort by distance from each enemy's top-left to the player center — matches
    // the Python key exactly (e.x - pcx), quirk and all. JS Array.sort is stable
    // (like Python's sorted), so ties keep spawn order in both.
    const enemies = snap.enemies
        .slice()
        .sort((a, b) => Math.hypot(a.x - pcx, a.y - pcy) - Math.hypot(b.x - pcx, b.y - pcy))
        .slice(0, MAX_ENEMIES);
    for (let i = 0; i < MAX_ENEMIES; i++) {
        if (i < enemies.length) {
            const e = enemies[i];
            obs[o++] = (e.cx - pcx) / W;
            obs[o++] = (e.cy - pcy) / H;
            obs[o++] = e.vx / 3;
            obs[o++] = e.vy / 3;
            obs[o++] = e.id / 9;
            obs[o++] = 1;
        } else {
            o += 6;
        }
    }

    const bullets = snap.bullets
        .slice()
        .sort((a, b) => Math.hypot(a.x - pcx, a.y - pcy) - Math.hypot(b.x - pcx, b.y - pcy))
        .slice(0, MAX_BULLETS);
    for (let i = 0; i < MAX_BULLETS; i++) {
        if (i < bullets.length) {
            const b = bullets[i];
            obs[o++] = (b.x - pcx) / W;
            obs[o++] = (b.y - pcy) / H;
            obs[o++] = b.vx / FIRE_SPEED;
            obs[o++] = b.vy / FIRE_SPEED;
        } else {
            o += 4;
        }
    }

    return obs;
}

// Extract a snapshot from the headless JS sim (frontend/src/sim/headlessSim.js).
export function snapshotFromHeadless(game) {
    const tankSnap = (t) => ({
        x: t.body.x,
        y: t.body.y,
        cx: t.body.x + t.body.width / 2,
        cy: t.body.y + t.body.height / 2,
        vx: t.velocityX,
        vy: t.velocityY,
        id: t.id,
    });
    const p = game.player;
    return {
        player: p
            ? {
                  cx: p.body.x + p.body.width / 2,
                  cy: p.body.y + p.body.height / 2,
                  turretRotation: p.turret.rotation,
                  firedBullets: p.firedBullets,
                  maxBullets: p.maxBullets,
              }
            : null,
        enemies: game.teamB.map(tankSnap),
        bullets: game.bullets.map((b) => ({
            x: b.body.x,
            y: b.body.y,
            vx: b.velocityX,
            vy: b.velocityY,
        })),
    };
}
