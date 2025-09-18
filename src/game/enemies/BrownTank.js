import { Bullet } from "../bullets/Bullet.js";
import { AStarPathfinder } from "../AStarPathfinder.js";
export class BrownTank {

    constructor(x, y, width, height, speed) {
        this.body = PIXI.Sprite.from(PIXI.Texture.WHITE);
        this.body.tint = 0xac6902;
        this.id = 4;

        this.setPosition(x, y);
        this.setSize(width, height);

        this.firedBullets = 0;

        this.recoilAnimationTime = 0;
        // This is based on delta... im not sure what unit this is in ngl but it feels right so
        this.cooldownPeriod = 5;

        this.maxBullets = 1;

        this.shotDelayAccumulator = 0;
        this.shotDelay = Math.random() * (100 - 80) + 80;

        this.targetDestination = null;

        this.turret = new PIXI.Graphics();
        this.turret.beginFill(0x965d00);
        this.turret.drawRect(0, -2, 20, 4);
        this.turret.endFill();
        this.turret.x = this.body.width / 2 - this.turret.height / 2; // Center of the tank's width
        this.turret.y = this.body.height / 2 - this.turret.height / 2; // Center of the tank's height

        this.body.addChild(this.turret);
        this.prevLine = null;

        this.alive = true;

        // This is permanently 0 due to Brown Tanks being stationary
        this.velocityX = 0;
        this.velocityY = 0;
        this.movementAngle = 0;
    }

    isAlive() {
        return this.isAlive
    }

    setAlive(alive) {
        this.alive = alive;
    }

    setPathfinder(physicalMap) {
        this.physicalMap = physicalMap;
        this.pathfinder = new AStarPathfinder(physicalMap);
    }

    setPosition(x, y) {
        this.body.x = x;
        this.body.y = y;
    }

    setSize(width, height) {
        this.body.width = width;
        this.body.height = height;
    }

    rotateTurret(targetX, targetY) {
        const turretBaseWorldX = this.body.x + this.body.width / 2;
        const turretBaseWorldY = this.body.y + this.body.height / 2;

        const dx = targetX - turretBaseWorldX;
        const dy = targetY - turretBaseWorldY;
        const angle = Math.atan2(dy, dx);

        this.turret.rotation = angle;
    }

    doLinesIntersect(aStart, aEnd, bStart, bEnd) {
        // Calculate the vectors from the start to the end points
        let d1x = aEnd.x - aStart.x;
        let d1y = aEnd.y - aStart.y;
        let d2x = bEnd.x - bStart.x;
        let d2y = bEnd.y - bStart.y;

        // Cross product to determine if parallel
        let cross = d1x * d2y - d1y * d2x;
        if (Math.abs(cross) < 1e-8) return false; // Lines are parallel

        // Calculate the intersection t value
        let t = ((bStart.x - aStart.x) * d2y - (bStart.y - aStart.y) * d2x) / cross;
        let u = ((bStart.x - aStart.x) * d1y - (bStart.y - aStart.y) * d1x) / cross;

        // Check if the scalar parameters are within bounds (0 to 1)
        return t >= 0 && t <= 1 && u >= 0 && u <= 1;
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

            this.firedBullets += 1;
            this.recoilAnimationTime = this.cooldownPeriod;
            return bullet;
        }
        return null;
    }

    isAdjacentToWall(map, cell) {
        const row = Math.floor(cell.body.y / 20); // Assuming 20 is the cell height
        const col = Math.floor(cell.body.x / 20); // Assuming 20 is the cell width

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                // Skip the cell itself
                if (dx === 0 && dy === 0) continue;

                const checkX = col + dx;
                const checkY = row + dy;

                // Check if the neighboring cell is within the map bounds
                if (checkX >= 0 && checkX < map[0].length && checkY >= 0 && checkY < map.length) {
                    // Check if the neighboring cell is a wall
                    if (map[checkY][checkX].isWall) {
                        return true; // Adjacent to a wall
                    }
                }
            }
        }
        return false; // Not adjacent to any wall
    }

    canShootAtAttackingBullet(allBullets, maxDistance) {
        let tankPosition = new PIXI.Point(this.body.x + this.body.width / 2, this.body.y + this.body.height / 2);
        let expandedHitbox = {
            x: this.body.x - 1,  // Expanding 2 units in total: 1 unit to the left
            y: this.body.y - 1,  // 1 unit to the top
            width: this.body.width + 2, // Expanding width by 2 units
            height: this.body.height + 2 // Expanding height by 2 units
        };
        let closestBullet = null;
        let minDistance = maxDistance;

        allBullets.forEach(bullet => {
            let bulletPath = {
                start: new PIXI.Point(bullet.body.x, bullet.body.y),
                end: new PIXI.Point(bullet.body.x + bullet.velocityX * maxDistance, bullet.body.y + bullet.velocityY * maxDistance)
            };

            if (this.isPathIntersectingRectangle(bulletPath, expandedHitbox)) {
                let distance = this.distance(tankPosition, bulletPath.start);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestBullet = bullet;
                }
            }
        });

        if (closestBullet) {
            return new PIXI.Point(closestBullet.body.x, closestBullet.body.y);
        }

        return null;
    }

    canShootDirectlyAtPlayer(player, collisionLines, myTeam, enemyTeam) {
        // Draw a straight line from the tank to the player and see if it intersects any collision lines
        let lineStart = new PIXI.Point(this.body.x, this.body.y);
        let lineEnd = new PIXI.Point(player.body.x, player.body.y);
        let path = { start: lineStart, end: lineEnd };

        for (let i = 0; i < collisionLines.length; i++) {
            let collisionLineStart = new PIXI.Point(collisionLines[i][0], collisionLines[i][1]);
            let collisionLineEnd = new PIXI.Point(collisionLines[i][2], collisionLines[i][3]);
            if (this.doLinesIntersect(lineStart, lineEnd, collisionLineStart, collisionLineEnd)) {
                return false;
            }
        }

        // Check if the line intersects with any other tank's bounding box
        for (let i = 0; i < myTeam.length; i++) {
            let tank = myTeam[i];

            // With the team changes this should technically never trigger
            if (tank === this || tank === player) {
                continue;
            }

            if (this.isPathIntersectingRectangle(path, tank.body)) {
                return false;
            }
        }

        return true;
    }

    canShootReflectedAtPlayer(player, collisionLines, myTeam, enemyTeam) {
        let tankPosition = new PIXI.Point(this.body.x + this.body.width, this.body.y + this.body.height);
        let playerPosition = new PIXI.Point(player.body.x + player.body.width / 2, player.body.y + player.body.height / 2);
        let potentialShots = [];

        for (let i = 0; i < collisionLines.length; i++) {
            let lineStart = new PIXI.Point(collisionLines[i][0], collisionLines[i][1]);
            let lineEnd = new PIXI.Point(collisionLines[i][2], collisionLines[i][3]);
            let reflectedPosition = this.reflectPointOverLine(playerPosition, lineStart, lineEnd);
            let aimPoint = this.getCollisionPoint(tankPosition, reflectedPosition, lineStart, lineEnd);

            if (aimPoint) {
                // Check if any other line is closer to the tank than the current one
                let isClosestCollisionLine = true;
                for (let j = 0; j < collisionLines.length; j++) {
                    if (i !== j) {
                        let otherLineStart = new PIXI.Point(collisionLines[j][0], collisionLines[j][1]);
                        let otherLineEnd = new PIXI.Point(collisionLines[j][2], collisionLines[j][3]);
                        let otherCollisionPoint = this.getCollisionPoint(tankPosition, reflectedPosition, otherLineStart, otherLineEnd);
                        if (otherCollisionPoint && this.distance(tankPosition, otherCollisionPoint) < this.distance(tankPosition, aimPoint)) {
                            isClosestCollisionLine = false;
                            break;
                        }
                    }
                }

                if (isClosestCollisionLine) {
                    let isPathObstructed = false;

                    // Check if the path from the aimPoint to the player intersects with any collision lines
                    if (this.anyLineIntersection(aimPoint, playerPosition, collisionLines.filter((_, idx) => idx !== i))) {
                        isPathObstructed = true;
                    }

                    // Check if the path from the tank to the aimPoint intersects with any other tanks
                    for (let j = 0; j < myTeam.length; j++) {
                        let tank = myTeam[j];
                        if (tank !== this && tank !== player) {
                            let tankBounds = tank.body.getBounds();
                            let expandedBounds = new PIXI.Rectangle(tankBounds.x - 1, tankBounds.y - 1, tankBounds.width + 2, tankBounds.height + 2)
                            if (this.isPathIntersectingRectangle({ start: tankPosition, end: aimPoint }, expandedBounds)) {
                                isPathObstructed = true;
                                break;
                            }
                        }
                    }

                    // Check if the path from the aimPoint to the player intersects with any other tanks
                    for (let j = 0; j < myTeam.length; j++) {
                        let tank = myTeam[j];
                        if (tank !== this && tank !== player) {
                            let tankBounds = tank.body.getBounds();
                            let expandedBounds = new PIXI.Rectangle(tankBounds.x - 1, tankBounds.y - 1, tankBounds.width + 2, tankBounds.height + 2)
                            if (this.isPathIntersectingRectangle({ start: aimPoint, end: playerPosition }, expandedBounds)) {
                                isPathObstructed = true;
                                break;
                            }
                        }
                    }

                    if (!isPathObstructed) {
                        let shotDistance = this.distance(tankPosition, aimPoint) + this.distance(aimPoint, playerPosition);
                        potentialShots.push({ aimPoint, shotDistance });
                    }
                }
            }
        }

        if (potentialShots.length > 0) {
            // Choose the shot with the shortest distance
            potentialShots.sort((a, b) => a.shotDistance - b.shotDistance);
            return potentialShots[0].aimPoint;
        }

        return null; // No valid reflected shot found
    }

    distance(point1, point2) {
        return Math.sqrt(Math.pow(point1.x - point2.x, 2) + Math.pow(point1.y - point2.y, 2));
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

    reflectPointOverLine(point, lineStart, lineEnd) {
        // Convert points to vector representation for easier calculations
        let A = { x: lineStart.x, y: lineStart.y };
        let B = { x: lineEnd.x, y: lineEnd.y };
        let P = { x: point.x, y: point.y };

        // Vector AB
        let AB = { x: B.x - A.x, y: B.y - A.y };
        // Vector BP
        let AP = { x: P.x - A.x, y: P.y - A.y };

        // Project vector AP onto AB using dot product
        let ab2 = AB.x * AB.x + AB.y * AB.y;
        let ap_ab = AP.x * AB.x + AP.y * AB.y;
        let t = ap_ab / ab2;

        // Find the projection point
        let Closest = { x: A.x + t * AB.x, y: A.y + t * AB.y };

        // Calculate the reflected point
        let Reflected = { x: 2 * Closest.x - P.x, y: 2 * Closest.y - P.y };

        return new PIXI.Point(Reflected.x, Reflected.y);
    }

    isPathIntersectingRectangle(path, rect) {
        // Define the rectangle's edges
        let left = rect.x, right = rect.x + rect.width;
        let top = rect.y, bottom = rect.y + rect.height;

        // Check if either end of the path is inside the rectangle
        if (this.isPointInsideRectangle(path.start, rect) || this.isPointInsideRectangle(path.end, rect)) {
            return true;
        }

        // Define the rectangle's four edges as line segments
        let edges = [
            { start: new PIXI.Point(left, top), end: new PIXI.Point(right, top) },     // Top edge
            { start: new PIXI.Point(left, bottom), end: new PIXI.Point(right, bottom) }, // Bottom edge
            { start: new PIXI.Point(left, top), end: new PIXI.Point(left, bottom) },   // Left edge
            { start: new PIXI.Point(right, top), end: new PIXI.Point(right, bottom) }  // Right edge
        ];

        // Check intersection with each edge
        return edges.some(edge => this.getCollisionPoint(path.start, path.end, edge.start, edge.end) !== null);
    }

    isPointInsideRectangle(point, rect) {
        return point.x >= rect.x && point.x <= rect.x + rect.width &&
            point.y >= rect.y && point.y <= rect.y + rect.height;
    }

    distance(point1, point2) {
        return Math.sqrt(Math.pow(point1.x - point2.x, 2) + Math.pow(point1.y - point2.y, 2));
    }


    anyLineIntersection(start, end, lines) {
        // Check if a line segment defined by 'start' and 'end' intersects with any line in 'lines'
        for (let i = 0; i < lines.length; i++) {
            let lineStart = new PIXI.Point(lines[i][0], lines[i][1]);
            let lineEnd = new PIXI.Point(lines[i][2], lines[i][3]);
            if (this.doLinesIntersect(start, end, lineStart, lineEnd)) {
                return true;
            }
        }
        return false; // No intersections
    }

    getClosestTarget(enemyTeam) {
        let res = enemyTeam[0];
        let distance = this.distance(new PIXI.Point(this.body.x, this.body.y),
            new PIXI.Point(enemyTeam[0].body.x, enemyTeam[0].body.y));

        for (let t = 1; t < enemyTeam.length; t++) {
            let currTank = enemyTeam[t];
            let currDistance = this.distance(new PIXI.Point(this.body.x, this.body.y),
                new PIXI.Point(currTank.body.x, currTank.body.y));

            if (currDistance < distance) {
                distance = currDistance;
                res = currTank;
            }
        }

        return res;
    }

    update(delta, mapWalls, player, collisionLines, allBullets, myTeam, enemyTeam) {
        let res = [];
        let canShoot = false;

        player = this.getClosestTarget(enemyTeam);

        this.wallPathChangeTimeAccumulator += delta;
        this.shotDelayAccumulator += delta;
        if (this.shotDelayAccumulator > this.shotDelay) {
            canShoot = true;
            this.shotDelayAccumulator = 0;
            this.shotDelay = Math.random() * (300 - 80) + 80;
        }

        // This section is on shooting  
        const attackingBullet = this.canShootAtAttackingBullet(allBullets, 50);
        // Defensive maneuver
        if (canShoot && attackingBullet) {
            this.rotateTurret(attackingBullet.x, attackingBullet.y);
            let returnedBullet = this.fireBullet();
            if (returnedBullet) {
                res.push(returnedBullet);
            }
        } else if (canShoot) {
            const seed = Math.random();
            // Randomize between shooting reflected and direct shot
            if (seed >= 0.6) {
                // Direct shot
                if (this.canShootDirectlyAtPlayer(player, collisionLines, myTeam, enemyTeam)) {
                    // Rotate the turret towards the player
                    this.rotateTurret(player.body.x + player.body.width / 2, player.body.y + player.body.height / 2);
                    let returnedBullet = this.fireBullet();
                    if (returnedBullet) {
                        res.push(returnedBullet);
                    }
                }
            } else {
                // Reflected shot
                let shootingPoint = this.canShootReflectedAtPlayer(player, collisionLines, myTeam, enemyTeam);
                if (shootingPoint) {
                    this.rotateTurret(shootingPoint.x, shootingPoint.y);
                    let returnedBullet = this.fireBullet();
                    if (returnedBullet) {
                        res.push(returnedBullet);
                    }
                }
            }
        }
        return res;
    }
}