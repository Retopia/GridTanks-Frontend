// A thin Gym-style wrapper over HeadlessGame, demonstrating the design from the
// RL discussion: a hybrid action space (discrete movement + fire, with the
// turret aimed analytically at the nearest enemy) and a structured,
// fixed-size observation. Swap in a CNN over an egocentric grid later if you
// prefer pixels; the contract (reset/step) stays the same.

import { distance } from './geometry.js';

const MOVE_VECTORS = [
    { x: 0, y: 0 },   // 0 stay
    { x: 0, y: -1 },  // 1 up (w)
    { x: 1, y: -1 },  // 2 up-right
    { x: 1, y: 0 },   // 3 right (d)
    { x: 1, y: 1 },   // 4 down-right
    { x: 0, y: 1 },   // 5 down (s)
    { x: -1, y: 1 },  // 6 down-left
    { x: -1, y: 0 },  // 7 left (a)
    { x: -1, y: -1 }  // 8 up-left
];

const MAX_ENEMIES = 6;
const MAX_BULLETS = 12;
const NORMAL_SPEED = 3.5;
const FIRE_SPEED = 6.5;

export class GridTanksEnv {
    constructor(game, mapText) {
        this.game = game;
        this.mapText = mapText;
        this.prevEnemies = 0;
    }

    reset(mapText = this.mapText) {
        this.mapText = mapText;
        this.game.loadMap(mapText);
        this.prevEnemies = this.game.teamB.length;
        return this.getObservation();
    }

    // action = { move: 0..8, fire: 0|1 }. Aim is computed analytically at the
    // nearest enemy (lead) — the policy only decides movement + fire.
    step(action) {
        const player = this.game.player;
        const move = MOVE_VECTORS[action.move ?? 0];
        const keys = {
            w: move.y < 0,
            s: move.y > 0,
            a: move.x < 0,
            d: move.x > 0
        };

        let aimX = player ? player.body.x + 1 : 0;
        let aimY = player ? player.body.y : 0;
        const target = this._nearestEnemy();
        if (player && target) {
            const aim = this._leadAim(player, target);
            aimX = aim.x;
            aimY = aim.y;
        }

        const event = this.game.step({ keys, aimX, aimY, fire: Boolean(action.fire) });

        const enemiesNow = this.game.teamB.length;
        const killed = Math.max(0, this.prevEnemies - enemiesNow);
        this.prevEnemies = enemiesNow;

        let reward = killed * 1.0 - 0.001; // kill bonus, tiny time penalty
        let done = false;
        if (event === 'player_dead') { reward -= 1.0; done = true; }
        else if (event === 'level_complete') { reward += 2.0; done = true; }

        return { observation: this.getObservation(), reward, done, event };
    }

    _nearestEnemy() {
        const player = this.game.player;
        if (!player || this.game.teamB.length === 0) return null;
        let best = null;
        let bestD = Infinity;
        for (const e of this.game.teamB) {
            const d = distance(player.body, e.body);
            if (d < bestD) { bestD = d; best = e; }
        }
        return best;
    }

    _leadAim(player, target) {
        const pc = player.center();
        const ec = target.center();
        let aimX = ec.x;
        let aimY = ec.y;
        for (let i = 0; i < 2; i++) {
            const t = distance({ x: aimX, y: aimY }, pc) / NORMAL_SPEED;
            aimX = ec.x + (target.velocityX || 0) * t;
            aimY = ec.y + (target.velocityY || 0) * t;
        }
        return { x: aimX, y: aimY };
    }

    // Structured, fixed-size observation: self state + nearest enemies +
    // nearest bullets, all normalized and relative to the player.
    getObservation() {
        const obs = [];
        const player = this.game.player;
        const W = this.game.cols * 20;
        const H = this.game.rows * 20;

        if (player) {
            const c = player.center();
            obs.push(c.x / W, c.y / H, Math.cos(player.turret.rotation), Math.sin(player.turret.rotation), (player.firedBullets || 0) / (player.maxBullets || 5));
        } else {
            obs.push(0, 0, 0, 0, 0);
        }
        const pc = player ? player.center() : { x: 0, y: 0 };

        const enemies = [...this.game.teamB]
            .sort((a, b) => distance(pc, a.body) - distance(pc, b.body))
            .slice(0, MAX_ENEMIES);
        for (let i = 0; i < MAX_ENEMIES; i++) {
            const e = enemies[i];
            if (e) {
                const ec = e.center();
                obs.push((ec.x - pc.x) / W, (ec.y - pc.y) / H, (e.velocityX || 0) / 3, (e.velocityY || 0) / 3, e.id / 9, 1);
            } else {
                obs.push(0, 0, 0, 0, 0, 0);
            }
        }

        const bullets = [...this.game.bullets]
            .sort((a, b) => distance(pc, a.body) - distance(pc, b.body))
            .slice(0, MAX_BULLETS);
        for (let i = 0; i < MAX_BULLETS; i++) {
            const b = bullets[i];
            if (b) {
                obs.push((b.body.x - pc.x) / W, (b.body.y - pc.y) / H, b.velocityX / FIRE_SPEED, b.velocityY / FIRE_SPEED);
            } else {
                obs.push(0, 0, 0, 0);
            }
        }
        return obs;
    }
}
