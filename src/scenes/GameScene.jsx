import { useState, useEffect, useRef } from 'react';
import { Game } from '../game/Game';

function GameScene({ switchToMenu, switchToScoreSubmission }) {
    const gameRef = useRef(null);
    const gameContainerRef = useRef(null);
    const hasInitialized = useRef(false);
    const [showPerformanceWarning, setShowPerformanceWarning] = useState(false);
    const [runId, setRunId] = useState(null);
    const [gameStats, setGameStats] = useState({
        currentLevel: 1,
        timer: '0:00',
        enemiesLeft: 0,
        totalEnemies: 0,
        fps: 0
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

        switchToMenu();
    };

    useEffect(() => {
        if (hasInitialized.current) return;
        hasInitialized.current = true;

        const initializeGame = async () => {
            const gameContainer = gameContainerRef.current;
            if (!gameContainer) return;

            const gameInstance = new Game();
            const response = await fetch(`${API_BASE_URL}/start-game`, { method: 'POST' });
            const data = await response.json();

            gameInstance.setGameStatsUpdater(setGameStats);
            gameInstance.setScoreSubmissionSwitcher(switchToScoreSubmission);
            gameInstance.setPerformanceWarningCallback(() => setShowPerformanceWarning(true));
            gameInstance.setup(data.run_id, gameContainerRef.current);

            setRunId(data.run_id);
            gameRef.current = gameInstance;
        };

        initializeGame();
    }, []);

    return (
        <div className="scene-basic">
            {showPerformanceWarning && (
                <div className="performance-banner">
                    <span>Your browser is using software rendering. Enable hardware acceleration for better performance.</span>
                    <button className="performance-banner-close" onClick={() => setShowPerformanceWarning(false)}>
                        ×
                    </button>
                </div>
            )}

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
                    </div>

                    <div className="sidebar-section">
                        <div className="sidebar-title">Enemies</div>
                        <div className="sidebar-value">{gameStats.enemiesLeft} of {gameStats.totalEnemies}</div>
                    </div>

                    <div className="sidebar-section">
                        <div className="sidebar-title">FPS</div>
                        <div className="sidebar-value">{gameStats.fps}</div>
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
                <div ref={gameContainerRef} className="game-container" />
            </div>
        </div>
    );
}

export default GameScene;