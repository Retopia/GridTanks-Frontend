import * as PIXI from 'pixi.js-legacy';
import { Player } from "./Player.js"
import { Cell } from "./Cell.js"
import { Tank } from './Tank.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const TANK_PRESETS = {
    BROWN: {
        x: 0,
        y: 0,
        color: 0xAC6902,
        id: 4,
        width: 18,
        height: 18,
        speed: 0,
        bulletType: "normal",
        maxBullets: 1,
        shotDelayFunction: () => Math.random() * (100 - 80) + 80,
        reflectedShotThreshold: 0.6,
        predictiveDodgeDistanceThreshold: 0,
    },
    GRAY: {
        x: 0,
        y: 0,
        color: 0x808080,
        id: 5,
        width: 18,
        height: 18,
        speed: 1.25,
        bulletType: "normal",
        maxBullets: 2,
        shotDelayFunction: () => Math.random() * (100 - 80) + 80,
        reflectedShotThreshold: 0.6,
        predictiveDodgeDistanceThreshold: 120,
    },
    GREEN: {
        x: 0,
        y: 0,
        color: 0x228B22,
        id: 6,
        width: 18,
        height: 18,
        speed: 1.5,
        bulletType: "fire",
        maxBullets: 1,
        shotDelayFunction: () => Math.random() * (100 - 60) + 60,
        reflectedShotThreshold: 0,
        predictiveDodgeDistanceThreshold: 80,
    },
    PINK: {
        x: 0,
        y: 0,
        color: 0xC35C70,
        id: 7,
        width: 18,
        height: 18,
        speed: 1.75,
        bulletType: "normal",
        maxBullets: 5,
        shotDelayFunction: () => Math.random() * (50 - 20) + 20,
        reflectedShotThreshold: 0.5,
        predictiveDodgeDistanceThreshold: 70,
    },
    BLACK: {
        x: 0,
        y: 0,
        color: 0x000000,
        id: 8,
        width: 18,
        height: 18,
        speed: 2,
        bulletType: "fire",
        maxBullets: 5,
        shotDelayFunction: () => Math.random() * (60 - 30) + 30,
        reflectedShotThreshold: 0,
        predictiveDodgeDistanceThreshold: 80,
    },
    RED: {
        x: 0,
        y: 0,
        color: 0xDC143C,
        id: 9,
        width: 18,
        height: 18,
        speed: 2,
        bulletType: "both",
        maxBullets: 5,
        shotDelayFunction: () => Math.random() * (45 - 25) + 25,
        reflectedShotThreshold: 0.5,
        predictiveDodgeDistanceThreshold: 80,
    },
};

export class Game {
    constructor() {
        this.app = new PIXI.Application({
            width: 800,
            height: 600,
            backgroundColor: 0x1a2332
        });

        this.currentLevel = 1;

        this.physicalMap = []; // All the physical walls
        this.tanks = [];
        this.allBullets = [];
        this.collisionLines = []; // For handling all collisions
        this.enableGridLines = true;
        this.rows = 30;
        this.cols = 40;
        this.cellWidth = 20;
        this.cellHeight = 20;
        this.mouseX = 0;
        this.mouseY = 0;
        this.player = new Player(700, 100, 18, 18, 2, this.app);

        this.loadedLevel = false;
        this.isLoadingLevel = false;
        this.maxRetries = 3;
        this.retryDelay = 2000;

        this.run_id = null;

        this.teamA = [];
        this.teamB = [];

        this.totalEnemies = 0;

        this.isPlayerPlayable = true;
        this.playerSelectorValue = 'player';

        this.lastFrameTime = performance.now();
        this.frameCount = 0;
        this.fps = 0
        this.fpsHistory = [];
        this.maxHistoryLength = 30;

        this.updateGameStats = null;
        this.switchToScoreSubmission = null;
        this.gameStartTime = null;

        this.container = null;
        this.hasShownPerformanceWarning = false;
    }

    setGameStatsUpdater(updateFunction) {
        this.updateGameStats = updateFunction;
    }

    setScoreSubmissionSwitcher(switcherFunction) {
        this.switchToScoreSubmission = switcherFunction
    }

    updateUI() {
        if (this.updateGameStats) {
            this.updateGameStats({
                currentLevel: this.currentLevel,
                timer: this.formatTime(this.getGameTime()),
                enemiesLeft: this.teamB.length,
                totalEnemies: this.totalEnemies,
                fps: this.fps
            });
        }
    }

    createTank(type, x, y) {
        const p = TANK_PRESETS[type];
        return new Tank(
            x, y,
            p.color, p.id, p.width, p.height, p.speed,
            p.bulletType, p.maxBullets, p.shotDelayFunction,
            p.reflectedShotThreshold, p.predictiveDodgeDistanceThreshold
        );
    }


    setup(run_id, container) {
        this.container = container
        this.run_id = run_id;

        container.appendChild(this.app.view);

        // Load level from server instead of file
        this.loadLevelFromServer().then(loadedData => {
            if (loadedData) {
                if (loadedData.game_complete) {
                    console.log('Game completed! Final level:', loadedData.final_level);

                    this.cleanup();
                    this.switchToScoreSubmission(this.run_id);
                } else {
                    // Parse the map data and initialize game
                    const parsedData = this.parseMapData(loadedData.mapData);
                    this.initGame(parsedData);
                }
            }
        }).catch(error => {
            console.error('Failed to load level from server:', error);
            // Show error and return to main menu
        });

        this.gameStartTime = Date.now();
        this.updateUI();
    }

    initGame(loadedData) {
        this.updateMap(loadedData);

        this.app.ticker.speed = 1.0;
        this.app.ticker.maxFPS = 0;
        this.app.ticker.add((delta) => this.gameLoop(delta));

        this.app.renderer.plugins.interaction.on('pointermove', (e) => {
            const newPosition = e.data.global;
            this.mouseX = newPosition.x;
            this.mouseY = newPosition.y;
        });

        this.app.renderer.view.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        this.app.renderer.plugins.interaction.on('pointerdown', (e) => {
            if (e.data.button === 0 && this.player instanceof Player) {
                const bullet = this.player.fireBullet();
                if (bullet) {
                    this.app.stage.addChild(bullet.body);
                    this.allBullets.push(bullet);
                }
            }
        });
    }

    showPerformanceWarning() {
        // Call back to React to show warning
        if (this.onPerformanceWarning) {
            this.onPerformanceWarning();
        }
    }

    setPerformanceWarningCallback(callback) {
        this.onPerformanceWarning = callback;
    }

    async loadLevelFromServer() {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        try {
            const response = await fetch(`${API_BASE_URL}/level`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ run_id: this.run_id }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type');

            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            } else {
                const mapText = await response.text();
                return { mapData: mapText };
            }
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }

    parseMapData(mapData) {
        let fileContent = mapData;
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

    // Adds gridlines, purely aesthetics
    addGridlines() {
        if (this.enableGridLines) {
            let gridLines = new PIXI.Graphics();
            gridLines.lineStyle(1, 0x2d3748, 0.8);

            for (let i = 0; i <= this.rows; i++) {
                gridLines.moveTo(0, i * this.cellHeight);
                gridLines.lineTo(this.cols * this.cellWidth, i * this.cellHeight);
            }
            for (let j = 0; j <= this.cols; j++) {
                gridLines.moveTo(j * this.cellWidth, 0);
                gridLines.lineTo(j * this.cellWidth, this.rows * this.cellHeight);
            }
            this.app.stage.addChild(gridLines);
        }
    }

    rectanglesCollide(rect1, rect2) {
        if (rect1.x < rect2.x + rect2.width &&
            rect1.x + rect1.width > rect2.x &&
            rect1.y < rect2.y + rect2.height &&
            rect1.y + rect1.height > rect2.y) {

            return true;
        }
        return false;
    }

    checkCollision(bullet) {
        for (let t = 0; t < this.tanks.length; t++) {
            this.tank = this.tanks[t];
            if (this.rectanglesCollide(bullet.body, this.tank.body)) {
                return { tank: this.tank, tankIndex: t };
            }
        }
        return null;
    }

    getColorFromDangerValue(dangerValue, maxDangerValue) {
        // Clamp this value to [0, maxDangerValue]
        dangerValue = Math.min(Math.max(dangerValue, 0), maxDangerValue);

        // Calculate the ratio of the danger value to the maximum danger value
        let ratio = dangerValue / maxDangerValue;

        // Interpolate between white (255, 255, 255) and red (255, 0, 0)
        let red = 255;
        let green = 255 * (1 - ratio);
        let blue = 255 * (1 - ratio);

        // Convert to hexadecimal color
        let color = this.rgbToHex(Math.round(red), Math.round(green), Math.round(blue));
        return color;
    }

    rgbToHex(r, g, b) {
        return "0x" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    updateGridDangerValues(bullets, player, bulletDangerFactor, playerDangerFactor, predictionSteps) {
        const gridRows = this.physicalMap.length;
        const gridCols = this.physicalMap[0].length;
        const cellSize = this.physicalMap[0][0].width; // safer than hardcoding 20

        // Reset danger
        for (let i = 0; i < gridRows; i++) {
            for (let j = 0; j < gridCols; j++) {
                this.physicalMap[i][j].dangerValue = 0;
            }
        }

        // Bullets danger
        bullets.forEach(bullet => {
            for (let step = 0; step <= predictionSteps; step++) {
                const bx = bullet.body.x + bullet.velocityX * step;
                const by = bullet.body.y + bullet.velocityY * step;

                const row = Math.floor(by / cellSize);
                const col = Math.floor(bx / cellSize);

                if (row >= 0 && row < gridRows && col >= 0 && col < gridCols) {
                    const falloff = bulletDangerFactor / (step + 1);
                    this.physicalMap[row][col].dangerValue += falloff;
                }
            }
        });

        // Player danger
        const playerRow = Math.floor(player.body.y / cellSize);
        const playerCol = Math.floor(player.body.x / cellSize);

        for (let i = 0; i < gridRows; i++) {
            for (let j = 0; j < gridCols; j++) {
                if (!this.isWallBlocking(playerRow, playerCol, i, j)) {
                    const dx = i - playerRow;
                    const dy = j - playerCol;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    const dangerValue = Math.max(0, playerDangerFactor - 0.1 * distance);
                    if (dangerValue > 0) {
                        this.physicalMap[i][j].dangerValue += dangerValue;
                    }
                }
            }
        }
    }

    isWallBlocking(startRow, startCol, endRow, endCol) {
        let dx = Math.abs(endCol - startCol);
        let dy = Math.abs(endRow - startRow);
        let sx = (startCol < endCol) ? 1 : -1;
        let sy = (startRow < endRow) ? 1 : -1;
        let err = dx - dy;

        while (true) {
            // Check if the current cell is a wall
            if (this.physicalMap[startRow][startCol].getCellType() === 'wall') {
                return true; // Wall is blocking the line of sight
            }

            if (startRow === endRow && startCol === endCol) break; // Line has reached the end point

            let e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                startCol += sx;
            }
            if (e2 < dx) {
                err += dx;
                startRow += sy;
            }
        }

        return false; // No wall is blocking the line of sight
    }

    updateGridColors(maxDangerValue) {
        for (let i = 0; i < this.physicalMap.length; i++) {
            for (let j = 0; j < this.physicalMap[i].length; j++) {
                if (!(this.physicalMap[i][j].getCellType() === 'wall')) {
                    let dangerValue = this.physicalMap[i][j].dangerValue
                    let color = this.getColorFromDangerValue(dangerValue, maxDangerValue);
                    this.physicalMap[i][j].body.tint = color;
                }
            }
        }
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
        this.tanks = [];
        let inputMap = loadedData.map;
        this.physicalMap = [];

        for (let i = 0; i < inputMap.length; i++) {
            this.physicalMap[i] = [];
            for (let j = 0; j < inputMap[i].length; j++) {
                this.physicalMap[i][j] = new Cell(j * this.cellWidth, i * this.cellHeight, this.cellWidth, this.cellHeight, 'path');
                this.app.stage.addChild(this.physicalMap[i][j].body);
            }
        }

        this.addGridlines();

        for (let i = 0; i < inputMap.length; i++) {
            for (let j = 0; j < inputMap[i].length; j++) {
                let newTank = null;
                // This is not optimal but very easy to read      
                let currentCell = this.physicalMap[i][j];

                if (inputMap[i][j] === 1) {
                    this.app.stage.removeChild(currentCell.body);
                    currentCell.setCellType('wall')
                    this.app.stage.addChild(currentCell.body);
                }

                if (inputMap[i][j] === 2) {
                    this.app.stage.removeChild(currentCell.body);
                    currentCell.setCellType('hole')
                    this.app.stage.addChild(currentCell.body);
                }

                if (inputMap[i][j] === 3) {
                    switch (this.playerSelectorValue) {
                        case 'player':
                            newTank = new Player(j * this.cellWidth, i * this.cellHeight, 18, 18, 2);
                            break;

                        case 'brown':
                            newTank = this.createTank("BROWN", j * this.cellWidth, i * this.cellHeight)
                            break;

                        case 'grey':
                            newTank = this.createTank("GRAY", j * this.cellWidth, i * this.cellHeight)
                            break;

                        case 'green':
                            newTank = this.createTank("GREEN", j * this.cellWidth, i * this.cellHeight)
                            break;

                        case 'pink':
                            newTank = this.createTank("PINK", j * this.cellWidth, i * this.cellHeight)
                            break;

                        case 'black':
                            newTank = this.createTank("BLACK", j * this.cellWidth, i * this.cellHeight)
                            break;
                    }

                    if (this.playerSelectorValue === 'player') {
                        this.isPlayerPlayable = true;
                    } else {
                        this.isPlayerPlayable = false;
                        newTank.setPathfinder(this.physicalMap);
                    }

                    this.player = newTank;
                    this.tanks.push(this.player);
                    this.app.stage.addChild(this.player.body);
                    this.teamA.push(this.player);
                }

                if (inputMap[i][j] === 4) {
                    newTank = this.createTank("BROWN", j * this.cellWidth, i * this.cellHeight)
                }

                if (inputMap[i][j] === 5) {
                    newTank = this.createTank("GRAY", j * this.cellWidth, i * this.cellHeight)
                }

                if (inputMap[i][j] === 6) {
                    newTank = this.createTank("GREEN", j * this.cellWidth, i * this.cellHeight)
                }

                if (inputMap[i][j] === 7) {
                    newTank = this.createTank("PINK", j * this.cellWidth, i * this.cellHeight)
                }

                if (inputMap[i][j] === 8) {
                    newTank = this.createTank("BLACK", j * this.cellWidth, i * this.cellHeight)
                }

                if (inputMap[i][j] === 9) {
                    newTank = this.createTank("RED", j * this.cellWidth, i * this.cellHeight)
                }

                // Only IDs greater than 3 are tanks
                if (inputMap[i][j] > 3) {
                    this.tanks.push(newTank);
                    this.app.stage.addChild(newTank.body);
                    newTank.setPathfinder(this.physicalMap);
                    this.teamB.push(newTank);
                }
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
            // this.app.stage.addChild(line);
            lineCoords.push(line)
            this.collisionLines.push(lineCoords);
        });

        this.loadedLevel = true;
        this.totalEnemies = this.teamB.length
    }

    async loadLevel(retryCount = 0) {
        // Prevent multiple simultaneous requests
        if (this.isLoadingLevel) {
            console.log('Level load already in progress, skipping...');
            return;
        }

        this.isLoadingLevel = true;
        this.loadedLevel = false;

        try {
            const loadedData = await this.loadLevelFromServer();

            if (loadedData) {
                if (loadedData.game_complete) {
                    console.log('Game completed! Final level:', loadedData.final_level);
                    this.switchToScoreSubmission(this.run_id)
                } else {
                    await this.resetGame();
                    const parsedData = this.parseMapData(loadedData.mapData);
                    this.updateMap(parsedData);
                }
            }

            this.loadedLevel = true;

        } catch (error) {
            console.error(`Failed to load level (attempt ${retryCount + 1}):`, error);

            // Retry logic
            if (retryCount < this.maxRetries) {
                console.log(`Retrying in ${this.retryDelay}ms...`);
                setTimeout(() => {
                    this.loadLevel(retryCount + 1);
                }, this.retryDelay);
                return; // Don't reset the loading flag yet
            } else {
                console.error('Max retries reached. Returning to menu.');
                // Handle failure - maybe show error message and return to menu
                this.handleLoadFailure();
            }
        } finally {
            this.isLoadingLevel = false;
        }
    }

    async resetGame() {
        this.allBullets = [];
        this.tanks = [];
        this.teamA = [];
        this.teamB = [];
        this.app.stage.removeChildren();
    }

    // Display an error message or something
    handleLoadFailure() {

    }

    isTeamADead() {
        for (let t = 0; t < this.teamA.length; t++) {
            let tank = this.teamA[t];
            if (tank.isAlive) {
                return false;
            }
        }
        return true;
    }

    // Moving average FPS calculation
    updateFPS() {
        const currentFrameTime = performance.now();
        const deltaTime = currentFrameTime - this.lastFrameTime;
        this.lastFrameTime = currentFrameTime;

        const instantFPS = 1000 / deltaTime;

        this.fpsHistory.push(instantFPS);
        if (this.fpsHistory.length > this.maxHistoryLength) {
            this.fpsHistory.shift();
        }

        const sum = this.fpsHistory.reduce((a, b) => a + b, 0);
        this.fps = Math.round(sum / this.fpsHistory.length);

        // Check if using Canvas2D fallback
        if (this.app.renderer.type === PIXI.RENDERER_TYPE.CANVAS && (this.fps < 40 && this.fpsHistory.length >= this.maxHistoryLength)) {
            if (!this.hasShownPerformanceWarning) {
                this.showPerformanceWarning();
                this.hasShownPerformanceWarning = true;
            }
        }
    }

    async sendGameEvent(id) {
        const response = await fetch(`${API_BASE_URL}/game-event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ run_id: this.run_id, tank_type: id })
        });

        const data = await response.json();

        if (data.game_complete) {
            console.log('Game completed!');
            this.cleanup();
            this.switchToScoreSubmission(this.run_id);
            return;
        }

        if (data.level_complete) {
            this.loadLevel();
            this.currentLevel += 1
            return;
        }

        return data;
    }

    getGameTime() {
        if (!this.gameStartTime) return 0;
        return Date.now() - this.gameStartTime;
    }

    formatTime(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    gameLoop(delta) {
        this.stepCount += 1;

        const cappedDelta = Math.min(delta, 2.0);

        if (this.loadedLevel) {
            this.updateFPS();

            // Update UI every 60 frames so its cheaper
            if (this.frameCount % 60 === 0) {
                this.updateUI();
            }

            // Player death
            if (this.teamA.length == 0) {
                this.loadLevel();
                return;
            }

            if (this.frameCount % 10 === 0) {
                this.updateGridDangerValues(this.allBullets, this.player, 1.0, 1.0, 25);
            }
            // this.updateGridColors(0.5);

            // Loop through Team A tanks
            for (let t = 0; t < this.teamA.length; t++) {
                // Player should always be in teamA
                let tank = this.teamA[t];
                let firedBullets = null;
                if (tank instanceof Player) {
                    // Shooting for players is handled separately
                    this.player.update(cappedDelta, this.collisionLines, this.mouseX, this.mouseY, this.physicalMap);
                } else {
                    firedBullets = tank.update(cappedDelta, this.physicalMap, this.player, this.collisionLines, this.allBullets, this.teamA, this.teamB);
                }

                if (firedBullets && firedBullets.length > 0) {
                    for (let i = 0; i < firedBullets.length; i++) {
                        this.app.stage.addChild(firedBullets[i].body);
                        this.allBullets.push(firedBullets[i])
                    }

                }
            }

            // Loop through Team B tanks
            for (let t = 0; t < this.teamB.length; t++) {
                let tank = this.teamB[t];
                let firedBullets = tank.update(cappedDelta, this.physicalMap, this.player, this.collisionLines, this.allBullets, this.teamB, this.teamA, this.app)

                if (firedBullets && firedBullets.length > 0) {
                    for (let i = 0; i < firedBullets.length; i++) {
                        this.app.stage.addChild(firedBullets[i].body);
                        this.allBullets.push(firedBullets[i])
                    }
                }
            }

            for (let i = this.allBullets.length - 1; i >= 0; i--) {
                let bullet = this.allBullets[i];
                let collided = this.checkCollision(bullet);
                if (collided) {
                    this.app.stage.removeChild(collided.tank.body);
                    this.tanks.splice(collided.tankIndex, 1);
                    collided.tank.setAlive(false)

                    // Loop through team A and B to find and remove the tank
                    for (let t = this.teamA.length - 1; t >= 0; t--) {
                        if (this.teamA[t] == collided.tank) {
                            this.teamA.splice(t, 1);
                            this.sendGameEvent(collided.tank.id);
                        }
                    }

                    for (let t = this.teamB.length - 1; t >= 0; t--) {
                        if (this.teamB[t] == collided.tank) {
                            this.teamB.splice(t, 1);
                            this.sendGameEvent(collided.tank.id);
                        }
                    }

                    this.app.stage.removeChild(bullet.body);
                    bullet.owner.firedBullets -= 1
                    this.allBullets.splice(i, 1)
                } else {
                    bullet.update(cappedDelta, this.collisionLines, this.allBullets);

                    if (bullet.toDestroy) {
                        this.app.stage.removeChild(bullet.body);
                        bullet.owner.firedBullets -= 1
                        this.allBullets.splice(i, 1)
                    }
                }
            }
        }
    }

    cleanup() {
        // TODO: Maybe implement removal of event listeners in the future, but it works as of now so maybe it's not needed
        this.app.ticker.stop();
        this.app.stage.removeChildren();
        this.container.removeChild(this.app.view);
        this.app = null;
    }
}