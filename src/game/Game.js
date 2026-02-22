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
    constructor(options = {}) {
        this.app = new PIXI.Application({
            width: 800,
            height: 600,
            backgroundColor: 0x1a2332
        });

        this.sessionMode = options.sessionMode || 'solo';
        this.coopRole = options.coopRole || 'host';
        this.isCoop = this.sessionMode === 'coop';
        this.isCoopHost = this.isCoop && this.coopRole === 'host';
        this.isCoopGuest = this.isCoop && this.coopRole === 'guest';

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
        this.player = new Player(700, 100, 18, 18, 2, { enableKeyboard: false });
        this.playerTwo = null;
        this.localPlayer = this.player;
        this.remotePlayer = null;
        this.remoteInputState = {
            keys: {},
            mouseX: 0,
            mouseY: 0,
            isMouseDown: false
        };
        this.onCoopSnapshot = null;
        this.snapshotIntervalMs = this.isCoopHost ? 16 : 33;
        this.lastSnapshotAt = 0;
        this.uiSnapshotIntervalMs = 300;
        this.lastUiSnapshotAt = 0;
        this.nextBulletNetworkId = 1;
        this.networkTankMap = new Map();
        this.networkBulletMap = new Map();
        this.latestGuestSnapshot = null;

        this.loadedLevel = false;
        this.isLoadingLevel = false;
        this.maxRetries = 3;
        this.retryDelay = 2000;
        this.retryTimeoutId = null;
        this.loadRequestId = 0;
        this.isDisposed = false;

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

    setCoopSnapshotEmitter(emitter) {
        this.onCoopSnapshot = emitter;
    }

    setRemoteInput(inputState) {
        const keys = inputState?.keys ?? {};
        this.remoteInputState = {
            keys: {
                w: Boolean(keys.w || keys.W),
                a: Boolean(keys.a || keys.A),
                s: Boolean(keys.s || keys.S),
                d: Boolean(keys.d || keys.D)
            },
            mouseX: Number(inputState?.mouseX ?? 0),
            mouseY: Number(inputState?.mouseY ?? 0),
            isMouseDown: Boolean(inputState?.isMouseDown)
        };
    }

    getLocalInputState() {
        const local = this.localPlayer ?? this.player;
        if (!(local instanceof Player)) {
            return {
                keys: {},
                mouseX: this.mouseX,
                mouseY: this.mouseY,
                isMouseDown: false
            };
        }

        return {
            keys: {
                w: Boolean(local.keyState.w || local.keyState.W),
                a: Boolean(local.keyState.a || local.keyState.A),
                s: Boolean(local.keyState.s || local.keyState.S),
                d: Boolean(local.keyState.d || local.keyState.D)
            },
            mouseX: this.mouseX,
            mouseY: this.mouseY,
            isMouseDown: Boolean(local.isMouseDown)
        };
    }

    refreshPlayerReferences() {
        const playerOne = this.networkTankMap.get('p1') || this.teamA.find((tank) => tank?.networkId === 'p1') || null;
        const playerTwo = this.networkTankMap.get('p2') || this.teamA.find((tank) => tank?.networkId === 'p2') || null;
        const fallbackPlayer = this.teamA[0] || null;

        this.player = playerOne || playerTwo || fallbackPlayer;
        this.playerTwo = playerTwo || null;

        if (!this.isCoop) {
            this.localPlayer = this.player;
            this.remotePlayer = null;
            return;
        }

        if (this.coopRole === 'guest') {
            this.localPlayer = (playerTwo && this.teamA.includes(playerTwo)) ? playerTwo : null;
            this.remotePlayer = (playerOne && this.teamA.includes(playerOne)) ? playerOne : null;
            return;
        }

        this.localPlayer = (playerOne && this.teamA.includes(playerOne)) ? playerOne : null;
        this.remotePlayer = (playerTwo && this.teamA.includes(playerTwo)) ? playerTwo : null;
    }

    buildCoopSnapshot(includeUi = false) {
        const payload = {
            level: this.currentLevel,
            tanks: this.tanks.map((tank) => ({
                networkId: tank.networkId,
                tankType: tank.id,
                x: tank.body.x,
                y: tank.body.y,
                rotation: tank.body.rotation || 0,
                turretRotation: tank.turret?.rotation || 0,
                tint: tank.body.tint
            })),
            bullets: this.allBullets.map((bullet) => ({
                networkId: bullet.networkId,
                x: bullet.body.x,
                y: bullet.body.y,
                rotation: bullet.body.rotation || 0,
                kind: bullet.networkBulletType || 'normal'
            }))
        };

        if (includeUi) {
            payload.ui = {
                currentLevel: this.currentLevel,
                timer: this.formatTime(this.getGameTime()),
                enemiesLeft: this.teamB.length,
                totalEnemies: this.totalEnemies,
                fps: this.fps || 0
            };
        }

        return payload;
    }

    emitCoopSnapshotIfNeeded() {
        if (!this.isCoopHost || !this.onCoopSnapshot) {
            return;
        }

        const now = performance.now();
        if (now - this.lastSnapshotAt < this.snapshotIntervalMs) {
            return;
        }

        this.lastSnapshotAt = now;
        const includeUi = (now - this.lastUiSnapshotAt) >= this.uiSnapshotIntervalMs;
        if (includeUi) {
            this.lastUiSnapshotAt = now;
        }

        this.onCoopSnapshot(this.buildCoopSnapshot(includeUi));
    }

    createGhostBullet(kind) {
        const bullet = {
            owner: { firedBullets: 0 },
            body: new PIXI.Container(),
            toDestroy: false,
            networkBulletType: kind || 'normal',
            networkId: '',
            velocityX: 0,
            velocityY: 0
        };

        const visual = new PIXI.Graphics();
        visual.beginFill(kind === 'fire' ? 0xff0000 : 0xff6b35);
        visual.drawCircle(0, 0, 4);
        visual.endFill();
        bullet.body.addChild(visual);

        return bullet;
    }

    applyCoopSnapshot(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') {
            return;
        }

        if (typeof snapshot.level === 'number' && snapshot.level !== this.currentLevel) {
            this.currentLevel = snapshot.level;
            if (!this.isLoadingLevel) {
                this.loadLevel();
            }
            return;
        }

        if (!this.loadedLevel) {
            return;
        }

        if (snapshot.ui && this.updateGameStats) {
            this.updateGameStats({
                currentLevel: snapshot.ui.currentLevel ?? this.currentLevel,
                timer: snapshot.ui.timer ?? this.formatTime(this.getGameTime()),
                enemiesLeft: snapshot.ui.enemiesLeft ?? this.teamB.length,
                totalEnemies: snapshot.ui.totalEnemies ?? this.totalEnemies,
                fps: snapshot.ui.fps ?? this.fps
            });
        }

        const incomingTankMap = new Map();
        for (const tankState of snapshot.tanks ?? []) {
            if (!tankState?.networkId) {
                continue;
            }
            incomingTankMap.set(tankState.networkId, tankState);
        }

        for (let i = this.tanks.length - 1; i >= 0; i--) {
            const tank = this.tanks[i];
            if (!tank.networkId) {
                continue;
            }

            const state = incomingTankMap.get(tank.networkId);
            if (!state) {
                this.app.stage.removeChild(tank.body);
                this.tanks.splice(i, 1);

                for (let j = this.teamA.length - 1; j >= 0; j--) {
                    if (this.teamA[j] === tank) {
                        this.teamA.splice(j, 1);
                    }
                }

                for (let j = this.teamB.length - 1; j >= 0; j--) {
                    if (this.teamB[j] === tank) {
                        this.teamB.splice(j, 1);
                    }
                }

                this.networkTankMap.delete(tank.networkId);
                continue;
            }

            tank.body.x = state.x;
            tank.body.y = state.y;
            tank.body.rotation = state.rotation || 0;
            if (tank.turret) {
                tank.turret.rotation = state.turretRotation || 0;
            }
            if (typeof state.tint === 'number') {
                tank.body.tint = state.tint;
                if (Number(state.tankType) === 3 && tank.turret) {
                    tank.turret.tint = state.tint;
                }
            }
        }

        for (const tankState of snapshot.tanks ?? []) {
            if (!tankState?.networkId) {
                continue;
            }

            if (this.networkTankMap.has(tankState.networkId)) {
                continue;
            }

            const createdTank = this.createTankFromSnapshotState(tankState);
            if (!createdTank) {
                continue;
            }

            this.tanks.push(createdTank);
            this.networkTankMap.set(createdTank.networkId, createdTank);
            this.app.stage.addChild(createdTank.body);

            if (Number(tankState.tankType) === 3) {
                this.teamA.push(createdTank);
            } else {
                this.teamB.push(createdTank);
            }
        }

        this.refreshPlayerReferences();

        const incomingBulletMap = new Map();
        for (const bulletState of snapshot.bullets ?? []) {
            if (!bulletState?.networkId) {
                continue;
            }
            incomingBulletMap.set(bulletState.networkId, bulletState);
        }

        for (let i = this.allBullets.length - 1; i >= 0; i--) {
            const bullet = this.allBullets[i];
            if (!bullet.networkId) {
                continue;
            }

            const state = incomingBulletMap.get(bullet.networkId);
            if (!state) {
                this.app.stage.removeChild(bullet.body);
                this.allBullets.splice(i, 1);
                this.networkBulletMap.delete(bullet.networkId);
                continue;
            }

            bullet.body.x = state.x;
            bullet.body.y = state.y;
            bullet.body.rotation = state.rotation || 0;
        }

        for (const bulletState of snapshot.bullets ?? []) {
            if (!bulletState?.networkId) {
                continue;
            }
            if (this.networkBulletMap.has(bulletState.networkId)) {
                continue;
            }

            const bullet = this.createGhostBullet(bulletState.kind || 'normal');
            bullet.networkId = bulletState.networkId;
            bullet.body.x = bulletState.x;
            bullet.body.y = bulletState.y;
            bullet.body.rotation = bulletState.rotation || 0;

            this.app.stage.addChild(bullet.body);
            this.allBullets.push(bullet);
            this.networkBulletMap.set(bullet.networkId, bullet);
        }

        this.totalEnemies = this.teamB.length;
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

    getPresetNameForTankType(tankType) {
        switch (Number(tankType)) {
            case 4:
                return "BROWN";
            case 5:
                return "GRAY";
            case 6:
                return "GREEN";
            case 7:
                return "PINK";
            case 8:
                return "BLACK";
            case 9:
                return "RED";
            default:
                return null;
        }
    }

    createTankFromSnapshotState(tankState) {
        if (!tankState || !tankState.networkId) {
            return null;
        }

        let tank = null;
        const tankType = Number(tankState.tankType);
        const isLocalSnapshotPlayer = (
            (this.coopRole === 'host' && tankState.networkId === 'p1')
            || (this.coopRole === 'guest' && tankState.networkId === 'p2')
        );

        if (tankType === 3) {
            tank = new Player(
                Number(tankState.x || 0),
                Number(tankState.y || 0),
                18,
                18,
                2,
                { enableKeyboard: isLocalSnapshotPlayer }
            );
        } else {
            const presetName = this.getPresetNameForTankType(tankType);
            if (!presetName) {
                return null;
            }
            tank = this.createTank(
                presetName,
                Number(tankState.x || 0),
                Number(tankState.y || 0)
            );
        }

        tank.networkId = tankState.networkId;
        tank.body.x = Number(tankState.x || 0);
        tank.body.y = Number(tankState.y || 0);
        tank.body.rotation = Number(tankState.rotation || 0);

        if (tank.turret) {
            tank.turret.rotation = Number(tankState.turretRotation || 0);
        }

        if (typeof tankState.tint === 'number') {
            tank.body.tint = tankState.tint;
            if (tankType === 3 && tank.turret) {
                tank.turret.tint = tankState.tint;
            }
        }

        return tank;
    }


    setup(run_id, container) {
        if (this.isDisposed || !this.app || !container) {
            return;
        }

        this.container = container
        this.run_id = run_id;
        const requestId = ++this.loadRequestId;

        container.appendChild(this.app.view);

        // Load level from server instead of file
        this.loadLevelFromServer().then(loadedData => {
            if (this.isDisposed || !this.app || requestId !== this.loadRequestId) {
                return;
            }

            if (loadedData) {
                if (loadedData.game_complete) {
                    console.log('Game completed! Final level:', loadedData.final_level);

                    this.cleanup();
                    this.switchToScoreSubmission(this.run_id, this.sessionMode);
                } else {
                    // Parse the map data and initialize game
                    const parsedData = this.parseMapData(loadedData.mapData);
                    this.initGame(parsedData);
                }
            }
        }).catch(error => {
            if (this.isDisposed || requestId !== this.loadRequestId) {
                return;
            }
            console.error('Failed to load level from server:', error);
            // Show error and return to main menu
        });

        this.gameStartTime = Date.now();
        this.updateUI();
    }

    initGame(loadedData) {
        if (this.isDisposed || !this.app) {
            return;
        }

        const mapUpdated = this.updateMap(loadedData);
        if (!mapUpdated || this.isDisposed || !this.app) {
            return;
        }

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
            const controllablePlayer = this.localPlayer;
            if (e.data.button === 0 && controllablePlayer instanceof Player) {
                controllablePlayer.setMouseDown(true);
                // Fire immediately on first click
                const bullet = controllablePlayer.fireBullet();
                if (bullet) {
                    this.addBulletToWorld(bullet);
                }
            }
        });

        this.app.renderer.plugins.interaction.on('pointerup', (e) => {
            const controllablePlayer = this.localPlayer;
            if (e.data.button === 0 && controllablePlayer instanceof Player) {
                controllablePlayer.setMouseDown(false);
            }
        });

        this.app.renderer.plugins.interaction.on('pointerupoutside', (e) => {
            const controllablePlayer = this.localPlayer;
            if (e.data.button === 0 && controllablePlayer instanceof Player) {
                controllablePlayer.setMouseDown(false);
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
        if (this.isDisposed) {
            return null;
        }

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

    addBulletToWorld(bullet) {
        if (!bullet) {
            return;
        }

        if (this.isCoopHost && !bullet.networkId) {
            bullet.networkId = `b-${this.nextBulletNetworkId++}`;
            bullet.networkBulletType = bullet.bulletSpeed > 4 ? 'fire' : 'normal';
            this.networkBulletMap.set(bullet.networkId, bullet);
        }

        this.app.stage.addChild(bullet.body);
        this.allBullets.push(bullet);
    }

    findCoopSpawnPosition(inputMap, spawnRow, spawnCol) {
        const candidateOffsets = [
            { row: -2, col: 0 },
            { row: 2, col: 0 },
            { row: 0, col: -2 },
            { row: 0, col: 2 }
        ];

        for (let i = candidateOffsets.length - 1; i > 0; i--) {
            const swapIndex = Math.floor(Math.random() * (i + 1));
            const temp = candidateOffsets[i];
            candidateOffsets[i] = candidateOffsets[swapIndex];
            candidateOffsets[swapIndex] = temp;
        }

        for (const offset of candidateOffsets) {
            const row = spawnRow + offset.row;
            const col = spawnCol + offset.col;

            if (row < 0 || row >= inputMap.length || col < 0 || col >= inputMap[0].length) {
                continue;
            }

            if (inputMap[row][col] === 0) {
                return { row, col };
            }
        }

        return { row: spawnRow, col: spawnCol };
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
        if (this.isDisposed || !this.app || !this.app.stage) {
            return false;
        }

        this.tanks = [];
        this.teamA = [];
        this.teamB = [];
        this.playerTwo = null;
        this.localPlayer = null;
        this.remotePlayer = null;
        this.networkTankMap = new Map();
        this.networkBulletMap = new Map();
        this.nextBulletNetworkId = 1;

        let inputMap = loadedData.map;
        this.physicalMap = [];
        let playerSpawn = null;
        let enemySpawnIndex = 0;

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
                    playerSpawn = { row: i, col: j };
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
                    newTank.networkId = `e-${enemySpawnIndex++}`;
                    this.tanks.push(newTank);
                    this.app.stage.addChild(newTank.body);
                    newTank.setPathfinder(this.physicalMap);
                    this.teamB.push(newTank);
                    this.networkTankMap.set(newTank.networkId, newTank);
                }
            }
        }

        if (playerSpawn) {
            const spawnX = playerSpawn.col * this.cellWidth;
            const spawnY = playerSpawn.row * this.cellHeight;

            if (this.isCoop) {
                const secondSpawn = this.findCoopSpawnPosition(inputMap, playerSpawn.row, playerSpawn.col);
                const secondX = secondSpawn.col * this.cellWidth;
                const secondY = secondSpawn.row * this.cellHeight;

                const playerOne = new Player(spawnX, spawnY, 18, 18, 2, {
                    enableKeyboard: this.coopRole === 'host'
                });
                playerOne.networkId = 'p1';
                playerOne.body.tint = 0x007ACC;
                playerOne.turret.tint = 0x007ACC;

                const playerTwo = new Player(secondX, secondY, 18, 18, 2, {
                    enableKeyboard: this.coopRole === 'guest'
                });
                playerTwo.networkId = 'p2';
                playerTwo.body.tint = 0x13A9A3;
                playerTwo.turret.tint = 0x13A9A3;

                this.player = playerOne;
                this.playerTwo = playerTwo;
                this.localPlayer = this.coopRole === 'guest' ? playerTwo : playerOne;
                this.remotePlayer = this.coopRole === 'guest' ? playerOne : playerTwo;
                this.isPlayerPlayable = true;

                this.tanks.push(playerOne);
                this.tanks.push(playerTwo);
                this.teamA.push(playerOne);
                this.teamA.push(playerTwo);
                this.app.stage.addChild(playerOne.body);
                this.app.stage.addChild(playerTwo.body);
                this.networkTankMap.set(playerOne.networkId, playerOne);
                this.networkTankMap.set(playerTwo.networkId, playerTwo);
            } else {
                let newTank = null;
                switch (this.playerSelectorValue) {
                    case 'player':
                        newTank = new Player(spawnX, spawnY, 18, 18, 2);
                        break;

                    case 'brown':
                        newTank = this.createTank("BROWN", spawnX, spawnY)
                        break;

                    case 'grey':
                        newTank = this.createTank("GRAY", spawnX, spawnY)
                        break;

                    case 'green':
                        newTank = this.createTank("GREEN", spawnX, spawnY)
                        break;

                    case 'pink':
                        newTank = this.createTank("PINK", spawnX, spawnY)
                        break;

                    case 'black':
                        newTank = this.createTank("BLACK", spawnX, spawnY)
                        break;
                }

                if (this.playerSelectorValue === 'player') {
                    this.isPlayerPlayable = true;
                } else {
                    this.isPlayerPlayable = false;
                    newTank.setPathfinder(this.physicalMap);
                }

                this.player = newTank;
                this.localPlayer = this.player;
                this.tanks.push(this.player);
                this.app.stage.addChild(this.player.body);
                this.teamA.push(this.player);
                this.player.networkId = 'p1';
                this.networkTankMap.set(this.player.networkId, this.player);
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
        this.refreshPlayerReferences();
        return true;
    }

    async loadLevel(retryCount = 0) {
        if (this.isDisposed || !this.app) {
            return;
        }

        // Prevent multiple simultaneous requests
        if (this.isLoadingLevel) {
            console.log('Level load already in progress, skipping...');
            return;
        }

        const requestId = ++this.loadRequestId;
        this.isLoadingLevel = true;
        this.loadedLevel = false;

        try {
            const loadedData = await this.loadLevelFromServer();
            if (this.isDisposed || !this.app || requestId !== this.loadRequestId) {
                return;
            }

            if (loadedData) {
                if (loadedData.game_complete) {
                    console.log('Game completed! Final level:', loadedData.final_level);
                    this.switchToScoreSubmission(this.run_id, this.sessionMode)
                } else {
                    await this.resetGame();
                    if (this.isDisposed || !this.app || requestId !== this.loadRequestId) {
                        return;
                    }
                    const parsedData = this.parseMapData(loadedData.mapData);
                    const mapUpdated = this.updateMap(parsedData);
                    if (!mapUpdated) {
                        return;
                    }
                }
            }

            this.loadedLevel = true;

        } catch (error) {
            if (this.isDisposed || requestId !== this.loadRequestId) {
                return;
            }
            console.error(`Failed to load level (attempt ${retryCount + 1}):`, error);

            // Retry logic
            if (retryCount < this.maxRetries) {
                console.log(`Retrying in ${this.retryDelay}ms...`);
                this.retryTimeoutId = setTimeout(() => {
                    this.retryTimeoutId = null;
                    this.loadLevel(retryCount + 1);
                }, this.retryDelay);
                return; // Don't reset the loading flag yet
            } else {
                console.error('Max retries reached. Returning to menu.');
                // Handle failure - maybe show error message and return to menu
                this.handleLoadFailure();
            }
        } finally {
            if (requestId === this.loadRequestId) {
                this.isLoadingLevel = false;
            }
        }
    }

    async resetGame() {
        if (this.isDisposed || !this.app || !this.app.stage) {
            return;
        }

        this.allBullets = [];
        this.tanks = [];
        this.teamA = [];
        this.teamB = [];
        this.networkTankMap = new Map();
        this.networkBulletMap = new Map();
        this.player = null;
        this.playerTwo = null;
        this.localPlayer = null;
        this.remotePlayer = null;
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
        if (this.isDisposed) {
            return null;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/game-event`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ run_id: this.run_id, tank_type: id })
            });

            const data = await response.json().catch(() => null);
            if (!response.ok) {
                console.error('Failed to send game event:', response.status, data);
                return null;
            }

            if (!data || typeof data !== 'object') {
                return null;
            }

            if (data.game_complete) {
                console.log('Game completed!');
                this.cleanup();
                this.switchToScoreSubmission(this.run_id, this.sessionMode);
                return data;
            }

            if (data.level_complete) {
                if (typeof data.next_level === 'number') {
                    this.currentLevel = data.next_level;
                } else {
                    this.currentLevel += 1;
                }
                await this.loadLevel();
                this.emitCoopSnapshotIfNeeded();
                return data;
            }

            if (data.level_reset) {
                await this.loadLevel();
                this.emitCoopSnapshotIfNeeded();
                return data;
            }

            return data;
        } catch (error) {
            console.error('Error sending game event:', error);
            return null;
        }
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
        if (this.isDisposed || !this.app || !this.app.stage) {
            return;
        }

        this.frameCount += 1;

        const cappedDelta = Math.min(delta, 2.0);

        if (!this.loadedLevel) {
            return;
        }

        // Guest clients render snapshots from host and only send local input.
        if (this.isCoopGuest) {
            return;
        }

        this.updateFPS();

        if (this.frameCount % 60 === 0) {
            this.updateUI();
        }

        if (this.teamA.length === 0) {
            this.loadLevel();
            return;
        }

        const dangerReferencePlayer = this.teamA[0] || this.player;
        if (dangerReferencePlayer && this.frameCount % 10 === 0) {
            this.updateGridDangerValues(this.allBullets, dangerReferencePlayer, 1.0, 1.0, 25);
        }

        // Loop through Team A tanks (players or allies)
        for (let t = 0; t < this.teamA.length; t++) {
            const tank = this.teamA[t];
            let firedBullets = null;

            if (tank instanceof Player) {
                let aimX = this.mouseX;
                let aimY = this.mouseY;

                if (this.isCoopHost && this.remotePlayer === tank) {
                    tank.keyState = { ...this.remoteInputState.keys };
                    tank.setMouseDown(this.remoteInputState.isMouseDown);
                    aimX = this.remoteInputState.mouseX;
                    aimY = this.remoteInputState.mouseY;
                }

                tank.update(cappedDelta, this.collisionLines, aimX, aimY, this.physicalMap);

                if (tank.isMouseDown) {
                    const bullet = tank.fireBullet();
                    if (bullet) {
                        this.addBulletToWorld(bullet);
                    }
                }
            } else {
                firedBullets = tank.update(cappedDelta, this.physicalMap, this.player, this.collisionLines, this.allBullets, this.teamA, this.teamB);
            }

            if (firedBullets && firedBullets.length > 0) {
                for (let i = 0; i < firedBullets.length; i++) {
                    this.addBulletToWorld(firedBullets[i]);
                }
            }
        }

        // Loop through Team B tanks
        for (let t = 0; t < this.teamB.length; t++) {
            const tank = this.teamB[t];
            const firedBullets = tank.update(cappedDelta, this.physicalMap, this.player, this.collisionLines, this.allBullets, this.teamB, this.teamA, this.app)

            if (firedBullets && firedBullets.length > 0) {
                for (let i = 0; i < firedBullets.length; i++) {
                    this.addBulletToWorld(firedBullets[i]);
                }
            }
        }

        for (let i = this.allBullets.length - 1; i >= 0; i--) {
            const bullet = this.allBullets[i];
            const collided = this.checkCollision(bullet);
            if (collided) {
                this.app.stage.removeChild(collided.tank.body);
                this.tanks.splice(collided.tankIndex, 1);
                collided.tank.setAlive(false)

                if (collided.tank.networkId) {
                    this.networkTankMap.delete(collided.tank.networkId);
                }

                let removedFromTeam = false;

                for (let t = this.teamA.length - 1; t >= 0; t--) {
                    if (this.teamA[t] === collided.tank) {
                        this.teamA.splice(t, 1);
                        removedFromTeam = true;
                    }
                }

                for (let t = this.teamB.length - 1; t >= 0; t--) {
                    if (this.teamB[t] === collided.tank) {
                        this.teamB.splice(t, 1);
                        removedFromTeam = true;
                    }
                }

                this.refreshPlayerReferences();

                if (removedFromTeam) {
                    const isPartialCoopPlayerDeath = (
                        this.isCoopHost
                        && this.isCoop
                        && collided.tank.id === 3
                        && this.teamA.length > 0
                    );

                    if (!isPartialCoopPlayerDeath) {
                        this.sendGameEvent(collided.tank.id);
                    }
                }

                if (this.isCoopHost && this.teamB.length === 0) {
                    this.emitCoopSnapshotIfNeeded();
                }

                this.app.stage.removeChild(bullet.body);
                bullet.owner.firedBullets -= 1
                this.allBullets.splice(i, 1)
                if (bullet.networkId) {
                    this.networkBulletMap.delete(bullet.networkId);
                }
            } else {
                if (typeof bullet.update === 'function') {
                    bullet.update(cappedDelta, this.collisionLines, this.allBullets);
                }

                if (bullet.toDestroy) {
                    this.app.stage.removeChild(bullet.body);
                    bullet.owner.firedBullets -= 1
                    this.allBullets.splice(i, 1)
                    if (bullet.networkId) {
                        this.networkBulletMap.delete(bullet.networkId);
                    }
                }
            }
        }

        this.emitCoopSnapshotIfNeeded();
    }

    cleanup() {
        if (this.isDisposed) {
            return;
        }
        this.isDisposed = true;
        this.loadedLevel = false;
        this.isLoadingLevel = false;
        this.loadRequestId += 1;

        if (this.retryTimeoutId) {
            clearTimeout(this.retryTimeoutId);
            this.retryTimeoutId = null;
        }

        if (!this.app) {
            return;
        }

        // TODO: Maybe implement removal of event listeners in the future, but it works as of now so maybe it's not needed
        this.app.ticker.stop();
        this.app.stage.removeChildren();

        if (this.container && this.app.view && this.app.view.parentNode === this.container) {
            this.container.removeChild(this.app.view);
        }

        this.app = null;
    }
}
