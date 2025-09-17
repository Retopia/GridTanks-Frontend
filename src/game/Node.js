export class Node {
    constructor(cell) {
        this.cell = cell;
        this.gCost = Infinity;
        this.hCost = 0;
        this.fCost = Infinity;
        this.parent = null;
    }

    get x() {
        return this.cell.body.x / this.cell.body.width;
    }

    get y() {
        return this.cell.body.y / this.cell.body.height;
    }

    get isWall() {
        return this.cell.getCellType() === 'wall';
    }
}