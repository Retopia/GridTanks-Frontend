import { Player } from "./Player.js"
import { Cell } from "./Cell.js"
import { BrownTank } from "./enemies/BrownTank.js"
import { GreyTank } from "./enemies/GrayTank.js";
import { GreenTank } from "./enemies/GreenTank.js";
import { PinkTank } from "./enemies/PinkTank.js";
import { BlackTank } from "./enemies/BlackTank.js";

export class Game {
  constructor() {
    this.app = new PIXI.Application({
      width: 800,
      height: 600,
      backgroundColor: 0xffffff
    });

    this.file = "/Maps/level0.txt"; // Start from level 1
    this.currentLevel = 0; // Add a property to track the current level

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

    this.stepCount = 0;

    this.teamA = [];
    this.teamB = [];

    this.isPlayerPlayable = true;
    this.playerSelectorValue = 'black';

    // Add a property to track the last frame time
    this.lastFrameTime = performance.now(); // Start with the current time
    this.frameCount = 0;
    this.totalElapsedTime = 0;
  }

  setup() {
    document.getElementById('gameContainer').appendChild(this.app.view);

    if (this.file != null) {
      this.loadMapFromPath(this.file).then(loadedData => {
        if (loadedData) {
          this.initGame(loadedData);
        }
      });
    }
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

  addGridlines() {
    // Adds gridlines, purely aesthetics
    if (this.enableGridLines) {
      let gridLines = new PIXI.Graphics();
      gridLines.lineStyle(1, 0xcccccc, 1);
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
    let gridRows = this.physicalMap.length;
    let gridCols = this.physicalMap[0].length;

    // Reset grid values
    for (let i = 0; i < gridRows; i++) {
      for (let j = 0; j < gridCols; j++) {
        this.physicalMap[i][j].dangerValue = 0
        // if (this.physicalMap[i][j].getCellType() === 'wall') {
        //     this.physicalMap[i][j].body.tint = 0xFFFFFF;
        // }
      }
    }

    // Update danger values based on bullets and their predicted paths
    bullets.forEach(bullet => {
      for (let step = 0; step <= predictionSteps; step++) {
        let predictedBulletRow = Math.floor((bullet.body.y + bullet.velocityY * step) / 20);
        let predictedBulletCol = Math.floor((bullet.body.x + bullet.velocityX * step) / 20);

        if (predictedBulletRow >= 0 && predictedBulletRow < gridRows && predictedBulletCol >= 0 && predictedBulletCol < gridCols) {
          this.physicalMap[predictedBulletRow][predictedBulletCol].dangerValue += bulletDangerFactor / (step + 1); // Reduce danger value with distance
        }
      }
    });

    // Update danger values based on player proximity
    let playerRow = Math.floor(player.body.y / 20);
    let playerCol = Math.floor(player.body.x / 20);

    for (let i = 0; i < gridRows; i++) {
      for (let j = 0; j < gridCols; j++) {
        if (!this.isWallBlocking(playerRow, playerCol, i, j)) {
          let distance = Math.max(Math.abs(i - playerRow), Math.abs(j - playerCol));
          let dangerValue = playerDangerFactor - 0.1 * distance;
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

  async loadMapFromPath(filePath) {
    try {
      const response = await fetch(filePath);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      let fileContent = await response.text();
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
    } catch (error) {
      console.error("Error loading file: ", error);
      return null;
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
              newTank = new BrownTank(j * this.cellWidth, i * this.cellHeight, 18, 18);
              break;

            case 'grey':
              newTank = new GreyTank(j * this.cellWidth, i * this.cellHeight, 18, 18, 1.4);
              break;

            case 'green':
              newTank = new GreenTank(j * this.cellWidth, i * this.cellHeight, 18, 18, 1.75);
              break;

            case 'pink':
              newTank = new PinkTank(j * this.cellWidth, i * this.cellHeight, 18, 18, 2);
              break;

            case 'black':
              newTank = new BlackTank(j * this.cellWidth, i * this.cellHeight, 18, 18, 2.25);
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
          newTank = new BrownTank(j * this.cellWidth, i * this.cellHeight, 18, 18);
          this.tanks.push(newTank);
          this.app.stage.addChild(newTank.body);
          this.teamB.push(newTank);
          // Brown tank is stationary, needs no pathfinder
        }

        if (inputMap[i][j] === 5) {
          newTank = new GreyTank(j * this.cellWidth, i * this.cellHeight, 18, 18, 1.4);
          this.tanks.push(newTank);
          this.app.stage.addChild(newTank.body);
          newTank.setPathfinder(this.physicalMap);
          this.teamB.push(newTank);
        }

        if (inputMap[i][j] === 6) {
          newTank = new GreenTank(j * this.cellWidth, i * this.cellHeight, 18, 18, 1.75);
          this.tanks.push(newTank);
          this.app.stage.addChild(newTank.body);
          newTank.setPathfinder(this.physicalMap);
          this.teamB.push(newTank);
        }

        if (inputMap[i][j] === 7) {
          newTank = new PinkTank(j * this.cellWidth, i * this.cellHeight, 18, 18, 2);
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
  }

  async advanceToNextLevel() {
    this.loadedLevel = false;
    this.currentLevel += 1;
    let nextLevelFile = `./Maps/level${this.currentLevel}.txt`;

    try {
      const loadedData = await this.loadMapFromPath(nextLevelFile);
      if (loadedData) {
        this.resetGame();
        this.updateMap(loadedData);
        this.loadedLevel = true;
      } else {
        // No more levels available
        console.log("No more levels available! Game completed.");
        // Optionally, add a function here to handle game completion
      }
    } catch (error) {
      console.error("Error loading the next level:", error);
    }
  }

  async reloadCurrentLevel() {
    this.loadedLevel = false;
    let currentLevelFile = `./Maps/level${this.currentLevel}.txt`;
    try {
      const loadedData = await this.loadMapFromPath(currentLevelFile);
      if (loadedData) {
        const finishedResetting = await this.resetGame();
        this.updateMap(loadedData);
        if (finishedResetting) {
          this.loadedLevel = true;
        }
      } else {
        console.error("Error reloading the current level.");
      }
    } catch (error) {
      console.error("Error reloading the current level:", error);
    }
  }

  async resetGame() {
    this.allBullets = [];
    this.tanks = [];
    this.teamA = [];
    this.teamB = [];
    this.app.stage.removeChildren();
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

  updateFPS() {
    const currentFrameTime = performance.now();
    const elapsedTime = currentFrameTime - this.lastFrameTime;
    this.lastFrameTime = currentFrameTime;

    this.frameCount += 1;
    this.totalElapsedTime += elapsedTime;

    // Calculate FPS once per second
    if (this.totalElapsedTime >= 1000) {
      const fps = this.frameCount;
      this.frameCount = 0;
      this.totalElapsedTime = 0;

      const fpsLabel = document.getElementById('fpsLabel');
      if (fpsLabel) {
        fpsLabel.innerText = `FPS: ${fps}`;
      }
    }
  }

  gameLoop(delta) {
    this.stepCount += 1;

    if (this.loadedLevel) {
      this.updateFPS();

      // Level system
      if (this.teamA.length == 0) {
        this.reloadCurrentLevel();
        return;
      }

      if (this.tanks.length === 1 && this.tanks[0] === this.player) {
        this.advanceToNextLevel();
        return;
      }

      this.updateGridDangerValues(this.allBullets, this.player, 1.0, 1.0, 25);
      // this.updateGridColors(0.5);

      // Loop through Team A tanks
      for (let t = 0; t < this.teamA.length; t++) {
        // Player should always be in teamA
        let tank = this.teamA[t];
        let firedBullets = null;
        if (tank instanceof Player) {
          // Shooting for players is handled separately
          this.player.update(delta, this.collisionLines, this.mouseX, this.mouseY, this.physicalMap);
        } else {
          firedBullets = tank.update(delta, this.physicalMap, this.player, this.collisionLines, this.allBullets, this.teamA, this.teamB);
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
        let firedBullets = tank.update(delta, this.physicalMap, this.player, this.collisionLines, this.allBullets, this.teamB, this.teamA, this.app)

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
            }
          }

          for (let t = this.teamB.length - 1; t >= 0; t--) {
            if (this.teamB[t] == collided.tank) {
              this.teamB.splice(t, 1);
            }
          }

          this.app.stage.removeChild(bullet.body);
          bullet.owner.firedBullets -= 1
          this.allBullets.splice(i, 1)
        } else {
          bullet.update(delta, this.collisionLines, this.allBullets);

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
    document.getElementById('gameContainer').removeChild(this.app.view);
    this.app = null;
  }
}