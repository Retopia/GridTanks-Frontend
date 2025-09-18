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
        // This is based on delta... im not sure what unit this is in ngl but it feels right so
        this.cooldownPeriod = 5;

        this.speed = speed;
        this.keyState = {};

        this.firedBullets = 0;
        this.maxBullets = 5;

        this.turret = new PIXI.Graphics();
        this.turret.beginFill(0x007ACC);
        this.turret.drawRect(0, -2, 20, 4);
        this.turret.endFill();
        this.turret.x = this.body.width / 2 - this.turret.height / 2; // Center of the tank's width
        this.turret.y = this.body.height / 2 - this.turret.height / 2; // Center of the tank's height

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

    update(delta, collisionLines, mouseX, mouseY, mapWalls) {
        this.prevX = this.body.x
        this.prevY = this.body.y

        this.rotateTurret(mouseX, mouseY);

        if (this.shootingCooldown > 0) {
            this.shootingCooldown -= delta;
        }

        // Only allow movement after cooldown
        // This is to achieve the pausing effect like in Wii Tanks
        if (this.shootingCooldown <= 0) {
            let dx = 0;
            let dy = 0;

            if (this.keyState['w']) dy -= 1;
            if (this.keyState['s']) dy += 1;
            if (this.keyState['a']) dx -= 1;
            if (this.keyState['d']) dx += 1;

            // Normalize diagonal speed
            if (dx !== 0 && dy !== 0) {
                dx *= Math.SQRT1_2; // 1/sqrt(2)
                dy *= Math.SQRT1_2;
            }

            this.prevX = this.body.x
            this.prevY = this.body.y

            // Proposed new position
            let newX = this.body.x + dx * this.speed * delta;
            let newY = this.body.y + dy * this.speed * delta;

            this.body.x = newX;
            this.body.y = newY;

            // Check for collision with walls
            for (let i = 0; i < mapWalls.length; i++) {
                for (let j = 0; j < mapWalls[i].length; j++) {
                    if (this.isWallOrHole(mapWalls[i][j])) {
                        let wallX = mapWalls[i][j].body.x;
                        let wallY = mapWalls[i][j].body.y;
                        let wallWidth = mapWalls[i][j].body.width;
                        let wallHeight = mapWalls[i][j].body.height;

                        if (this.body.x < wallX + wallWidth &&
                            this.body.x + this.body.width > wallX &&
                            this.body.y < wallY + wallHeight &&
                            this.body.y + this.body.height > wallY) {
                            // Collision detected, revert to the previous position
                            this.body.x = this.prevX;
                            this.body.y = this.prevY;
                            break;
                        }
                    }
                }
            }
        }
    }
}
