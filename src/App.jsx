import { useState } from 'react';
import './App.css'
import GameScene from './game/GameScene';
import ScoreSubmissionScene from './ScoreSubmissionScene';
import LeaderboardScene from './LeaderboardScene';

const GridTanks = () => {
    // 'menu', 'game', 'howto', 'leaderboard', 'scoreSubmission'
    const [currentScene, setCurrentScene] = useState('menu');
    const [runId, setRunId] = useState("")

    // Scene switching functions
    const switchToGame = () => {
        console.log('Starting game...');
        setCurrentScene('game');
    };

    const switchToHowToPlay = () => {
        console.log('Opening how to play...');
        setCurrentScene('howto');
    };

    const switchToLeaderboard = () => {
        console.log('Opening leaderboard...');
        setCurrentScene('leaderboard');
    };

    const switchToMenu = () => {
        console.log('Returning to menu...');
        setCurrentScene('menu');
    };

    const switchToScoreSubmission = (runId) => {
        setRunId(runId);
        setCurrentScene('scoreSubmission');
    };

    // Main Menu Component
    const MainMenu = () => (
        <div className="scene-container">
            <div className="grid-background"></div>

            <div className="particle"></div>
            <div className="particle"></div>
            <div className="particle"></div>

            <div className="tank-silhouette"></div>
            <div className="tank-silhouette"></div>
            <div className="tank-silhouette"></div>

            <div className="main-container">
                <div className="logo-container">
                    <h1 className="game-title">GRID TANKS</h1>
                    <p className="subtitle">Heavily inspired by Wii Play Tanks</p>
                </div>

                <div className="menu-buttons">
                    <button className="menu-button" onClick={switchToGame}>
                        <span className="button-icon">▶</span>
                        <span>Start Game</span>
                    </button>
                    <button className="menu-button" onClick={switchToHowToPlay}>
                        <span className="button-icon">📖</span>
                        <span>How to Play</span>
                    </button>
                    <button className="menu-button" onClick={switchToLeaderboard}>
                        <span className="button-icon">🏆</span>
                        <span>Leaderboard</span>
                    </button>
                </div>
            </div>

            <div className="stats-bar">
                <div className="stat-item">
                    <span className="stat-number">5</span>
                    Tank Types
                </div>
                <div className="stat-item">
                    <span className="stat-number">10</span>
                    Levels
                </div>
                <div className="stat-item">
                    <span className="stat-number">3</span>
                    Lives
                </div>
            </div>
        </div>
    );

    // How to Play Scene Component (placeholder)
    const HowToPlayScene = () => (
        <div className="scene-basic">
            <div className="scene-content">
                <h2 className="scene-title">How to Play</h2>
                <div className="scene-text">
                    <p>• Use WASD keys to move your tank</p>
                    <p>• Click to shoot bullets at enemy tanks</p>
                    <p>• Eliminate all enemy tanks to advance to the next level</p>
                    <p>• You have 3 lives - avoid enemy bullets!</p>
                    <p>• Each tank type has different speed and bullet patterns</p>
                </div>
                <button className="back-button" onClick={switchToMenu}>
                    Back to Menu
                </button>
            </div>
        </div>
    );

    // Render current scene
    const renderCurrentScene = () => {
        switch (currentScene) {
            case 'menu':
                return <MainMenu />;
            case 'game':
                return <GameScene switchToMenu={switchToMenu} switchToScoreSubmission={switchToScoreSubmission} />;
            case 'howto':
                return <HowToPlayScene />;
            case 'leaderboard':
                return <LeaderboardScene switchToMenu={switchToMenu}/>;
            case 'scoreSubmission':
                return <ScoreSubmissionScene
                    runId={runId}
                    switchToMenu={switchToMenu}
                    switchToLeaderboard={switchToLeaderboard}
                />;
            default:
                return <MainMenu />;
        }
    };

    return (
        <div style={{ margin: 0, padding: 0 }}>
            {renderCurrentScene()}
        </div>
    );
};

export default GridTanks;