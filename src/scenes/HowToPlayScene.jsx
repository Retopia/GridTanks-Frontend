const HowToPlayScene = ({ switchToMenu }) => (
    <div className="scene-basic">
        <div className="how-to-play-content">
            <h2 className="scene-title">How to Play</h2>

            <div className="how-to-play-grid">
                <div className="how-to-play-card">
                    <div className="card-icon">🎮</div>
                    <h3>Controls</h3>
                    <p>WASD to move</p>
                    <p>Click to shoot</p>
                </div>

                <div className="how-to-play-card">
                    <div className="card-icon">🎯</div>
                    <h3>Goal</h3>
                    <p>Eliminate all enemy tanks</p>
                    <p>Complete 10 levels</p>
                </div>

                <div className="how-to-play-card">
                    <div className="card-icon">💥</div>
                    <h3>Bullets</h3>
                    <p>🟠 Orange bounce off walls</p>
                    <p>🔴 Red are fast & direct</p>
                </div>

                <div className="how-to-play-card">
                    <div className="card-icon">♾️</div>
                    <h3>Lives</h3>
                    <p>Unlimited lives</p>
                    <p>Getting hit resets level</p>
                </div>
            </div>

            <div className="pro-tip">
                <strong>💡 Pro Tip:</strong> You can end your run anytime to submit your score!
            </div>

            <button className="back-button" onClick={switchToMenu}>
                Back to Menu
            </button>
        </div>
    </div>
);

export default HowToPlayScene;