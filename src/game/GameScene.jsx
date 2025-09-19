import { useState, useEffect, useRef } from 'react';
import { Game } from './Game.js'; // Your existing Game class

function GameScene({ switchToMenu, switchToScoreSubmission }) {
    const gameRef = useRef(null);
    const gameInstanceRef = useRef(null);
    const hasInitialized = useRef(false);
    const hasStartedGame = useRef(false);
    const [runId, setRunId] = useState(null);
    const [gameStats, setGameStats] = useState({
        currentLevel: 1,
        timer: '0:00',
        enemiesLeft: 0,
        totalEnemies: 0
    });

    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

    const handleFinishRun = () => {
        console.log('Finishing run...');

        if (gameRef.current) {
            console.log('Cleaning up game...');
            try {
                gameRef.current.cleanup();
            } catch (error) {
                console.error('Cleanup error:', error);
            }
            gameRef.current = null;
        }
        hasInitialized.current = false;
        hasStartedGame.current = false;

        switchToScoreSubmission(runId);
    };
    const handleBackToMenu = () => {
        console.log('Going back to menu...');

        if (gameRef.current) {
            console.log('Cleaning up game...');
            try {
                gameRef.current.cleanup();
            } catch (error) {
                console.error('Cleanup error:', error);
            }
            gameRef.current = null;
        }
        hasInitialized.current = false;
        hasStartedGame.current = false;

        switchToMenu();
    };

    useEffect(() => {
        // Prevent double initialization in StrictMode
        if (hasInitialized.current) {
            return;
        }
        hasInitialized.current = true;

        // Add a small delay to ensure the DOM element exists
        const initializeGame = async () => {
            // Wait a frame to ensure gameContainer exists
            await new Promise(resolve => requestAnimationFrame(resolve));

            const gameContainer = document.getElementById('gameContainer');
            if (!gameContainer) {
                console.error('gameContainer not found!');
                return;
            }

            // Clear any existing content
            gameContainer.innerHTML = '';

            // Create your existing Game instance
            const gameInstance = new Game();
            gameInstanceRef.current = gameInstance;

            // Start game and WAIT for it to complete before setup
            if (!hasStartedGame.current) {
                hasStartedGame.current = true;
                try {
                    const response = await fetch(`${API_BASE_URL}/start-game`, { method: 'POST' });
                    const data = await response.json();
                    setRunId(data.run_id);
                    console.log(data.run_id)

                    gameInstance.setGameStatsUpdater(setGameStats);
                    gameInstance.setup(data.run_id);
                } catch (error) {
                    console.error('Failed to start game:', error);
                }
            }

            console.log('Game setup completed');

            // Store reference for cleanup
            gameRef.current = gameInstance;
        };

        initializeGame();

        // Cleanup function
        return () => {
            if (gameRef.current) {
                console.log('Cleaning up game...');
                try {
                    gameRef.current.cleanup();
                } catch (error) {
                    console.error('Cleanup error:', error);
                }
                gameRef.current = null;
            }
            hasInitialized.current = false;
            hasStartedGame.current = false;
        };
    }, []);

    return (
        <div className="scene-basic">
            <div className="game-wrapper-sidebar">
                {/* Sidebar */}
                <div className="game-sidebar">
                    <div className="sidebar-section">
                        <div className="sidebar-title">Timer</div>
                        <div className="sidebar-value">{gameStats.timer}</div>
                    </div>

                    <div className="sidebar-section">
                        <div className="sidebar-title">Level</div>
                        <div className="sidebar-value">{gameStats.currentLevel}</div>
                        <div className="sidebar-label">Current Stage</div>
                    </div>

                    <div className="sidebar-section">
                        <div className="sidebar-title">Enemies</div>
                        <div className="sidebar-value">{gameStats.enemiesLeft}/{gameStats.totalEnemies}</div>
                        <div className="sidebar-label">Remaining</div>
                    </div>

                    <div className="sidebar-section">
                        <div className="sidebar-buttons">
                            <button className="sidebar-button danger" onClick={handleFinishRun}>
                                Finish Run
                            </button>
                            <button className="sidebar-button" onClick={handleBackToMenu}>
                                Back to Menu
                            </button>
                        </div>
                    </div>
                </div>

                {/* Game Canvas */}
                <div className="game-container">
                    <div id="gameContainer" style={{ position: 'relative' }} />
                </div>
            </div>
        </div>
    );
}

export default GameScene;