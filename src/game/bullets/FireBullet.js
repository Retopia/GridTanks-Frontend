export class FireBullet {
    constructor(owner, x, y) {
        this.owner = owner;

        this.body = new PIXI.Container();

        this.bounces = 0;
        this.toDestroy = false;

        this.bulletSpeed = 6.5
        this.bulletRadius = 4;

        // Yellow bullet
        const bullet = new PIXI.Graphics();
        // bullet.beginFill(0x000ff); // Use blue when debugging
        bullet.beginFill(0xff0000);
        bullet.drawCircle(0, 0, this.bulletRadius);
        bullet.endFill();
        this.body.addChild(bullet);

        this.maxBounces = 0;

        // Set position
        this.body.position.set(x, y);
    }

    // We simply treat the bullet as a small line for collision detection so its faster and easier to handle
    getLineRepresentation(delta) {
        return {
            start: new PIXI.Point(this.body.x, this.body.y),
            end: new PIXI.Point(this.body.x + this.velocityX * delta, this.body.y + this.velocityY * delta)
        };
    }

    detectBulletCollision(otherBullets, delta) {
        let futurePosition = new PIXI.Point(this.body.x + this.velocityX * delta, this.body.y + this.velocityY * delta);

        for (let otherBullet of otherBullets) {
            if (otherBullet === this) continue; // Skip collision check with itself

            let otherFuturePosition = new PIXI.Point(otherBullet.body.x + otherBullet.velocityX * delta, otherBullet.body.y + otherBullet.velocityY * delta);
            let distance = this.distance(futurePosition, otherFuturePosition);

            if (distance < this.bulletRadius + otherBullet.bulletRadius) {
                // Collision detected
                return { collided: true, otherBullet };
            }
        }

        return { collided: false };
    }

    distance(point1, point2) {
        return Math.sqrt(Math.pow(point1.x - point2.x, 2) + Math.pow(point1.y - point2.y, 2));
    }

    detectCollision(delta, collisionLine) {
        let bulletLine = this.getLineRepresentation(delta);
        let collisionLineStart = new PIXI.Point(collisionLine[0], collisionLine[1]);
        let collisionLineEnd = new PIXI.Point(collisionLine[2], collisionLine[3]);
        let collisionPoint = this.getCollisionPoint(bulletLine.start, bulletLine.end, collisionLineStart, collisionLineEnd)

        if (collisionPoint) {
            let overlapX = Math.abs(collisionPoint.x - bulletLine.end.x);
            let overlapY = Math.abs(collisionPoint.y - bulletLine.end.y);
            return {

                collided: overlapX > 0 && overlapY > 0,
                overlapX: overlapX,
                overlapY: overlapY
            }
        }

        return {
            collided: false
        };
    }

    getCollisionPoint(aStart, aEnd, bStart, bEnd) {
        let d1x = aEnd.x - aStart.x;
        let d1y = aEnd.y - aStart.y;
        let d2x = bEnd.x - bStart.x;
        let d2y = bEnd.y - bStart.y;

        // Cross product to determine if parallel
        let cross = d1x * d2y - d1y * d2x;
        if (Math.abs(cross) < 1e-8) return null; // Lines are parallel or coincident

        // Calculate the intersection t value
        let t = ((bStart.x - aStart.x) * d2y - (bStart.y - aStart.y) * d2x) / cross;
        let u = ((bStart.x - aStart.x) * d1y - (bStart.y - aStart.y) * d1x) / cross;

        // Check if t and u are within bounds (0 to 1)
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            // Calculate the intersection point
            return new PIXI.Point(aStart.x + t * d1x, aStart.y + t * d1y);
        } else {
            return null; // No intersection
        }
    }

    fire(angle) {
        this.velocityX = Math.cos(angle) * this.bulletSpeed;
        this.velocityY = Math.sin(angle) * this.bulletSpeed;
        this.body.rotation = angle
    }

    resolveCollision(collisions) {
        if (collisions.length === 0) return false;

        // Sort collisions based on the overlap and bullet's direction
        collisions.sort((a, b) => {
            let aPriority = (Math.abs(this.velocityX) > Math.abs(this.velocityY)) ? a[0].overlapX : a[0].overlapY;
            let bPriority = (Math.abs(this.velocityX) > Math.abs(this.velocityY)) ? b[0].overlapX : b[0].overlapY;
            return bPriority - aPriority;
        });

        let [collision, collisionLine] = collisions[0]; // Get the most relevant collision

        // Determine if the collision line is more horizontal or vertical
        let isLineHorizontal = Math.abs(collisionLine[1] - collisionLine[3]) < Math.abs(collisionLine[0] - collisionLine[2]);

        // Reflect the bullet's velocity based on the orientation of the collision line
        if (isLineHorizontal) {
            this.velocityY *= -1; // Reflect vertically
        } else {
            this.velocityX *= -1; // Reflect horizontally
        }

        return true;
    }

    update(delta, collisionLines, allBullets) {
        // Proposed new position
        let newX = this.body.x + this.velocityX * delta;
        let newY = this.body.y + this.velocityY * delta;

        let potentialCollisions = [];

        // Bullet-to-bullet collision detection
        let bulletCollision = this.detectBulletCollision(allBullets, delta);
        if (bulletCollision.collided) {
            this.toDestroy = true;
            bulletCollision.otherBullet.toDestroy = true;
            return; // End the update as the bullet will be destroyed
        }

        for (let i = 0; i < collisionLines.length; i++) {
            const collision = this.detectCollision(delta, collisionLines[i]);
            if (collision.collided) {
                potentialCollisions.push([collision, collisionLines[i]]);
            }
        }

        if (potentialCollisions.length > 0) {
            // Resolve the most relevant collision
            let resolved = this.resolveCollision(potentialCollisions);
            if (resolved) {
                this.bounces++;
                if (this.bounces > this.maxBounces) {
                    this.toDestroy = true;
                }
            }
        } else {
            // Update position if no collision
            this.body.x = newX;
            this.body.y = newY;
        }
    }
}
