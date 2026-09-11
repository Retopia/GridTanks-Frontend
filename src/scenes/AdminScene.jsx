import { useState, useCallback } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const TABLE_LABELS = {
    solo: 'Solo',
    coop: 'Co-op',
    endless: 'Endless',
    coop_endless: 'Co-op Endless',
    contacts: 'Contacts'
};

const GAME_MODE_LABELS = {
    solo: 'Solo',
    coop: 'Co-op',
    endless: 'Endless',
    coop_endless: 'Co-op Endless'
};

// Display name -> Game.js TANK_PRESETS key.
const ALLY_TANKS = [
    { label: 'Brown', preset: 'BROWN' },
    { label: 'Grey', preset: 'GRAY' },
    { label: 'Green', preset: 'GREEN' },
    { label: 'Pink', preset: 'PINK' },
    { label: 'Black', preset: 'BLACK' },
    { label: 'Red', preset: 'RED' }
];

// Display name -> playerSelector value used by Game.js.
const PLAYER_AI_TANKS = [
    { label: 'Brown', value: 'brown' },
    { label: 'Grey', value: 'grey' },
    { label: 'Green', value: 'green' },
    { label: 'Pink', value: 'pink' },
    { label: 'Black', value: 'black' },
    { label: 'Red', value: 'red' }
];

const AdminScene = ({ switchToMenu, launchAiAlly, launchAiPlayer, launchRlAgent }) => {
    const [password, setPassword] = useState('');
    const [authed, setAuthed] = useState(false);
    const [loginError, setLoginError] = useState('');
    const [loggingIn, setLoggingIn] = useState(false);

    const [records, setRecords] = useState(null);
    const [recordsError, setRecordsError] = useState('');
    const [recordsLoading, setRecordsLoading] = useState(false);

    const [allyMode, setAllyMode] = useState('campaign');
    const [allyTank, setAllyTank] = useState('GREEN');
    const [aiPlayMode, setAiPlayMode] = useState('campaign');
    const [aiPlayTank, setAiPlayTank] = useState('green');
    const [rlMode, setRlMode] = useState('endless');
    const [rlFile, setRlFile] = useState(null);

    const fetchRecords = useCallback(async (pw) => {
        setRecordsLoading(true);
        setRecordsError('');
        try {
            const response = await fetch(`${API_BASE_URL}/admin/records`, {
                headers: { 'X-Admin-Password': pw }
            });
            if (!response.ok) {
                throw new Error(`Failed to load records (${response.status})`);
            }
            const data = await response.json();
            setRecords({
                ...(data.tables || {}),
                leaderboard_submissions: data.leaderboard_submissions || [],
                recent_games: data.recent_games || []
            });
        } catch (err) {
            setRecordsError(err.message || 'Failed to load records.');
        } finally {
            setRecordsLoading(false);
        }
    }, []);

    const handleLogin = async (event) => {
        event.preventDefault();
        if (!API_BASE_URL) {
            setLoginError('Backend is not configured.');
            return;
        }
        setLoggingIn(true);
        setLoginError('');
        try {
            const response = await fetch(`${API_BASE_URL}/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            if (!response.ok) {
                throw new Error('Incorrect password.');
            }
            setAuthed(true);
            fetchRecords(password);
        } catch (err) {
            setLoginError(err.message || 'Login failed.');
        } finally {
            setLoggingIn(false);
        }
    };

    const handleDelete = async (tableKey, id, label) => {
        const where = TABLE_LABELS[tableKey] || tableKey;
        if (!window.confirm(`Delete "${label}" from ${where}? This cannot be undone.`)) {
            return;
        }
        try {
            const response = await fetch(`${API_BASE_URL}/admin/records/${tableKey}/${id}`, {
                method: 'DELETE',
                headers: { 'X-Admin-Password': password }
            });
            if (!response.ok) {
                throw new Error(`Delete failed (${response.status})`);
            }
            // Optimistically drop the row from local state.
            setRecords((prev) => ({
                ...prev,
                [tableKey]: (prev[tableKey] || []).filter((row) => row.id !== id)
            }));
        } catch (err) {
            setRecordsError(err.message || 'Delete failed.');
        }
    };

    const launchRl = () => {
        if (!rlFile) return;
        // Object URL lets onnxruntime-web fetch the local file without a rebuild.
        launchRlAgent(rlMode, URL.createObjectURL(rlFile));
    };

    if (!authed) {
        return (
            <div className="scene-basic">
                <div className="form-container admin-login">
                    <div className="form-title">Admin Access</div>
                    <form onSubmit={handleLogin}>
                        <div className="form-group">
                            <label className="form-label" htmlFor="admin-pw">Password</label>
                            <input
                                id="admin-pw"
                                className="form-input"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoFocus
                            />
                        </div>
                        {loginError && <p className="flow-error">{loginError}</p>}
                        <div className="form-buttons">
                            <button type="button" className="btn btn-secondary" onClick={switchToMenu}>
                                Back
                            </button>
                            <button type="submit" className="btn btn-primary" disabled={loggingIn}>
                                {loggingIn ? 'Checking...' : 'Enter'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="scene-basic">
            <div className="admin-content">
                <h2 className="scene-title">Admin</h2>

                {/* AI teammate launcher */}
                <div className="admin-panel">
                    <h3 className="admin-panel-title">Launch with AI Teammate</h3>
                    <p className="admin-panel-note">
                        Starts a local run with an AI-controlled ally (painted the teammate color). Scores are not submitted.
                    </p>
                    <div className="admin-launch-row">
                        <div className="admin-field">
                            <label className="flow-label">Mode</label>
                            <select className="flow-input" value={allyMode} onChange={(e) => setAllyMode(e.target.value)}>
                                <option value="campaign">Campaign</option>
                                <option value="endless">Endless</option>
                            </select>
                        </div>
                        <div className="admin-field">
                            <label className="flow-label">Teammate Tank</label>
                            <select className="flow-input" value={allyTank} onChange={(e) => setAllyTank(e.target.value)}>
                                {ALLY_TANKS.map((t) => (
                                    <option key={t.preset} value={t.preset}>{t.label}</option>
                                ))}
                            </select>
                        </div>
                        <button
                            className="menu-button admin-launch-button"
                            onClick={() => launchAiAlly(allyMode, allyTank)}
                        >
                            <span>Launch</span>
                        </button>
                    </div>
                </div>

                {/* AI plays the run */}
                <div className="admin-panel">
                    <h3 className="admin-panel-title">Watch AI Play</h3>
                    <p className="admin-panel-note">
                        An enemy tank AI takes the player&apos;s place and plays a solo run on its own. Scores are not submitted.
                    </p>
                    <div className="admin-launch-row">
                        <div className="admin-field">
                            <label className="flow-label">Mode</label>
                            <select className="flow-input" value={aiPlayMode} onChange={(e) => setAiPlayMode(e.target.value)}>
                                <option value="campaign">Campaign</option>
                                <option value="endless">Endless</option>
                            </select>
                        </div>
                        <div className="admin-field">
                            <label className="flow-label">AI Tank</label>
                            <select className="flow-input" value={aiPlayTank} onChange={(e) => setAiPlayTank(e.target.value)}>
                                {PLAYER_AI_TANKS.map((t) => (
                                    <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                            </select>
                        </div>
                        <button className="menu-button admin-launch-button" onClick={() => launchAiPlayer(aiPlayMode, aiPlayTank)}>
                            <span>Launch</span>
                        </button>
                    </div>
                </div>

                {/* Trained RL policy plays the run */}
                <div className="admin-panel">
                    <h3 className="admin-panel-title">Watch RL Agent</h3>
                    <p className="admin-panel-note">
                        A trained PPO policy (exported to ONNX via <code>agent/export_onnx.py</code>) drives the player tank. Scores are not submitted.
                    </p>
                    <div className="admin-launch-row">
                        <div className="admin-field">
                            <label className="flow-label">Mode</label>
                            <select className="flow-input" value={rlMode} onChange={(e) => setRlMode(e.target.value)}>
                                <option value="campaign">Campaign</option>
                                <option value="endless">Endless</option>
                            </select>
                        </div>
                        <div className="admin-field">
                            <label className="flow-label">Model (.onnx)</label>
                            <input
                                className="flow-input"
                                type="file"
                                accept=".onnx"
                                onChange={(e) => setRlFile(e.target.files?.[0] ?? null)}
                            />
                        </div>
                        <button
                            className="menu-button admin-launch-button"
                            onClick={launchRl}
                            disabled={!rlFile}
                        >
                            <span>Launch</span>
                        </button>
                    </div>
                </div>

                {/* Records */}
                <div className="admin-panel">
                    <div className="admin-records-header">
                        <h3 className="admin-panel-title">Records</h3>
                        <button className="lobby-copy-button" onClick={() => fetchRecords(password)} disabled={recordsLoading}>
                            {recordsLoading ? 'Loading...' : 'Refresh'}
                        </button>
                    </div>

                    {recordsError && <p className="flow-error">{recordsError}</p>}

                    {records && (
                        <>
                            <div className="admin-activity-grid">
                                <div className="admin-activity-block">
                                    <div className="admin-table-title">
                                        Recent Games <span className="admin-table-count">({(records.recent_games || []).length})</span>
                                    </div>
                                    {(records.recent_games || []).length === 0 ? (
                                        <div className="admin-empty">No games recorded yet.</div>
                                    ) : (
                                        <div className="admin-activity-list">
                                            {records.recent_games.map((game) => (
                                                <div key={game.id} className="admin-activity-row">
                                                    <span className="admin-activity-mode">
                                                        {GAME_MODE_LABELS[game.mode] || game.mode}
                                                    </span>
                                                    <span className="admin-activity-detail">
                                                        {game.status}
                                                    </span>
                                                    <span className="admin-row-date">{game.date}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="admin-table-block">
                                <div className="admin-table-title">
                                    Leaderboard Submissions <span className="admin-table-count">({(records.leaderboard_submissions || []).length})</span>
                                </div>
                                <div className="admin-panel-note">Newest first across all game modes.</div>
                                {(records.leaderboard_submissions || []).length === 0 ? (
                                    <div className="admin-empty">No submissions.</div>
                                ) : (
                                    <div className="admin-rows admin-submission-rows">
                                        {records.leaderboard_submissions.map((row) => (
                                            <div key={`${row.table_key}:${row.id}`} className="admin-row">
                                                <span className="admin-row-name">{row.username}</span>
                                                <span className="admin-row-detail">
                                                    {(GAME_MODE_LABELS[row.mode] || row.mode)} · {row.completed_levels} {row.mode.includes('endless') ? 'waves' : 'lvls'} · {row.time} · {row.deaths} deaths
                                                </span>
                                                <span className="admin-row-date">{row.date}</span>
                                                <button
                                                    className="admin-delete-button"
                                                    onClick={() => handleDelete(row.table_key, row.id, row.username)}
                                                    title="Delete"
                                                >
                                                    {'✕'}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="admin-table-block">
                                <div className="admin-table-title">
                                    Contacts <span className="admin-table-count">({(records.contacts || []).length})</span>
                                </div>
                                {(records.contacts || []).length === 0 ? (
                                    <div className="admin-empty">No entries.</div>
                                ) : (
                                    <div className="admin-rows">
                                        {records.contacts.map((row) => (
                                            <div key={row.id} className="admin-row">
                                                <span className="admin-row-name">{row.username}</span>
                                                <span className="admin-row-detail">{row.email}</span>
                                                <span className="admin-row-date">{row.date}</span>
                                                <button
                                                    className="admin-delete-button"
                                                    onClick={() => handleDelete('contacts', row.id, row.username)}
                                                    title="Delete"
                                                >
                                                    {'✕'}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <button className="back-button" onClick={switchToMenu}>
                    Back to Menu
                </button>
            </div>
        </div>
    );
};

export default AdminScene;
