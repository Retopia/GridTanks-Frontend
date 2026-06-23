// Drives the player tank with a trained PPO policy exported to ONNX
// (see agent/export_onnx.py). Inference runs via onnxruntime-web.
//
// The contract with training is fixed and must not drift:
//   * Observation — built by the shared sim/observation.js (verified
//     bit-identical to the Python env by the conformance harness).
//   * Action — MultiDiscrete([9, 2]): logits[0..9] pick a move direction,
//     logits[9..11] pick fire/hold. MOVE_VECTORS and the analytic lead-aim
//     below mirror agent/gridtanks_env.py exactly, since the policy only
//     learned movement + when to fire (the turret is aimed for it).
//
// Inference is async but the game loop is synchronous, so we apply the most
// recent cached action each frame and kick off a fresh (throttled) inference.

import { buildObservation, OBS_DIM } from '../sim/observation.js';

// Must match MOVE_VECTORS in agent/gridtanks_env.py.
const MOVE_VECTORS = [
    [0, 0], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
];
// env._lead_aim uses the tank speed (not the bullet speed) for its lead time.
// Mirror it verbatim — the policy learned "when to fire" against THIS aim.
const LEAD_SPEED = 3.5;
const IDLE_ACTION = { keys: { w: false, a: false, s: false, d: false }, aimX: 0, aimY: 0, fire: false };

export class OnnxAgent {
    constructor() {
        this.session = null;
        this.latestAction = IDLE_ACTION;
        this._busy = false;
        this._inputName = null;
    }

    async load(modelUrl) {
        const ort = await import('onnxruntime-web');
        this.session = await ort.InferenceSession.create(modelUrl);
        this._ort = ort;
        this._inputName = this.session.inputNames[0];
    }

    // Called every frame by the game loop. Applies the cached action and (if not
    // already running) starts a new inference against the current state.
    drive(game) {
        if (!this.session || this._busy) return this.latestAction;
        this._busy = true;
        this._infer(game).finally(() => { this._busy = false; });
        return this.latestAction;
    }

    async _infer(game) {
        const snap = this._snapshot(game);
        const obs = buildObservation(snap);
        const tensor = new this._ort.Tensor('float32', obs, [1, OBS_DIM]);
        const out = await this.session.run({ [this._inputName]: tensor });
        const logits = out[this.session.outputNames[0]].data; // length 11

        const move = argmax(logits, 0, 9);
        const fire = logits[10] > logits[9];
        const mv = MOVE_VECTORS[move];
        const keys = { w: mv[1] < 0, s: mv[1] > 0, a: mv[0] < 0, d: mv[0] > 0 };
        const { aimX, aimY } = this._leadAim(game, snap);
        this.latestAction = { keys, aimX, aimY, fire };
    }

    _snapshot(game) {
        const p = game.player;
        const player = p
            ? {
                  cx: p.body.x + p.body.width / 2,
                  cy: p.body.y + p.body.height / 2,
                  turretRotation: p.turret.rotation,
                  firedBullets: p.firedBullets,
                  maxBullets: p.maxBullets,
              }
            : null;
        const enemies = game.teamB.map((e) => ({
            x: e.body.x,
            y: e.body.y,
            cx: e.body.x + e.body.width / 2,
            cy: e.body.y + e.body.height / 2,
            vx: e.velocityX,
            vy: e.velocityY,
            id: e.id,
        }));
        const bullets = (game.allBullets || []).map((b) => ({
            x: b.body.x,
            y: b.body.y,
            vx: b.velocityX,
            vy: b.velocityY,
        }));
        return { player, enemies, bullets };
    }

    // Mirror of env._nearest_enemy + env._lead_aim.
    _leadAim(game, snap) {
        const p = game.player;
        if (!p) return { aimX: 0, aimY: 0 };
        if (!snap.enemies.length) return { aimX: p.body.x + 1, aimY: p.body.y };
        let target = snap.enemies[0];
        let best = Infinity;
        for (const e of snap.enemies) {
            const d = Math.hypot(e.x - snap.player.cx, e.y - snap.player.cy);
            if (d < best) { best = d; target = e; }
        }
        const pcx = snap.player.cx;
        const pcy = snap.player.cy;
        let aimX = target.cx;
        let aimY = target.cy;
        for (let i = 0; i < 2; i++) {
            const t = Math.hypot(aimX - pcx, aimY - pcy) / LEAD_SPEED;
            aimX = target.cx + target.vx * t;
            aimY = target.cy + target.vy * t;
        }
        return { aimX, aimY };
    }
}

function argmax(arr, start, end) {
    let bestIdx = start;
    let bestVal = arr[start];
    for (let i = start + 1; i < end; i++) {
        if (arr[i] > bestVal) { bestVal = arr[i]; bestIdx = i; }
    }
    return bestIdx - start;
}
