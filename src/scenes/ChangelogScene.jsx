import '../App.css';

const ChangelogScene = ({ switchToMenu }) => {
    const changelogEntries = [
        {
            version: "1.1.0",
            date: "November 12, 2025",
            changes: [
                "Added ability to shoot bullets by holding down the mouse",
                "Thank you for the continued support, $50 has been sent to 1st place winner",
            ]
        },
        {
            version: "1.0.0",
            date: "September 29, 2025",
            changes: [
                "Initial release of Grid Tanks",
                "15 levels, 6 tank types, leaderboard, and score submission system",
            ]
        },
    ];

    return (
        <div className="scene-container">
            <div className="grid-background"></div>

            <div className="particle"></div>
            <div className="particle"></div>
            <div className="particle"></div>

            <div className="changelog-container">
                <div className="changelog-header">
                    <h1 className="scene-title">CHANGELOG</h1>
                </div>

                <div className="changelog-content">
                    {changelogEntries.map((entry, index) => (
                        <div key={index} className="changelog-entry">
                            <div className="changelog-entry-header">
                                <span className="changelog-version">v{entry.version}</span>
                                <span className="changelog-date">{entry.date}</span>
                            </div>
                            <ul className="changelog-list">
                                {entry.changes.map((change, changeIndex) => (
                                    <li key={changeIndex} className="changelog-item">
                                        <span className="changelog-bullet">▸</span>
                                        <span className="changelog-text">{change}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                <button className="back-button" onClick={switchToMenu}>
                    <span>Back to Menu</span>
                </button>
            </div>
        </div>
    );
};

export default ChangelogScene;
