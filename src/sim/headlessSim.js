// Headless, PIXI-free reimplementation of the GridTanks simulation. It mirrors
// the browser game's mechanics (game/Game.js, Tank.js, Player.js, bullets/*)
// using plain objects, so it can run thousands of steps/sec in Node with no
// rendering — the fast environment needed for RL or forward-search.
//
// Fidelity note: the algorithms are ported directly from the game, but exact
// parity (especially RNG-driven shot timing) should be confirmed with a
// conformance test that replays identical inputs through both before training.

import { AStarPathfinder } from '../game/AStarPathfinder.js';
import {
    distance,
    getCollisionPoint,
    segmentsIntersect,
    pathIntersectsRect,
    reflectPointOverLine,
    anyLineIntersection
} from './geometry.js';

const CELL = 20;
const BULLET_RADIUS = 4;
const NORMAL_SPEED = 3.5;
const FIRE_SPEED = 6.5;
const PLAYER_SHOOT_DELAY = 12; // frames between held shots (Player.shootDelay)
const PLAYER_COOLDOWN = 5;

// Mirrors TANK_PRESETS in game/Game.js. shotDelay uses the injected rng.
const TANK_PRESETS = {
    4: { name: 'brown', speed: 0, bulletType: 'normal', maxBullets: 1, reflectedShotThreshold: 0.6, dodge: 0, delay: [80, 100] },
    5: { name: 'grey', speed: 1.25, bulletType: 'normal', maxBullets: 2, reflectedShotThreshold: 0.6, dodge: 120, delay: [80, 100] },
    6: { name: 'green', speed: 1.5, bulletType: 'fire', maxBullets: 1, reflectedShotThreshold: 0, dodge: 80, delay: [60, 100] },
    7: { name: 'pink', speed: 1.75, bulletType: 'normal', maxBullets: 5, reflectedShotThreshold: 0.5, dodge: 70, delay: [20, 50] },
    8: { name: 'black', speed: 2, bulletType: 'fire', maxBullets: 5, reflectedShotThreshold: 0, dodge: 80, delay: [30, 60] },
    9: { name: 'red', speed: 2, bulletType: 'both', maxBullets: 5, reflectedShotThreshold: 0.5, dodge: 80, delay: [25, 45] }
};

function makeCell(col, row, type) {
    return {
        body: { x: col * CELL, y: row * CELL, width: CELL, height: CELL },
        type,
        row,
        col,
        dangerValue: 0,
        getCellType() { return this.type; },
        setCellType(t) { this.type = t; }
    };
}

class Bullet {
    constructor(owner, x, y, kind) {
        this.owner = owner;
        this.kind = kind; // 'normal' | 'fire'
        this.body = { x, y, rotation: 0 };
        this.velocityX = 0;
        this.velocityY = 0;
        this.bounces = 0;
        this.maxBounces = kind === 'fire' ? 0 : 1;
        this.bulletRadius = BULLET_RADIUS;
        this.speed = kind === 'fire' ? FIRE_SPEED : NORMAL_SPEED;
        this.toDestroy = false;
    }

    fire(angle) {
        this.velocityX = Math.cos(angle) * this.speed;
        this.velocityY = Math.sin(angle) * this.speed;
        this.body.rotation = angle;
    }

    detectCollision(delta, line) {
        const start = { x: this.body.x, y: this.body.y };
        const end = { x: this.body.x + this.velocityX * delta, y: this.body.y + this.velocityY * delta };
        const point = getCollisionPoint(start, end, { x: line[0], y: line[1] }, { x: line[2], y: line[3] });
        if (point) {
            const overlapX = Math.abs(point.x - end.x);
            const overlapY = Math.abs(point.y - end.y);
            return { collided: overlapX > 0 && overlapY > 0, overlapX, overlapY };
        }
        return { collided: false };
    }

    resolveCollision(collisions) {
        collisions.sort((a, b) => {
            const ap = Math.abs(this.velocityX) > Math.abs(this.velocityY) ? a[0].overlapX : a[0].overlapY;
            const bp = Math.abs(this.velocityX) > Math.abs(this.velocityY) ? b[0].overlapX : b[0].overlapY;
            return bp - ap;
        });
        const [, line] = collisions[0];
        const horizontal = Math.abs(line[1] - line[3]) < Math.abs(line[0] - line[2]);
        if (horizontal) this.velocityY *= -1;
        else this.velocityX *= -1;
        return true;
    }

    update(delta, collisionLines, allBullets) {
        const newX = this.body.x + this.velocityX * delta;
        const newY = this.body.y + this.velocityY * delta;

        // Bullet-vs-bullet (mutual destruction).
        const future = { x: newX, y: newY };
        for (const other of allBullets) {
            if (other === this) continue;
            const of = { x: other.body.x + other.velocityX * delta, y: other.body.y + other.velocityY * delta };
            if (distance(future, of) < this.bulletRadius + other.bulletRadius) {
                this.toDestroy = true;
                other.toDestroy = true;
                return;
            }
        }

        const collisions = [];
        for (const line of collisionLines) {
            const c = this.detectCollision(delta, line);
            if (c.collided) collisions.push([c, line]);
        }

        if (collisions.length > 0) {
            if (this.resolveCollision(collisions)) {
                this.bounces++;
                if (this.bounces > this.maxBounces) this.toDestroy = true;
            }
        } else {
            this.body.x = newX;
            this.body.y = newY;
        }
    }
}

class Tank {
    constructor(typeId, x, y, options = {}) {
        const preset = TANK_PRESETS[typeId] || null;
        this.id = typeId; // 3 = player, 4-9 = enemy types
        this.isPlayer = typeId === 3;
        this.body = { x, y, width: 18, height: 18, rotation: 0 };
        this.turret = { x: 9, y: 9, rotation: 0 };
        this.alive = true;
        this.team = options.team || 'A';

        this.speed = preset ? preset.speed : 2;
        this.bulletType = preset ? preset.bulletType : 'normal';
        this.maxBullets = preset ? preset.maxBullets : 5;
        this.reflectedShotThreshold = preset ? preset.reflectedShotThreshold : 0;
        this.predictiveDodgeDistanceThreshold = preset ? preset.dodge : 0;
        this.delayRange = preset ? preset.delay : null;

        this.firedBullets = 0;
        this.recoilAnimationTime = 0;
        this.cooldownPeriod = 5;
        this.shootingCooldown = 0;
        this.timeSinceLastShot = 0;

        this.shotDelayAccumulator = 0;
        this.shotDelay = 0;
        this.targetDestination = null;
        this.path = [];
        this.velocityX = 0;
        this.velocityY = 0;
        this.pathfinder = null;

        this.rng = options.rng || Math.random;
        if (this.delayRange) {
            this.shotDelay = this.rng() * (50 - 20) + 20; // first shot is quick, per Tank.js
        }
        this.keyState = {};
        this.isMouseDown = false;
    }

    center() {
        return { x: this.body.x + this.body.width / 2, y: this.body.y + this.body.height / 2 };
    }

    rect() {
        return { x: this.body.x, y: this.body.y, width: this.body.width, height: this.body.height };
    }

    setPathfinder(grid) {
        if (this.speed > 0) {
            this.physicalMap = grid;
            this.pathfinder = new AStarPathfinder(grid);
        }
    }

    rollShotDelay() {
        const [lo, hi] = this.delayRange;
        return this.rng() * (hi - lo) + lo;
    }

    rotateTurret(targetX, targetY) {
        const baseX = this.body.x + this.body.width / 2;
        const baseY = this.body.y + this.body.height / 2;
        this.turret.rotation = Math.atan2(targetY - baseY, targetX - baseX);
    }

    fireBullet(kind) {
        if (this.firedBullets >= this.maxBullets) return null;
        const angle = this.turret.rotation;
        const startX = this.body.x + this.turret.x + Math.cos(angle) * 25;
        const startY = this.body.y + this.turret.y + Math.sin(angle) * 25;
        const bullet = new Bullet(this, startX, startY, kind === 'fire' ? 'fire' : 'normal');
        bullet.fire(angle);
        this.firedBullets++;
        this.recoilAnimationTime = this.cooldownPeriod;
        this.shootingCooldown = this.cooldownPeriod;
        this.timeSinceLastShot = 0;
        return bullet;
    }

    // --- Player (agent) control: action = { keys, aimX, aimY, fire } ---
    applyAction(delta, action, walls) {
        this.rotateTurret(action.aimX, action.aimY);
        if (this.shootingCooldown > 0) this.shootingCooldown -= delta;
        this.timeSinceLastShot += delta;

        if (this.shootingCooldown <= 0) {
            const k = action.keys || {};
            let dx = 0;
            let dy = 0;
            if (k.w) dy -= 1;
            if (k.s) dy += 1;
            if (k.a) dx -= 1;
            if (k.d) dx += 1;

            const base = this.speed * delta;
            const diagonal = dx !== 0 && dy !== 0;
            let stepX = dx * base;
            let stepY = dy * base;
            if (diagonal) { stepX *= Math.SQRT1_2; stepY *= Math.SQRT1_2; }

            const tryAxis = (offX, offY) => {
                if (offX === 0 && offY === 0) return false;
                const nx = this.body.x + offX;
                const ny = this.body.y + offY;
                if (!this.collidesAt(nx, ny, walls)) { this.body.x = nx; this.body.y = ny; return true; }
                return false;
            };

            if (Math.abs(stepX) >= Math.abs(stepY)) {
                const moved = tryAxis(stepX, 0);
                const yStep = (!moved && diagonal && dy !== 0) ? Math.sign(stepY) * base : stepY;
                tryAxis(0, yStep);
            } else {
                const moved = tryAxis(0, stepY);
                const xStep = (!moved && diagonal && dx !== 0) ? Math.sign(stepX) * base : stepX;
                tryAxis(xStep, 0);
            }
        }

        // Held-fire honoring shootDelay (Player semantics).
        let bullet = null;
        if (action.fire && this.firedBullets < this.maxBullets && this.timeSinceLastShot >= PLAYER_SHOOT_DELAY) {
            bullet = this.fireBullet(this.bulletType === 'both' ? 'normal' : this.bulletType);
        }
        return bullet;
    }

    collidesAt(x, y, walls) {
        const bw = this.body.width;
        const bh = this.body.height;
        const startRow = Math.max(0, Math.floor(y / CELL));
        const endRow = Math.min(walls.length - 1, Math.floor((y + bh) / CELL));
        const startCol = Math.max(0, Math.floor(x / CELL));
        const endCol = Math.min(walls[0].length - 1, Math.floor((x + bw) / CELL));
        for (let i = startRow; i <= endRow; i++) {
            for (let j = startCol; j <= endCol; j++) {
                const t = walls[i][j].type;
                if (t === 'wall' || t === 'hole') {
                    const wb = walls[i][j].body;
                    if (x < wb.x + wb.width && x + bw > wb.x && y < wb.y + wb.height && y + bh > wb.y) return true;
                }
            }
        }
        return false;
    }

    collidesWithWalls(walls) {
        return this.collidesAt(this.body.x, this.body.y, walls);
    }

    isWallOrHole(cell) {
        return cell.type === 'wall' || cell.type === 'hole';
    }

    isAdjacentToWallOrHole(map, cell) {
        const row = Math.floor(cell.body.y / CELL);
        const col = Math.floor(cell.body.x / CELL);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const cx = col + dx;
                const cy = row + dy;
                if (cx >= 0 && cx < map[0].length && cy >= 0 && cy < map.length && this.isWallOrHole(map[cy][cx])) return true;
            }
        }
        return false;
    }

    findSafeDestination(map, currentCell, maxDistance) {
        let lowest = Infinity;
        let safe = [];
        for (let i = -maxDistance; i <= maxDistance; i++) {
            for (let j = -maxDistance; j <= maxDistance; j++) {
                const r = currentCell.row + i;
                const c = currentCell.col + j;
                if (r >= 0 && r < map.length && c >= 0 && c < map[0].length
                    && !this.isAdjacentToWallOrHole(map, map[r][c]) && !this.isWallOrHole(map[r][c])) {
                    const danger = map[r][c].dangerValue;
                    if (danger < lowest) { lowest = danger; safe = [{ row: r, col: c }]; }
                    else if (danger === lowest) safe.push({ row: r, col: c });
                }
            }
        }
        if (safe.length > 0) return safe[Math.floor(this.rng() * safe.length)];
        return null;
    }

    predictiveDodge(allBullets, delta) {
        const tankPos = this.center();
        const lookahead = delta * 10;
        let dirX = 0;
        let dirY = 0;
        for (const bullet of allBullets) {
            const bp = { x: bullet.body.x, y: bullet.body.y };
            const bv = { x: bullet.velocityX, y: bullet.velocityY };
            const toTank = { x: tankPos.x - bp.x, y: tankPos.y - bp.y };
            if (bv.x * toTank.x + bv.y * toTank.y <= 0) continue;
            const future = { x: bp.x + bv.x * lookahead, y: bp.y + bv.y * lookahead };
            if (distance(tankPos, future) < this.predictiveDodgeDistanceThreshold) {
                let ddx = tankPos.x - future.x;
                let ddy = tankPos.y - future.y;
                const mag = Math.hypot(ddx, ddy);
                if (mag > 0) { ddx /= mag; ddy /= mag; }
                dirX += ddx;
                dirY += ddy;
            }
        }
        const mag = Math.hypot(dirX, dirY);
        if (mag > 0) { dirX /= mag; dirY /= mag; }
        return { x: dirX, y: dirY };
    }

    getClosestTarget(enemyTeam) {
        let res = enemyTeam[0];
        let best = distance(this.body, enemyTeam[0].body);
        for (let t = 1; t < enemyTeam.length; t++) {
            const d = distance(this.body, enemyTeam[t].body);
            if (d < best) { best = d; res = enemyTeam[t]; }
        }
        return res;
    }

    canShootAtAttackingBullet(allBullets, maxDistance) {
        const tankPos = this.center();
        const hb = { x: this.body.x - 1, y: this.body.y - 1, width: this.body.width + 2, height: this.body.height + 2 };
        let closest = null;
        let minDist = maxDistance;
        for (const bullet of allBullets) {
            const start = { x: bullet.body.x, y: bullet.body.y };
            const end = { x: bullet.body.x + bullet.velocityX * maxDistance, y: bullet.body.y + bullet.velocityY * maxDistance };
            if (pathIntersectsRect(start, end, hb)) {
                const d = distance(tankPos, start);
                if (d < minDist) { minDist = d; closest = start; }
            }
        }
        return closest ? { x: closest.x, y: closest.y } : null;
    }

    canShootDirectlyAtPlayer(player, collisionLines, myTeam) {
        const start = { x: this.body.x, y: this.body.y };
        const end = { x: player.body.x, y: player.body.y };
        for (const line of collisionLines) {
            if (segmentsIntersect(start, end, { x: line[0], y: line[1] }, { x: line[2], y: line[3] })) return false;
        }
        for (const tank of myTeam) {
            if (tank === this || tank === player) continue;
            if (pathIntersectsRect(start, end, tank.rect())) return false;
        }
        return true;
    }

    canShootReflectedAtPlayer(player, collisionLines, myTeam) {
        const tankPos = { x: this.body.x + this.body.width, y: this.body.y + this.body.height };
        const playerPos = { x: player.body.x + player.body.width / 2, y: player.body.y + player.body.height / 2 };
        const shots = [];
        for (let i = 0; i < collisionLines.length; i++) {
            const ls = { x: collisionLines[i][0], y: collisionLines[i][1] };
            const le = { x: collisionLines[i][2], y: collisionLines[i][3] };
            const reflected = reflectPointOverLine(playerPos, ls, le);
            const aim = getCollisionPoint(tankPos, reflected, ls, le);
            if (!aim) continue;

            let closestLine = true;
            for (let j = 0; j < collisionLines.length; j++) {
                if (i === j) continue;
                const ojs = { x: collisionLines[j][0], y: collisionLines[j][1] };
                const oje = { x: collisionLines[j][2], y: collisionLines[j][3] };
                const op = getCollisionPoint(tankPos, reflected, ojs, oje);
                if (op && distance(tankPos, op) < distance(tankPos, aim)) { closestLine = false; break; }
            }
            if (!closestLine) continue;

            let obstructed = anyLineIntersection(aim, playerPos, collisionLines.filter((_, idx) => idx !== i));
            if (!obstructed) {
                for (const tank of myTeam) {
                    if (tank === this || tank === player) continue;
                    const r = { x: tank.body.x - 1, y: tank.body.y - 1, width: tank.body.width + 2, height: tank.body.height + 2 };
                    if (pathIntersectsRect(tankPos, aim, r) || pathIntersectsRect(aim, playerPos, r)) { obstructed = true; break; }
                }
            }
            if (!obstructed) shots.push({ aim, dist: distance(tankPos, aim) + distance(aim, playerPos) });
        }
        if (shots.length === 0) return null;
        shots.sort((a, b) => a.dist - b.dist);
        return shots[0].aim;
    }

    // Enemy AI tick (port of Tank.update). Returns fired bullets.
    updateAI(delta, map, collisionLines, allBullets, myTeam, enemyTeam) {
        const res = [];
        if (enemyTeam.length === 0) return res;
        const player = this.getClosestTarget(enemyTeam);
        if (!player) return res;

        if (this.recoilAnimationTime > 0) this.recoilAnimationTime -= delta;

        this.shotDelayAccumulator += delta;
        let canShoot = false;
        if (this.shotDelayAccumulator >= this.shotDelay) {
            this.shotDelayAccumulator -= this.shotDelay;
            this.shotDelay = this.rollShotDelay();
            canShoot = true;
        }

        const attacking = this.canShootAtAttackingBullet(allBullets, 50);
        if (canShoot && this.firedBullets < this.maxBullets) {
            if (attacking) {
                this.rotateTurret(attacking.x, attacking.y);
                const b = this.fireBullet(this.bulletType === 'both' ? 'fire' : this.bulletType);
                if (b) res.push(b);
            } else if (this.rng() >= this.reflectedShotThreshold) {
                if (this.canShootDirectlyAtPlayer(player, collisionLines, myTeam)) {
                    this.rotateTurret(player.body.x + player.body.width / 2, player.body.y + player.body.height / 2);
                    const b = this.fireBullet(this.bulletType === 'both' ? 'fire' : this.bulletType);
                    if (b) res.push(b);
                }
            } else {
                const aim = this.canShootReflectedAtPlayer(player, collisionLines, myTeam);
                if (aim) {
                    this.rotateTurret(aim.x, aim.y);
                    const b = this.fireBullet(this.bulletType === 'both' ? 'normal' : this.bulletType);
                    if (b) res.push(b);
                }
            }
        }

        if (this.recoilAnimationTime <= 0 && this.speed > 0 && this.pathfinder) {
            // Clamp to the grid: a tank grazing the border could otherwise
            // index an out-of-range cell and crash the pathfinder.
            const rows = map.length;
            const cols = map[0].length;
            const currentCell = {
                row: Math.max(0, Math.min(rows - 1, Math.floor(this.body.y / CELL))),
                col: Math.max(0, Math.min(cols - 1, Math.floor(this.body.x / CELL)))
            };
            if (!this.targetDestination
                || (this.targetDestination.row === currentCell.row && this.targetDestination.col === currentCell.col)) {
                const dest = this.findSafeDestination(map, currentCell, 15);
                if (dest) {
                    this.targetDestination = dest;
                    this.path = this.pathfinder.findPath({ x: currentCell.col, y: currentCell.row }, { x: dest.col, y: dest.row }) || [];
                } else {
                    this.targetDestination = currentCell;
                    this.path = [];
                }
            }

            const prevX = this.body.x;
            const prevY = this.body.y;
            const dodge = this.predictiveDodge(allBullets, delta);

            if (dodge.x !== 0 || dodge.y !== 0) {
                const step = this.speed * delta;
                this.body.x = prevX + dodge.x * step;
                this.body.y = prevY;
                if (this.collidesWithWalls(map)) this.body.x = prevX;
                this.body.y = prevY + dodge.y * step;
                if (this.collidesWithWalls(map)) this.body.y = prevY;
            } else if (this.path && this.path.length > 0) {
                const wp = this.path[0];
                const wx = wp.body.x + CELL / 2;
                const wy = wp.body.y + CELL / 2;
                let dx = wx - this.body.x;
                let dy = wy - this.body.y;
                const mag = Math.hypot(dx, dy);
                if (mag < this.speed * delta) {
                    this.path.shift();
                } else {
                    dx /= mag; dy /= mag;
                    const step = this.speed * delta;
                    this.body.x = prevX + dx * step;
                    this.body.y = prevY;
                    if (this.collidesWithWalls(map)) this.body.x = prevX;
                    this.body.y = prevY + dy * step;
                    if (this.collidesWithWalls(map)) this.body.y = prevY;
                }
            }

            this.velocityX = this.body.x - prevX;
            this.velocityY = this.body.y - prevY;
        }

        return res;
    }
}

export class HeadlessGame {
    constructor(options = {}) {
        this.rows = 30;
        this.cols = 40;
        this.rng = options.rng || Math.random;
        this.playerSelector = options.playerSelector || 'player'; // 3, or enemy type for AI-plays
        this.reset();
    }

    reset() {
        this.map = [];
        this.collisionLines = [];
        this.tanks = [];
        this.teamA = [];
        this.teamB = [];
        this.bullets = [];
        this.player = null;
        this.frame = 0;
        this.totalEnemies = 0;
        this.lastEvent = null;
    }

    loadMap(mapText) {
        this.reset();
        const sections = mapText.replace(/\r\n/g, '\n').trim().split('\n\n');
        const grid = sections[0].split('\n').map((row) => row.trim().split(/\s+/).map(Number));
        const lineData = sections[1] || '';

        let playerSpawn = null;
        for (let r = 0; r < grid.length; r++) {
            this.map[r] = [];
            for (let c = 0; c < grid[r].length; c++) {
                const v = grid[r][c];
                let type = 'path';
                if (v === 1) type = 'wall';
                else if (v === 2) type = 'hole';
                this.map[r][c] = makeCell(c, r, type);

                if (v === 3) playerSpawn = { row: r, col: c };
                else if (v > 3) {
                    const enemy = new Tank(v, c * CELL, r * CELL, { team: 'B', rng: this.rng });
                    this.tanks.push(enemy);
                    this.teamB.push(enemy);
                }
            }
        }

        if (playerSpawn) {
            const typeId = this.playerSelector === 'player' ? 3 : this._selectorToId(this.playerSelector);
            const tank = new Tank(typeId, playerSpawn.col * CELL, playerSpawn.row * CELL, { team: 'A', rng: this.rng });
            this.player = tank;
            this.tanks.push(tank);
            this.teamA.push(tank);
        }

        // Build pathfinders only after the full grid exists (a mid-loop build
        // gives an undersized A* grid).
        for (const tank of this.tanks) {
            if (!tank.isPlayer || this.playerSelector !== 'player') {
                tank.setPathfinder(this.map);
            }
        }

        if (lineData) {
            lineData.split('\n').forEach((line) => {
                const coords = line.trim().split(/\s+/).map(Number);
                if (coords.length === 4) this.collisionLines.push(coords);
            });
        }

        this.totalEnemies = this.teamB.length;
        return this;
    }

    _selectorToId(selector) {
        const map = { brown: 4, grey: 5, green: 6, pink: 7, black: 8, red: 9 };
        return map[selector] || 3;
    }

    updateDanger() {
        if (this.map.length === 0) return;
        for (const row of this.map) for (const cell of row) cell.dangerValue = 0;
        const ref = this.teamA[0] || this.player;
        if (!ref) return;
        for (const bullet of this.bullets) {
            for (let step = 0; step <= 25; step++) {
                const bx = bullet.body.x + bullet.velocityX * step;
                const by = bullet.body.y + bullet.velocityY * step;
                const r = Math.floor(by / CELL);
                const c = Math.floor(bx / CELL);
                if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) this.map[r][c].dangerValue += 1 / (step + 1);
            }
        }
    }

    // Advance one frame. `action` controls the player tank (ignored when an AI
    // type is playing). Returns an event string: null | 'level_complete' |
    // 'player_dead'.
    step(action = null, delta = 1) {
        this.frame++;
        this.lastEvent = null;
        if (this.frame % 10 === 0) this.updateDanger();

        if (this.teamA.length === 0) { this.lastEvent = 'player_dead'; return this.lastEvent; }

        // Team A (player / AI-plays).
        for (const tank of this.teamA) {
            if (tank.isPlayer) {
                const a = action || { keys: {}, aimX: tank.body.x, aimY: tank.body.y, fire: false };
                const b = tank.applyAction(delta, a, this.map);
                if (b) this.bullets.push(b);
            } else {
                const fired = tank.updateAI(delta, this.map, this.collisionLines, this.bullets, this.teamA, this.teamB);
                for (const b of fired) this.bullets.push(b);
            }
        }

        // Team B (enemies).
        for (const tank of this.teamB) {
            const fired = tank.updateAI(delta, this.map, this.collisionLines, this.bullets, this.teamB, this.teamA);
            for (const b of fired) this.bullets.push(b);
        }

        // Bullets + collisions.
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            const hit = this._bulletHitsTank(bullet);
            if (hit) {
                hit.alive = false;
                this._removeTank(hit);
                bullet.owner.firedBullets -= 1;
                this.bullets.splice(i, 1);
                continue;
            }
            bullet.update(delta, this.collisionLines, this.bullets);
            if (bullet.toDestroy) {
                bullet.owner.firedBullets -= 1;
                this.bullets.splice(i, 1);
            }
        }

        if (this.teamA.length === 0) this.lastEvent = 'player_dead';
        else if (this.teamB.length === 0) this.lastEvent = 'level_complete';
        return this.lastEvent;
    }

    _bulletHitsTank(bullet) {
        // Mirrors Game.rectanglesCollide: bullet treated as an 8px box anchored
        // at its position (matching the PIXI container's bounds quirk).
        const bw = 8;
        for (const tank of this.tanks) {
            const b = tank.body;
            if (bullet.body.x < b.x + b.width && bullet.body.x + bw > b.x
                && bullet.body.y < b.y + b.height && bullet.body.y + bw > b.y) {
                return tank;
            }
        }
        return null;
    }

    _removeTank(tank) {
        this.tanks = this.tanks.filter((t) => t !== tank);
        this.teamA = this.teamA.filter((t) => t !== tank);
        this.teamB = this.teamB.filter((t) => t !== tank);
    }
}

export { Tank, Bullet, TANK_PRESETS, CELL };
