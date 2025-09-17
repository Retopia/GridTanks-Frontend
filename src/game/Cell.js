export class Cell {
    constructor(x, y, width, height, cellType) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.cellType = cellType;

        this.createBody();
        this.body.position.set(x, y);
    }

    createBody() {
        if (this.cellType === 'wall' || this.cellType === 'path' || this.cellType === 'player' || this.cellType === 'brown' || this.cellType === 'grey' || this.cellType === 'green' || this.cellType === 'pink') {
            let cell = new PIXI.Graphics();
            cell.beginFill(this.getColor());
            cell.drawRect(0, 0, this.width, this.height);
            cell.endFill();
            this.body = cell;
        } else if (this.cellType === 'hole') {
            let hole = new PIXI.Graphics();
            hole.beginFill(0x101010);
            hole.drawCircle(this.width / 2, this.height / 2, Math.min(this.width, this.height) / 2 * 0.9);
            hole.endFill();
            this.body = hole;
        }
    }

    setCellType(type) {
        if (this.cellType !== type) {
            this.cellType = type;
            this.createBody();
            this.body.position.set(this.x, this.y);
        }
    }

    getCellType() {
        return this.cellType;
    }

    clearCellType() {
        this.setCellType('path');
    }

    getColor() {
        switch (this.cellType) {
            case 'wall':
                return 0x303030;
            case 'path':
                return 0xFFFFFF;
            case 'player':
                return 0x0000dd;
            case 'brown':
                return 0xac6902;
            case 'grey':
                return 0xa8a8a8;
            case 'green':
                return 0x009530;
            case 'pink':
                return 0xC35C70;
            default:
                return 0xFFFFFF;
        }
    }
}