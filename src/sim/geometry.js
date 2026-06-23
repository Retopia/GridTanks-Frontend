// Pure geometry helpers shared by the headless sim. These are ports of the
// math in game/Tank.js and game/bullets/*.js with PIXI.Point replaced by plain
// {x, y} objects, so the behavior matches the browser game exactly.

export function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

// Intersection point of segment a->b with segment c->d, or null. Matches
// Tank.getCollisionPoint / Bullet.getCollisionPoint.
export function getCollisionPoint(aStart, aEnd, bStart, bEnd, eps = 1e-8) {
    const d1x = aEnd.x - aStart.x;
    const d1y = aEnd.y - aStart.y;
    const d2x = bEnd.x - bStart.x;
    const d2y = bEnd.y - bStart.y;

    const cross = d1x * d2y - d1y * d2x;
    if (Math.abs(cross) < eps) return null;

    const t = ((bStart.x - aStart.x) * d2y - (bStart.y - aStart.y) * d2x) / cross;
    const u = ((bStart.x - aStart.x) * d1y - (bStart.y - aStart.y) * d1x) / cross;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        return { x: aStart.x + t * d1x, y: aStart.y + t * d1y };
    }
    return null;
}

// Boolean segment intersection (Tank.doLinesIntersect).
export function segmentsIntersect(aStart, aEnd, bStart, bEnd) {
    const d1x = aEnd.x - aStart.x;
    const d1y = aEnd.y - aStart.y;
    const d2x = bEnd.x - bStart.x;
    const d2y = bEnd.y - bStart.y;

    const cross = d1x * d2y - d1y * d2x;
    if (Math.abs(cross) < 1e-8) return false;

    const t = ((bStart.x - aStart.x) * d2y - (bStart.y - aStart.y) * d2x) / cross;
    const u = ((bStart.x - aStart.x) * d1y - (bStart.y - aStart.y) * d1x) / cross;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

export function pointInRect(point, rect) {
    return (
        point.x >= rect.x && point.x <= rect.x + rect.width &&
        point.y >= rect.y && point.y <= rect.y + rect.height
    );
}

// Tank.isPathIntersectingRectangle.
export function pathIntersectsRect(start, end, rect) {
    if (pointInRect(start, rect) || pointInRect(end, rect)) return true;
    const left = rect.x;
    const right = rect.x + rect.width;
    const top = rect.y;
    const bottom = rect.y + rect.height;
    const edges = [
        [{ x: left, y: top }, { x: right, y: top }],
        [{ x: left, y: bottom }, { x: right, y: bottom }],
        [{ x: left, y: top }, { x: left, y: bottom }],
        [{ x: right, y: top }, { x: right, y: bottom }]
    ];
    return edges.some((e) => getCollisionPoint(start, end, e[0], e[1]) !== null);
}

// Tank.reflectPointOverLine — mirror a point across an (infinite) line.
export function reflectPointOverLine(point, lineStart, lineEnd) {
    const abx = lineEnd.x - lineStart.x;
    const aby = lineEnd.y - lineStart.y;
    const apx = point.x - lineStart.x;
    const apy = point.y - lineStart.y;
    const ab2 = abx * abx + aby * aby;
    const t = ab2 === 0 ? 0 : (apx * abx + apy * aby) / ab2;
    const closestX = lineStart.x + t * abx;
    const closestY = lineStart.y + t * aby;
    return { x: 2 * closestX - point.x, y: 2 * closestY - point.y };
}

export function anyLineIntersection(start, end, lines) {
    for (const line of lines) {
        if (segmentsIntersect(start, end, { x: line[0], y: line[1] }, { x: line[2], y: line[3] })) {
            return true;
        }
    }
    return false;
}
