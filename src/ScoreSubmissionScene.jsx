// ScoreSubmissionScene.jsx
import { useState, useEffect } from 'react';

function ScoreSubmissionScene({ runId, switchToMenu, switchToLeaderboard }) {
    const [formData, setFormData] = useState({
        username: '',
        email: ''
    });
    const [serverStats, setServerStats] = useState({
        final_level: 0,
        time: '0:00'
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

    // Fetch server-validated stats on component mount
    useEffect(() => {
        const fetchStats = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/get-final-stats`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ run_id: runId })
                });

                if (response.ok) {
                    const stats = await response.json();
                    setServerStats(stats);
                }
            } catch (error) {
                console.error('Failed to fetch final stats:', error);
            } finally {
                setIsLoading(false);
            }
        };

        if (runId) {
            fetchStats();
        }
    }, [runId]);

    const handleInputChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const response = await fetch(`${API_BASE_URL}/submit-score`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    run_id: runId,  // Send run_id, let server calculate stats
                    username: formData.username,
                    email: formData.email || null
                })
            });

            if (response.ok) {
                switchToLeaderboard();
            }
        } catch (error) {
            console.error('Error submitting score:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="scene-basic">
                <div className="form-container">
                    <div className="form-title">Loading...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="scene-basic">
            <div className="form-container">
                {/* Use server stats instead of frontend stats */}
                <div className="score-summary">
                    <div className="score-title">Your Final Score</div>
                    <div className="score-stats">
                        <div className="stat">
                            <div className="stat-value">Level {serverStats.stages_completed}</div>
                            <div className="stat-label">Stages Completed</div>
                        </div>
                        <div className="stat">
                            <div className="stat-value">{serverStats.time}</div>
                            <div className="stat-label">Time Played</div>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label" htmlFor="username">
                            Display Name
                        </label>
                        <input
                            type="text"
                            id="username"
                            name="username"
                            className="form-input"
                            placeholder="Enter your username"
                            maxLength="20"
                            value={formData.username}
                            onChange={handleInputChange}
                            required
                        />
                        <div className="character-count">{formData.username.length}/20 characters</div>
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="email">
                            Email Address <span className="optional-label">(Optional)</span>
                        </label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            className="form-input"
                            placeholder="your.email@example.com"
                            value={formData.email}
                            onChange={handleInputChange}
                        />
                        <div className="privacy-note">
                            <span className="highlight">Why we ask:</span> If you reach the top of our leaderboard, we may contact you about potential prizes or recognition. Your email will never be shown publicly or shared with third parties.
                        </div>
                    </div>

                    <div className="form-buttons">
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={switchToMenu}
                            disabled={isSubmitting}
                        >
                            Skip
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Submitting...' : 'Submit Score'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default ScoreSubmissionScene;