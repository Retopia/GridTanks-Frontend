import { useState, useEffect } from 'react';
import './App.css'
import GameScene from './scenes/GameScene';
import ScoreSubmissionScene from './scenes/ScoreSubmissionScene';
import LeaderboardScene from './scenes/LeaderboardScene';
import HowToPlayScene from './scenes/HowToPlayScene';

const GridTanks = () => {
    // 'menu', 'game', 'howto', 'leaderboard', 'scoreSubmission'
    const [currentScene, setCurrentScene] = useState('menu');
    const [runId, setRunId] = useState("");
    const [isMobile, setIsMobile] = useState(false);

    // Detect mobile devices
    useEffect(() => {
        const checkMobile = () => {
            const userAgent = navigator.userAgent || navigator.vendor || window.opera;
            return /android|iphone|ipad|ipod|opera mini|iemobile|mobile/i.test(userAgent.toLowerCase());
        };
        setIsMobile(checkMobile());
    }, []);

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
                    <p className="subtitle">Made by Preston Tang</p>
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
                    <span className="stat-number">6</span>
                    Tank Types
                </div>
                <div className="stat-item">
                    <span className="stat-number">15</span>
                    Levels
                </div>
                <div className="stat-item">
                    <span className="stat-number">∞</span>
                    Lives
                </div>
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
                return <HowToPlayScene switchToMenu={switchToMenu} />;
            case 'leaderboard':
                return <LeaderboardScene switchToMenu={switchToMenu} />;
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

    // If mobile, show modal instead of game
    if (isMobile) {
        return (
            <div className="mobile-modal">
                <div className="mobile-modal-content">
                    <h2>🚫 Mobile Not Supported</h2>
                    <p>Please use a desktop device to play Grid Tanks.</p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ margin: 0, padding: 0 }}>
            {renderCurrentScene()}
        </div>
    );
};

export default GridTanks;