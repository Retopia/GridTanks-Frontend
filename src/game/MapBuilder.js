import { Cell } from "./Cell.js"

export class MapBuilder {

    constructor() {
        this.map = [];
        this.rows = 30;
        this.cols = 40;
        this.cellWidth = 20;
        this.cellHeight = 20;

        this.mouseX = 0;
        this.mouseY = 0;
        this.heldDownLeft = false;
        this.isWall = false;
        this.gridLines = new PIXI.Graphics();
        this.app = new PIXI.Application({
            width: 800,
            height: 600,
            backgroundColor: 0xffffff
        });

        this.mode = "wall";

        this.lineStart = null;
        this.playerSpawnMarked = false;

        // This is for the pointermove painting
        this.isWall = false;
        this.isHole = false;

        this.collisionLines = [];
    }

    setup() {
        // Creating the map
        for (let i = 0; i < this.rows; i++) {
            let tempWalls = [];
            for (let j = 0; j < this.cols; j++) {
                let cellType = 'path'
                if (i == 0 || i == this.rows - 1 || j == 0 || j == this.cols - 1) {
                    cellType = 'wall'
                }
                let wall = new Cell(j * 20, i * 20, this.cellWidth, this.cellHeight, cellType);
                tempWalls.push(wall);
                this.app.stage.addChild(wall.body)
            }
            this.map.push(tempWalls);
        }

        this.gridLines = new PIXI.Graphics();
        this.app.stage.addChild(this.gridLines);
        this.drawGridLines();

        document.getElementById('gameContainer').appendChild(this.app.view);

        document.getElementById('fileInput').addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) {
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const fileContent = e.target.result;
                // Now you have the file content, and you can process it
                let loadedMap = this.loadMapFromFile(fileContent);
                this.updateMap(loadedMap);
            };

            reader.readAsText(file); // Read the file as text
        });

        document.getElementById('itemSelect').addEventListener('change', (event) => {
            let selectedValue = event.target.value;
            this.mode = selectedValue;
        });

        document.getElementById('copyMapButton').addEventListener('click', (event) => {
            let mapString = '';

            // path = 0
            // wall = 1
            // hole = 2
            // player = 3
            // brown = 4
            // grey = 5
            // green = 6
            // pink = 7
            for (let i = 0; i < this.map.length; i++) {
                for (let j = 0; j < this.map[i].length; j++) {
                    let currentCell = this.map[i][j];
                    if (currentCell.getCellType() === 'path') {
                        mapString += '0 ';
                    } else if (currentCell.getCellType() === 'wall') {
                        mapString += '1 ';
                    } else if (currentCell.getCellType() === 'hole') {
                        mapString += '2 ';
                    } else if (currentCell.getCellType() === 'player') {
                        mapString += '3 ';
                    } else if (currentCell.getCellType() === 'brown') {
                        mapString += '4 ';
                    } else if (currentCell.getCellType() === 'grey') {
                        mapString += '5 ';
                    } else if (currentCell.getCellType() === 'green') {
                        mapString += '6 ';
                    } else if (currentCell.getCellType() === 'pink') {
                        mapString += '7 ';
                    }
                }
                mapString = mapString.trimEnd() + '\n';
            }

            mapString += '\n'
            for (let i = 0; i < this.collisionLines.length; i++) {
                const line = this.collisionLines[i];
                mapString += line[0] + ' ' + line[1] + ' ' + line[2] + ' ' + line[3] + '\n'
            }

            navigator.clipboard.writeText(mapString).then(function () {
                console.log('Async: Copying to clipboard was successful!');
            }, function (err) {
                console.error('Async: Could not copy text: ', err);
            });

            return mapString; // Return the string representation of the map
        });

        this.app.renderer.plugins.interaction.on('pointermove', (event) => {
            const newPosition = event.data.global;
            this.mouseX = newPosition.x;
            this.mouseY = newPosition.y;

            if (this.mode === "wall") {
                if (this.heldDownLeft) {
                    let xPos = Math.floor(this.mouseX / this.cellWidth);
                    let yPos = Math.floor(this.mouseY / this.cellHeight);

                    // Bounds checking
                    if (yPos > 0 && yPos < this.map.length - 1 && xPos > 0 && xPos < this.map[0].length - 1) {
                        let cell = this.map[yPos][xPos];
                        this.app.stage.removeChild(cell.body);
                        if (this.isWall) {
                            cell.setCellType('wall');
                        } else {
                            cell.setCellType('path');
                        }
                        this.app.stage.addChild(cell.body);
                        this.drawGridLines();
                    }
                }
            }

            if (this.mode === "hole") {
                if (this.heldDownLeft) {
                    let xPos = Math.floor(this.mouseX / this.cellWidth);
                    let yPos = Math.floor(this.mouseY / this.cellHeight);

                    // Bounds checking
                    if (yPos > 0 && yPos < this.map.length - 1 && xPos > 0 && xPos < this.map[0].length - 1) {
                        let cell = this.map[yPos][xPos];
                        this.app.stage.removeChild(cell.body);
                        if (this.isHole) {
                            cell.setCellType('hole');
                        } else {
                            cell.setCellType('path');
                        }
                        this.app.stage.addChild(cell.body);
                        this.drawGridLines();
                    }
                }
            }

            if (this.mode === 'line') {
                if (this.heldDownRight) {
                    if (this.mode === 'line') {
                        let xPos = Math.floor(this.mouseX / this.cellWidth) * this.cellWidth + this.cellWidth / 2;
                        let yPos = Math.floor(this.mouseY / this.cellHeight) * this.cellHeight + this.cellHeight / 2;
                        let clickPoint = { x: xPos, y: yPos };
                        let threshold = 10; // Distance threshold to consider click on the line

                        for (let i = 0; i < this.collisionLines.length; i++) {
                            let line = this.collisionLines[i];
                            let lineStart = { x: line[0], y: line[1] };
                            let lineEnd = { x: line[2], y: line[3] };

                            if (this.pointToLineDistance(clickPoint, lineStart, lineEnd) <= threshold) {
                                this.app.stage.removeChild(line[4])
                                this.collisionLines.splice(i, 1); // Remove the line
                                break;
                            }
                        }
                    }
                }
            }
        });

        this.app.renderer.view.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        });

        this.app.renderer.plugins.interaction.on('pointerdown', (event) => {
            if (event.data.button === 2) {
                this.heldDownRight = true;
                if (this.mode === 'line') {
                    let xPos = Math.floor(this.mouseX / this.cellWidth) * this.cellWidth + this.cellWidth / 2;
                    let yPos = Math.floor(this.mouseY / this.cellHeight) * this.cellHeight + this.cellHeight / 2;
                    let clickPoint = { x: xPos, y: yPos };
                    let threshold = 10; // Distance threshold to consider click on the line

                    for (let i = 0; i < this.collisionLines.length; i++) {
                        let line = this.collisionLines[i];
                        let lineStart = { x: line[0], y: line[1] };
                        let lineEnd = { x: line[2], y: line[3] };

                        if (this.pointToLineDistance(clickPoint, lineStart, lineEnd) <= threshold) {
                            this.app.stage.removeChild(line[4])
                            this.collisionLines.splice(i, 1); // Remove the line
                            break;
                        }
                    }
                }
            }

            if (event.data.button === 0) {
                this.heldDownLeft = true;
                let xPos = Math.floor(this.mouseX / this.cellWidth);
                let yPos = Math.floor(this.mouseY / this.cellHeight);

                if (this.mode === 'wall') {
                    if (yPos > 0 && yPos < this.map.length - 1 && xPos > 0 && xPos < this.map[0].length - 1) {
                        let cell = this.map[yPos][xPos];
                        this.app.stage.removeChild(cell.body);
                        if (cell.getCellType() === 'path') {
                            cell.setCellType('wall');
                            this.isWall = true;
                        } else {
                            cell.setCellType('path');
                            this.isWall = false;
                        }
                        this.app.stage.addChild(cell.body);
                        this.drawGridLines();
                    }
                }

                if (this.mode === 'hole') {
                    if (yPos > 0 && yPos < this.map.length - 1 && xPos > 0 && xPos < this.map[0].length - 1) {
                        let cell = this.map[yPos][xPos];
                        this.app.stage.removeChild(cell.body);
                        if (cell.getCellType() === 'path') {
                            cell.setCellType('hole');
                            this.isHole = true;
                        } else {
                            cell.setCellType('path');
                            this.isHole = false;
                        }
                        this.app.stage.addChild(cell.body);
                        this.drawGridLines();
                    }
                }

                if (this.mode === 'line') {
                    xPos = Math.round(this.mouseX / this.cellWidth) * this.cellWidth;
                    yPos = Math.round(this.mouseY / this.cellHeight) * this.cellHeight;

                    if (this.lineStart === null) {
                        // First click - set the start point of the line
                        this.lineStart = { x: xPos, y: yPos }; // Store start point coordinates

                        // Draw and store the circle graphic
                        this.lineStartCircle = new PIXI.Graphics();
                        this.lineStartCircle.beginFill(0xFF00FF);
                        this.lineStartCircle.drawCircle(xPos, yPos, 5); // Draw circle at the start point
                        this.lineStartCircle.endFill();
                        this.app.stage.addChild(this.lineStartCircle);
                    } else {
                        // Second click - draw the line
                        if (!(this.lineStart.x == xPos && this.lineStart.y == yPos)) {
                            let line = new PIXI.Graphics();
                            line.lineStyle(3, 0xFF00FF)
                                .moveTo(this.lineStart.x, this.lineStart.y) // Start from the first point
                                .lineTo(xPos, yPos); // Draw line to the second point
                            this.app.stage.addChild(line);

                            // Remove the start point circle from the stage
                            this.app.stage.removeChild(this.lineStartCircle);

                            this.collisionLines.push([this.lineStart.x, this.lineStart.y, xPos, yPos, line])

                            this.lineStart = null;
                            this.lineStartCircle = null;
                        } else {
                            this.app.stage.removeChild(this.lineStartCircle);
                            this.lineStart = null;
                            this.lineStartCircle = null;
                        }
                    }
                }

                if (this.mode === 'playerSpawn') {
                    if (yPos > 0 && yPos < this.map.length - 1 && xPos > 0 && xPos < this.map[0].length - 1) {
                        let cell = this.map[yPos][xPos];
                        this.app.stage.removeChild(cell.body);
                        if (cell.getCellType() === 'player') {
                            cell.clearCellType();
                            this.playerSpawnMarked = false;
                        } else if (this.playerSpawnMarked === false) {
                            cell.setCellType('player');
                            this.playerSpawnMarked = true;
                        }
                        this.app.stage.addChild(cell.body);
                        this.drawGridLines();
                    }
                }

                if (this.mode === 'brownTankSpawn') {
                    if (yPos > 0 && yPos < this.map.length - 1 && xPos > 0 && xPos < this.map[0].length - 1) {
                        let cell = this.map[yPos][xPos];
                        this.app.stage.removeChild(cell.body);
                        if (cell.getCellType() === 'brown') {
                            cell.clearCellType();
                        } else {
                            cell.setCellType('brown');
                        }
                        this.app.stage.addChild(cell.body);
                        this.drawGridLines();
                    }
                }

                if (this.mode === 'greyTankSpawn') {
                    if (yPos > 0 && yPos < this.map.length - 1 && xPos > 0 && xPos < this.map[0].length - 1) {
                        let cell = this.map[yPos][xPos];
                        this.app.stage.removeChild(cell.body);
                        if (cell.getCellType() === 'grey') {
                            cell.clearCellType();
                        } else {
                            cell.setCellType('grey');
                        }
                        this.app.stage.addChild(cell.body);
                        this.drawGridLines();
                    }
                }

                if (this.mode === 'greenTankSpawn') {
                    if (yPos > 0 && yPos < this.map.length - 1 && xPos > 0 && xPos < this.map[0].length - 1) {
                        let cell = this.map[yPos][xPos];
                        this.app.stage.removeChild(cell.body);
                        if (cell.getCellType() === 'green') {
                            cell.clearCellType();
                        } else {
                            cell.setCellType('green');
                        }
                        this.app.stage.addChild(cell.body);
                        this.drawGridLines();
                    }
                }

                if (this.mode === 'pinkTankSpawn') {
                    if (yPos > 0 && yPos < this.map.length - 1 && xPos > 0 && xPos < this.map[0].length - 1) {
                        let cell = this.map[yPos][xPos];
                        this.app.stage.removeChild(cell.body);
                        if (cell.getCellType() === 'pink') {
                            cell.clearCellType();
                        } else {
                            cell.setCellType('pink');
                        }
                        this.app.stage.addChild(cell.body);
                        this.drawGridLines();
                    }
                }
            }
        });

        this.app.renderer.plugins.interaction.on('pointerup', (event) => {
            if (event.data.button === 0) {
                this.heldDownLeft = false;
            }

            if (event.data.button === 2) {
                this.heldDownRight = false;
            }
        });
    }

    drawGridLines() {
        this.gridLines.clear();
        this.gridLines.lineStyle(1, 0xcccccc, 1);

        // Draw horizontal lines
        for (let i = 0; i <= this.rows; i++) {
            this.gridLines.moveTo(0, i * this.cellHeight);
            this.gridLines.lineTo(this.cols * this.cellWidth, i * this.cellHeight);
        }

        // Draw vertical lines
        for (let j = 0; j <= this.cols; j++) {
            this.gridLines.moveTo(j * this.cellWidth, 0);
            this.gridLines.lineTo(j * this.cellWidth, this.rows * this.cellHeight);
        }
        this.app.stage.addChild(this.gridLines);
    }

    getCellTypeFromValue(value) {
        switch (value) {
            case 0: return 'path';
            case 1: return 'wall';
            case 2: return 'hole';
            case 3: return 'player';
            case 4: return 'brown';
            case 5: return 'grey';
            case 6: return 'green';
            case 7: return 'pink';
            default: return 'path';
        }
    }

    pointToLineDistance(point, lineStart, lineEnd) {
        // Calculate the distance from the point to the line segment
        let A = point.x - lineStart.x;
        let B = point.y - lineStart.y;
        let C = lineEnd.x - lineStart.x;
        let D = lineEnd.y - lineStart.y;

        let dot = A * C + B * D;
        let lenSq = C * C + D * D;
        let param = -1;
        if (lenSq != 0) { // In case of 0 length line
            param = dot / lenSq;
        }

        let xx, yy;

        if (param < 0) {
            xx = lineStart.x;
            yy = lineStart.y;
        } else if (param > 1) {
            xx = lineEnd.x;
            yy = lineEnd.y;
        } else {
            xx = lineStart.x + param * C;
            yy = lineStart.y + param * D;
        }

        let dx = point.x - xx;
        let dy = point.y - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    loadMapFromFile(fileContent) {
        // Normalize newlines (convert all to Unix-style)
        fileContent = fileContent.replace(/\r\n/g, '\n');

        // Split the file content into wall data and collision line data
        const sections = fileContent.trim().split('\n\n');

        let wallData = sections[0];
        let lineData = sections.length > 1 ? sections[1] : '';

        // Process wall data
        let loadedMap = wallData.split('\n').map(row => row.trim().split(' ').map(Number));

        // Process collision line data
        let loadedLines = [];
        if (lineData) {
            lineData.split('\n').forEach(line => {
                let coords = line.split(' ').map(Number);
                if (coords.length === 4) { // Ensure the line has exactly four coordinates
                    loadedLines.push(coords);
                }
            });
        }

        return { map: loadedMap, lines: loadedLines };
    }

    // path = 0
    // wall = 1
    // hole = 2
    // player = 3
    // brown = 4
    // grey = 5
    // green = 6
    // pink = 7
    updateMap(loadedData) {
        let inputMap = loadedData.map;
        for (let i = 0; i < inputMap.length; i++) {
            for (let j = 0; j < inputMap[i].length; j++) {
                // This is not optimal but very easy to read
                let currentCell = this.map[i][j];
                this.app.stage.removeChild(currentCell.body);
                currentCell.setCellType(this.getCellTypeFromValue(inputMap[i][j]));
                this.app.stage.addChild(currentCell.body)
            }
        }

        // Update collision lines
        let loadedLines = loadedData.lines;
        this.collisionLines = [];
        loadedLines.forEach(lineCoords => {
            let line = new PIXI.Graphics();
            line.lineStyle(3, 0xFF00FF)
                .moveTo(lineCoords[0], lineCoords[1])
                .lineTo(lineCoords[2], lineCoords[3]);
            this.app.stage.addChild(line);
            lineCoords.push(line)
            this.collisionLines.push(lineCoords);
        });

        this.drawGridLines();
    }

    cleanup() {
        this.app.stage.removeChildren();
        document.getElementById('gameContainer').removeChild(this.app.view);
        this.app = null;
    }
}