import * as PIXI from 'pixi.js-legacy';
import { Bullet } from "./bullets/Bullet.js"

// player.js
export class Player {
    constructor(x, y, width, height, speed) {
        this.body = PIXI.Sprite.from(PIXI.Texture.WHITE);
        this.body.tint = 0x007ACC;
        this.id = 3;

        this.setPosition(x, y);
        this.setSize(width, height);

        this.shootingCooldown = 0;

        // Short pause for tank movement after shooting
        this.cooldownPeriod = 5;

        this.speed = speed;
        this.keyState = {};

        this.firedBullets = 0;
        this.maxBullets = 5;

        this.turret = PIXI.Sprite.from(PIXI.Texture.WHITE);
        this.turret.tint = 0x007ACC;
        this.turret.width = 20;
        this.turret.height = 4;
        this.turret.anchor.set(0, 0.5);
        this.turret.x = this.body.width / 2;
        this.turret.y = this.body.height / 2;

        this.body.addChild(this.turret);

        this.setupKeyboard();

        this.alive = true;
    }

    rotateTurret(mouseX, mouseY) {
        const turretBaseWorldX = this.body.x + this.body.width / 2;
        const turretBaseWorldY = this.body.y + this.body.height / 2;

        const dx = mouseX - turretBaseWorldX;
        const dy = mouseY - turretBaseWorldY;
        const angle = Math.atan2(dy, dx);

        this.turret.rotation = angle - this.body.rotation;
    }

    isWallOrHole(cell) {
        return cell.getCellType() === 'wall' || cell.getCellType() === 'hole';
    }

    setPosition(x, y) {
        this.body.x = x;
        this.body.y = y;
    }

    setSize(width, height) {
        this.body.width = width;
        this.body.height = height;
    }

    setupKeyboard() {
        window.addEventListener('keydown', this.onKeyDown.bind(this));
        window.addEventListener('keyup', this.onKeyUp.bind(this));
    }

    onKeyDown(event) {
        this.keyState[event.key] = true;
    }

    onKeyUp(event) {
        this.keyState[event.key] = false;
    }

    isAlive() {
        return this.alive;
    }

    setAlive(alive) {
        this.alive = alive;
    }

    fireBullet() {
        // Limit the amount of bullets that tanks can fire
        if (this.firedBullets < this.maxBullets) {
            const angle = this.turret.rotation;

            // Calculate the starting position at the tip of the turret
            const startX = this.body.x + this.turret.x + Math.cos(angle) * 25;
            const startY = this.body.y + this.turret.y + Math.sin(angle) * 25;

            const bullet = new Bullet(this, startX, startY);
            bullet.fire(angle)

            this.firedBullets += 1
            this.shootingCooldown = this.cooldownPeriod;
            return bullet;
        }
        return null;
    }

    // Axis-aligned bounding-box overlap
    _aabbOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
        return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    }

    // Would the player collide if their top-left were at (x, y)?
    _collidesAt(x, y, mapWalls) {
        const pw = this.body.width, ph = this.body.height;
        for (let i = 0; i < mapWalls.length; i++) {
            for (let j = 0; j < mapWalls[i].length; j++) {
                const cell = mapWalls[i][j];
                if (!this.isWallOrHole(cell)) continue;
                const wb = cell.body;
                if (this._aabbOverlap(x, y, pw, ph, wb.x, wb.y, wb.width, wb.height)) {
                    return true;
                }
            }
        }
        return false;
    }


    update(delta, collisionLines, mouseX, mouseY, mapWalls) {
        this.prevX = this.body.x
        this.prevY = this.body.y

        this.rotateTurret(mouseX, mouseY);

        if (this.shootingCooldown > 0) {
            this.shootingCooldown -= delta;
        }

        // Only allow movement after cooldown
        // This is to achieve the pausing effect like in Wii Tanks
        // Only allow movement after cooldown (Wii Tanks-like pause)
        if (this.shootingCooldown <= 0) {
            let dx = 0, dy = 0;
            if (this.keyState['w']) dy -= 1;
            if (this.keyState['s']) dy += 1;
            if (this.keyState['a']) dx -= 1;
            if (this.keyState['d']) dx += 1;
            if (this.keyState['W']) dy -= 1;
            if (this.keyState['S']) dy += 1;
            if (this.keyState['A']) dx -= 1;
            if (this.keyState['D']) dx += 1;

            const base = this.speed * delta;
            const diagonal = (dx !== 0 && dy !== 0);

            // Start with possibly normalized steps
            let stepX = dx * base;
            let stepY = dy * base;
            if (diagonal) {
                stepX *= Math.SQRT1_2;
                stepY *= Math.SQRT1_2;
            }

            const tryAxis = (offX, offY) => {
                if (offX === 0 && offY === 0) return false;
                const nx = this.body.x + offX;
                const ny = this.body.y + offY;
                if (!this._collidesAt(nx, ny, mapWalls)) {
                    this.body.x = nx;
                    this.body.y = ny;
                    return true;
                }
                return false;
            };

            // Try dominant axis first
            const tryXFirst = Math.abs(stepX) >= Math.abs(stepY);

            if (tryXFirst) {
                const movedX = tryAxis(stepX, 0);
                // If diagonal and X failed but we have Y input, restore Y to full speed
                const yStep = (!movedX && diagonal && dy !== 0) ? Math.sign(stepY) * base : stepY;
                tryAxis(0, yStep);
            } else {
                const movedY = tryAxis(0, stepY);
                const xStep = (!movedY && diagonal && dx !== 0) ? Math.sign(stepX) * base : stepX;
                tryAxis(xStep, 0);
            }
        }
    }
}
