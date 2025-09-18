import { FireBullet } from "../bullets/FireBullet.js";
import { AStarPathfinder } from "../AStarPathfinder.js";
export class GreenTank {

    constructor(x, y, width, height, speed) {
        this.body = PIXI.Sprite.from(PIXI.Texture.WHITE);
        this.body.tint = 0x009530;
        this.id = 6;

        this.setPosition(x, y);
        this.setSize(width, height);

        this.speed = speed;
        this.firedBullets = 0;

        this.recoilAnimationTime = 0;
        this.cooldownPeriod = 5;

        this.wallPathChangeTime = 120;
        this.wallPathChangeTimeAccumulator = 0;

        this.maxBullets = 1;

        this.shotDelayAccumulator = 0;
        this.shotDelay = Math.random() * (100 - 60) + 60;

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

            const bullet = new FireBullet(this, startX, startY);
            bullet.fire(angle)

            this.firedBullets += 1;
            this.recoilAnimationTime = this.cooldownPeriod;
            return bullet;
        }
        return null;
    }

    isAdjacentToWallOrHole(map, cell) {
        const row = Math.floor(Math.floor(cell.body.y) / 20); // Assuming 20 is the cell height
        const col = Math.floor(Math.floor(cell.body.x) / 20); // Assuming 20 is the cell width

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                // Skip the cell itself
                if (dx === 0 && dy === 0) continue;

                const checkX = col + dx;
                const checkY = row + dy;

                // Check if the neighboring cell is within the map bounds
                if (checkX >= 0 && checkX < map[0].length && checkY >= 0 && checkY < map.length) {
                    // Check if the neighboring cell is a wall
                    if (this.isWallOrHole(map[checkY][checkX])) {
                        return true; // Adjacent to a wall
                    }
                }
            }
        }
        return false; // Not adjacent to any wall
    }

    findSafeDestination(map, currentCell, maxDistance) {
        let lowestDanger = Infinity;
        let safeCells = [];

        for (let i = -maxDistance; i <= maxDistance; i++) {
            for (let j = -maxDistance; j <= maxDistance; j++) {
                let cellRow = currentCell.row + i;
                let cellCol = currentCell.col + j;

                // Check boundaries
                if (cellRow >= 0 && cellRow < map.length && cellCol >= 0 && cellCol < map[0].length
                    && !this.isAdjacentToWallOrHole(map, map[cellRow][cellCol]) && !(map[cellRow][cellCol].getCellType() === 'wall')) {
                    let danger = map[cellRow][cellCol].dangerValue;
                    if (danger < lowestDanger) {
                        lowestDanger = danger;
                        safeCells = [{ row: cellRow, col: cellCol }];
                    } else if (danger === lowestDanger) {
                        safeCells.push({ row: cellRow, col: cellCol });
                    }
                }
            }
        }

        // Randomly select one of the safe cells
        if (safeCells.length > 0) {
            let randomIndex = Math.floor(Math.random() * safeCells.length);
            return safeCells[randomIndex];
        }

        return null;
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

    predictiveDodge(allBullets, delta) {
        let dodgeDirection = { x: 0, y: 0 };

        for (let bullet of allBullets) {
            let bulletDirection = {
                x: bullet.velocityX,
                y: bullet.velocityY
            };

            let bulletToTank = {
                x: this.body.x - bullet.body.x,
                y: this.body.y - bullet.body.y
            };

            let dotProduct = bulletDirection.x * bulletToTank.x + bulletDirection.y * bulletToTank.y;

            if (dotProduct > 0) {
                let bulletFuturePosition = {
                    x: bullet.body.x + bullet.velocityX * delta,
                    y: bullet.body.y + bullet.velocityY * delta
                };

                let distanceThreshold = 80; // Adjust this value based on your game's scale

                if (this.distance(this.body, bulletFuturePosition) < distanceThreshold) {
                    let dodgeX = this.body.x - bulletFuturePosition.x;
                    let dodgeY = this.body.y - bulletFuturePosition.y;

                    let magnitude = Math.sqrt(dodgeX * dodgeX + dodgeY * dodgeY);
                    if (magnitude > 0) {
                        dodgeX /= magnitude;
                        dodgeY /= magnitude;
                    }

                    dodgeDirection.x += dodgeX;
                    dodgeDirection.y += dodgeY;
                }
            }
        }

        let magnitude = Math.sqrt(dodgeDirection.x * dodgeDirection.x + dodgeDirection.y * dodgeDirection.y);
        if (magnitude > 0) {
            dodgeDirection.x /= magnitude;
            dodgeDirection.y /= magnitude;
        }

        return dodgeDirection;
    }

    isWallOrHole(cell) {
        return cell.getCellType() === 'wall' || cell.getCellType() === 'hole';
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
        let cellHeight = 20;
        let cellWidth = 20;
        let canShoot = false;
        player = this.getClosestTarget(enemyTeam);

        // Debugging visual for pathfinding
        // if (this.targetDestination) {
        //     mapWalls[this.targetDestination.row][this.targetDestination.col].body.tint = 0x0000FF;
        // }

        // if (this.path) {
        //     for (let i = 0; i < this.path.length; i++) {
        //         this.path[i].body.tint = 0xFF00FF;
        //     }
        // }

        if (this.recoilAnimationTime > 0) {
            this.recoilAnimationTime -= delta;
        }

        this.wallPathChangeTimeAccumulator += delta;
        this.shotDelayAccumulator += delta;
        if (this.shotDelayAccumulator > this.shotDelay) {
            canShoot = true;
            this.shotDelayAccumulator = 0;
            this.shotDelay = Math.random() * (100 - 60) + 60;
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
            // Direct shot
            if (this.canShootDirectlyAtPlayer(player, collisionLines, myTeam, enemyTeam)) {
                // Rotate the turret towards the player
                this.rotateTurret(player.body.x + player.body.width / 2, player.body.y + player.body.height / 2);
                let returnedBullet = this.fireBullet();
                if (returnedBullet) {
                    res.push(returnedBullet);
                }
            }
        }

        // This section is on movement
        if (this.recoilAnimationTime <= 0) {
            let currentCell = {
                row: Math.floor(this.body.y / cellHeight),
                col: Math.floor(this.body.x / cellWidth)
            };

            // Determine if a new target destination is needed
            if (!this.targetDestination ||
                (this.targetDestination.row === currentCell.row && this.targetDestination.col === currentCell.col)) {
                this.targetDestination = this.findSafeDestination(mapWalls, currentCell, 15);
                this.path = this.pathfinder.findPath({ x: currentCell.col, y: currentCell.row },
                    { x: this.targetDestination.col, y: this.targetDestination.row });
            }

            // Store the previous position before movement
            let prevX = this.body.x;
            let prevY = this.body.y;

            // Predictive Dodging
            let bulletDodgeDirection = this.predictiveDodge(allBullets, delta);

            if (bulletDodgeDirection.x !== 0 || bulletDodgeDirection.y !== 0) {
                // Move the tank based on the dodge direction
                this.body.x += bulletDodgeDirection.x * this.speed * delta;
                this.body.y += bulletDodgeDirection.y * this.speed * delta;
            } else {
                // Move towards the next waypoint in the path
                if (this.path && this.path.length > 0) {
                    let nextWaypoint = this.path[0];
                    let waypointX = nextWaypoint.body.x + cellWidth / 2;
                    let waypointY = nextWaypoint.body.y + cellHeight / 2;

                    let directionX = waypointX - this.body.x;
                    let directionY = waypointY - this.body.y;

                    let magnitude = Math.sqrt(directionX * directionX + directionY * directionY);
                    if (magnitude < 1) {
                        this.path.shift();
                    } else {
                        directionX /= magnitude;
                        directionY /= magnitude;

                        this.body.x += directionX * this.speed * delta;
                        this.body.y += directionY * this.speed * delta;
                    }
                }
            }

            let changePath = false;

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
                            this.body.x = prevX;
                            this.body.y = prevY;
                            changePath = true;
                            break;
                        }
                    }
                }
            }

            if (changePath && (this.wallPathChangeTimeAccumulator > this.wallPathChangeTime)) {
                this.wallPathChangeTimeAccumulator = 0;
                let currentCell = {
                    row: Math.floor(this.body.y / cellHeight),
                    col: Math.floor(this.body.x / cellWidth)
                };

                this.targetDestination = this.findSafeDestination(mapWalls, currentCell, 15);
                this.path = this.pathfinder.findPath({ x: currentCell.col, y: currentCell.row },
                    { x: this.targetDestination.col, y: this.targetDestination.row });
            }
        }
        return res;
    }
}