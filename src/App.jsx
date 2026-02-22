import { useState, useEffect, useRef } from 'react';
import './App.css'
import GameScene from './scenes/GameScene';
import ScoreSubmissionScene from './scenes/ScoreSubmissionScene';
import LeaderboardScene from './scenes/LeaderboardScene';
import HowToPlayScene from './scenes/HowToPlayScene';
import ChangelogScene from './scenes/ChangelogScene';

const SCENES = {
    MENU: 'menu',
    MODE_SELECT: 'modeSelect',
    COOP_ROOM_SELECT: 'coopRoomSelect',
    COOP_CREATE_ROOM: 'coopCreateRoom',
    COOP_JOIN_ROOM: 'coopJoinRoom',
    COOP_LOBBY: 'coopLobby',
    GAME: 'game',
    HOWTO: 'howto',
    LEADERBOARD: 'leaderboard',
    SCORE_SUBMISSION: 'scoreSubmission',
    CHANGELOG: 'changelog'
};

const toWebSocketBaseUrl = (httpBaseUrl) => {
    if (!httpBaseUrl) {
        return '';
    }

    try {
        const url = new URL(httpBaseUrl);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        return url.toString().replace(/\/$/, '');
    } catch {
        return '';
    }
};

const parseErrorMessage = async (response, fallbackMessage) => {
    try {
        const parsed = await response.json();
        if (typeof parsed?.detail === 'string' && parsed.detail.trim()) {
            return parsed.detail;
        }
        if (typeof parsed?.message === 'string' && parsed.message.trim()) {
            return parsed.message;
        }
    } catch {
        return fallbackMessage;
    }

    return fallbackMessage;
};

const GridTanks = () => {
    // Scene states:
    // 'menu', 'modeSelect', 'coopRoomSelect', 'coopCreateRoom', 'coopJoinRoom',
    // 'coopLobby', 'game', 'howto', 'leaderboard', 'scoreSubmission', 'changelog'
    const [currentScene, setCurrentScene] = useState(SCENES.MENU);
    const [runId, setRunId] = useState('');
    const [isMobile, setIsMobile] = useState(false);
    const [selectedMode, setSelectedMode] = useState('solo');
    const [scoreSubmissionMode, setScoreSubmissionMode] = useState('solo');
    const [leaderboardMode, setLeaderboardMode] = useState('solo');

    const [displayName, setDisplayName] = useState('');
    const [roomCodeInput, setRoomCodeInput] = useState('');
    const [roomError, setRoomError] = useState('');

    const [roomInfo, setRoomInfo] = useState(null);
    const [roomActionLoading, setRoomActionLoading] = useState(false);
    const [coopRunId, setCoopRunId] = useState('');
    const [coopStartLoading, setCoopStartLoading] = useState(false);

    const [lobbyState, setLobbyState] = useState(null);
    const [lobbyError, setLobbyError] = useState('');
    const [socketStatus, setSocketStatus] = useState('disconnected'); // disconnected, connecting, connected

    const websocketRef = useRef(null);

    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
    const WS_BASE_URL = toWebSocketBaseUrl(API_BASE_URL);

    const closeRoomSocket = () => {
        const activeSocket = websocketRef.current;
        websocketRef.current = null;

        if (activeSocket && (activeSocket.readyState === WebSocket.OPEN || activeSocket.readyState === WebSocket.CONNECTING)) {
            try {
                activeSocket.close();
            } catch {
                // Ignore close errors on teardown.
            }
        }

        setSocketStatus('disconnected');
    };

    const resetCoopFlow = () => {
        closeRoomSocket();
        setDisplayName('');
        setRoomCodeInput('');
        setRoomError('');
        setRoomInfo(null);
        setRoomActionLoading(false);
        setCoopRunId('');
        setCoopStartLoading(false);
        setLobbyState(null);
        setLobbyError('');
    };

    // Detect mobile devices
    useEffect(() => {
        const checkMobile = () => {
            const userAgent = navigator.userAgent || navigator.vendor || window.opera;
            return /android|iphone|ipad|ipod|opera mini|iemobile|mobile/i.test(userAgent.toLowerCase());
        };
        setIsMobile(checkMobile());
    }, []);

    const roomCode = roomInfo?.code ?? '';
    const roomToken = roomInfo?.token ?? '';

    useEffect(() => {
        if (currentScene !== SCENES.COOP_LOBBY || !roomCode || !roomToken) {
            return undefined;
        }

        if (!WS_BASE_URL) {
            setLobbyError('Multiplayer backend is not configured.');
            setSocketStatus('disconnected');
            return undefined;
        }

        const wsUrl = `${WS_BASE_URL}/ws/rooms/${encodeURIComponent(roomCode)}?token=${encodeURIComponent(roomToken)}`;
        const socket = new WebSocket(wsUrl);
        websocketRef.current = socket;

        setSocketStatus('connecting');
        setLobbyError('');

        socket.onopen = () => {
            if (websocketRef.current === socket) {
                setSocketStatus('connected');
            }
        };

        socket.onmessage = (event) => {
            let parsed = null;
            try {
                parsed = JSON.parse(event.data);
            } catch {
                return;
            }

            if (parsed.type === 'error') {
                setLobbyError(parsed.message || 'Room error.');
                return;
            }

            if (parsed.type === 'room_state' || parsed.type === 'game_started') {
                if (parsed.room) {
                    setLobbyState(parsed.room);
                    if (parsed.room.run_id) {
                        setCoopRunId(parsed.room.run_id);
                    }
                }

                const started = parsed.type === 'game_started' || Boolean(parsed.room?.game_started);
                if (started) {
                    const sharedRunId = parsed.room?.run_id;
                    if (!sharedRunId) {
                        setLobbyError('Missing shared run id from host. Try starting again.');
                        return;
                    }

                    setCoopRunId(sharedRunId);
                    setSelectedMode('coop');
                    setCurrentScene(SCENES.GAME);
                }
            }
        };

        socket.onerror = () => {
            if (websocketRef.current === socket) {
                setLobbyError('Room connection error.');
            }
        };

        socket.onclose = () => {
            if (websocketRef.current === socket) {
                websocketRef.current = null;
                setSocketStatus('disconnected');
            }
        };

        return () => {
            if (websocketRef.current === socket) {
                websocketRef.current = null;
            }
            if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
                socket.close();
            }
            setSocketStatus('disconnected');
        };
    }, [currentScene, roomCode, roomToken, WS_BASE_URL]);

    const sendRoomMessage = (payload) => {
        const socket = websocketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            setLobbyError('Room connection is not ready yet.');
            return false;
        }

        try {
            socket.send(JSON.stringify(payload));
            return true;
        } catch {
            setLobbyError('Failed to send room message.');
            return false;
        }
    };

    // Scene switching functions
    const switchToModeSelect = () => {
        console.log('Opening play options...');
        setCurrentScene(SCENES.MODE_SELECT);
    };

    const switchToGame = () => {
        console.log('Starting game...');
        setCurrentScene(SCENES.GAME);
    };

    const switchToSoloGame = () => {
        setSelectedMode('solo');
        switchToGame();
    };

    const switchToCoopRoomSelect = () => {
        closeRoomSocket();
        setSelectedMode('coop');
        setRoomActionLoading(false);
        setRoomInfo(null);
        setLobbyState(null);
        setCoopRunId('');
        setCoopStartLoading(false);
        setLobbyError('');
        setRoomError('');
        setCurrentScene(SCENES.COOP_ROOM_SELECT);
    };

    const switchToCreateRoom = () => {
        setRoomError('');
        setCurrentScene(SCENES.COOP_CREATE_ROOM);
    };

    const switchToJoinRoom = () => {
        setRoomError('');
        setCurrentScene(SCENES.COOP_JOIN_ROOM);
    };

    const createRoom = async () => {
        if (!API_BASE_URL) {
            setRoomError('Multiplayer backend is not configured.');
            return;
        }

        setRoomActionLoading(true);
        setRoomError('');
        setLobbyError('');

        try {
            const response = await fetch(`${API_BASE_URL}/rooms/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    display_name: displayName.trim()
                })
            });

            if (!response.ok) {
                const apiError = await parseErrorMessage(response, 'Failed to create room.');
                throw new Error(apiError);
            }

            const data = await response.json();
            setRoomInfo({
                code: data.room_code,
                role: data.role,
                playerName: data.player_name,
                token: data.player_token
            });
            setLobbyState(data.room_state ?? null);
            setCoopRunId(data.room_state?.run_id ?? '');
            setCurrentScene(SCENES.COOP_LOBBY);
        } catch (error) {
            setRoomError(error.message || 'Failed to create room.');
        } finally {
            setRoomActionLoading(false);
        }
    };

    const joinRoom = async () => {
        if (!API_BASE_URL) {
            setRoomError('Multiplayer backend is not configured.');
            return;
        }

        const sanitizedCode = roomCodeInput
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .slice(0, 6);

        if (sanitizedCode.length !== 6) {
            setRoomError('Room code must be 6 characters.');
            return;
        }

        setRoomActionLoading(true);
        setRoomError('');
        setLobbyError('');

        try {
            const response = await fetch(`${API_BASE_URL}/rooms/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    room_code: sanitizedCode,
                    display_name: displayName.trim()
                })
            });

            if (!response.ok) {
                const apiError = await parseErrorMessage(response, 'Failed to join room.');
                throw new Error(apiError);
            }

            const data = await response.json();
            setRoomCodeInput(sanitizedCode);
            setRoomInfo({
                code: data.room_code,
                role: data.role,
                playerName: data.player_name,
                token: data.player_token
            });
            setLobbyState(data.room_state ?? null);
            setCoopRunId(data.room_state?.run_id ?? '');
            setCurrentScene(SCENES.COOP_LOBBY);
        } catch (error) {
            setRoomError(error.message || 'Failed to join room.');
        } finally {
            setRoomActionLoading(false);
        }
    };

    const toggleReady = () => {
        if (!roomInfo || !lobbyState) {
            return;
        }

        const isHost = roomInfo.role === 'host';
        const localMember = isHost ? lobbyState.host : lobbyState.guest;
        const nextReady = !localMember?.ready;

        sendRoomMessage({
            type: 'set_ready',
            ready: nextReady
        });
    };

    const startCoopCampaign = async () => {
        if (!API_BASE_URL) {
            setLobbyError('Multiplayer backend is not configured.');
            return;
        }

        setCoopStartLoading(true);
        setLobbyError('');

        try {
            let activeRunId = coopRunId;

            if (!activeRunId) {
                const response = await fetch(`${API_BASE_URL}/start-game`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode: 'coop' })
                });
                if (!response.ok) {
                    const apiError = await parseErrorMessage(response, 'Failed to start co-op run.');
                    throw new Error(apiError);
                }

                const data = await response.json();
                activeRunId = data.run_id;
                setCoopRunId(activeRunId);
            }

            sendRoomMessage({
                type: 'start_game',
                run_id: activeRunId
            });
        } catch (error) {
            setLobbyError(error.message || 'Failed to start co-op run.');
        } finally {
            setCoopStartLoading(false);
        }
    };

    const switchToHowToPlay = () => {
        console.log('Opening how to play...');
        setCurrentScene(SCENES.HOWTO);
    };

    const switchToLeaderboard = (mode = 'solo') => {
        const nextMode = mode === 'coop' ? 'coop' : 'solo';
        setLeaderboardMode(nextMode);
        console.log('Opening leaderboard...');
        setCurrentScene(SCENES.LEADERBOARD);
    };

    const switchToChangelog = () => {
        console.log('Opening changelog...');
        setCurrentScene(SCENES.CHANGELOG);
    };

    const switchToMenu = () => {
        console.log('Returning to menu...');
        resetCoopFlow();
        setSelectedMode('solo');
        setScoreSubmissionMode('solo');
        setCurrentScene(SCENES.MENU);
    };

    const switchToScoreSubmission = (newRunId, mode = selectedMode) => {
        const nextMode = mode === 'coop' ? 'coop' : 'solo';
        setRunId(newRunId);
        setScoreSubmissionMode(nextMode);
        setCurrentScene(SCENES.SCORE_SUBMISSION);
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
                    <button className="menu-button" onClick={switchToModeSelect}>
                        <span className="button-icon">{'\u25B6'}</span>
                        <span>Play</span>
                    </button>
                    <button className="menu-button" onClick={switchToHowToPlay}>
                        <span className="button-icon">{'\u{1F4D6}'}</span>
                        <span>How to Play</span>
                    </button>
                    <button className="menu-button" onClick={switchToLeaderboard}>
                        <span className="button-icon">{'\u{1F3C6}'}</span>
                        <span>Leaderboard</span>
                    </button>
                </div>

                <div className="changelog-link" onClick={switchToChangelog}>
                    {'v1.2.0 \u2022 View Changelog \u2192'}
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
                    <span className="stat-number">{'\u221E'}</span>
                    Lives
                </div>
            </div>
        </div>
    );

    const PlayModeScene = () => (
        <div className="scene-container">
            <div className="grid-background"></div>

            <div className="main-container flow-main">
                <div className="logo-container flow-logo">
                    <h1 className="game-title flow-title">Choose Mode</h1>
                    <p className="subtitle flow-subtitle">Pick how you want to play the campaign.</p>
                </div>

                <div className="flow-option-grid">
                    <button className="flow-option-card" onClick={switchToSoloGame}>
                        <span className="flow-option-title">Solo</span>
                        <span className="flow-option-text">Start a single-player campaign.</span>
                    </button>
                    <button className="flow-option-card" onClick={switchToCoopRoomSelect}>
                        <span className="flow-option-title">Co-op</span>
                        <span className="flow-option-text">Play the campaign with one friend online.</span>
                    </button>
                </div>

                <button className="back-button flow-back-button" onClick={switchToMenu}>
                    Back to Menu
                </button>
            </div>
        </div>
    );

    const CoopRoomSelectScene = () => (
        <div className="scene-container">
            <div className="grid-background"></div>

            <div className="main-container flow-main">
                <div className="logo-container flow-logo">
                    <h1 className="game-title flow-title">Co-op Rooms</h1>
                    <p className="subtitle flow-subtitle">Create a room or join one with a code.</p>
                </div>

                <div className="flow-option-grid">
                    <button className="flow-option-card" onClick={switchToCreateRoom}>
                        <span className="flow-option-title">Create Room</span>
                        <span className="flow-option-text">Host a room and share your code.</span>
                    </button>
                    <button className="flow-option-card" onClick={switchToJoinRoom}>
                        <span className="flow-option-title">Join Room</span>
                        <span className="flow-option-text">Enter your friend's room code.</span>
                    </button>
                </div>

                <button className="back-button flow-back-button" onClick={() => setCurrentScene(SCENES.MODE_SELECT)}>
                    Back to Play
                </button>
            </div>
        </div>
    );

    const CreateRoomScene = () => (
        <div className="scene-container">
            <div className="grid-background"></div>

            <div className="main-container flow-main">
                <div className="logo-container flow-logo">
                    <h1 className="game-title flow-title">Create Room</h1>
                    <p className="subtitle flow-subtitle">Set your display name, then create a room.</p>
                </div>

                <div className="flow-form">
                    <label className="flow-label" htmlFor="create-room-name">Display Name</label>
                    <input
                        id="create-room-name"
                        className="flow-input"
                        type="text"
                        value={displayName}
                        maxLength={20}
                        placeholder="Host name (optional)"
                        onChange={(event) => setDisplayName(event.target.value)}
                        disabled={roomActionLoading}
                    />
                </div>

                {roomError && <p className="flow-error">{roomError}</p>}

                <div className="flow-action-row">
                    <button className="menu-button flow-action-button" onClick={createRoom} disabled={roomActionLoading}>
                        <span>{roomActionLoading ? 'Creating...' : 'Create Room'}</span>
                    </button>
                </div>

                <button className="back-button flow-back-button" onClick={switchToCoopRoomSelect} disabled={roomActionLoading}>
                    Back to Room Options
                </button>
            </div>
        </div>
    );

    const JoinRoomScene = () => (
        <div className="scene-container">
            <div className="grid-background"></div>

            <div className="main-container flow-main">
                <div className="logo-container flow-logo">
                    <h1 className="game-title flow-title">Join Room</h1>
                    <p className="subtitle flow-subtitle">Enter a room code to join your friend.</p>
                </div>

                <div className="flow-form">
                    <label className="flow-label" htmlFor="join-room-code">Room Code</label>
                    <input
                        id="join-room-code"
                        className="flow-input room-code-input"
                        type="text"
                        value={roomCodeInput}
                        maxLength={6}
                        placeholder="ABC123"
                        onChange={(event) => {
                            const sanitized = event.target.value
                                .toUpperCase()
                                .replace(/[^A-Z0-9]/g, '')
                                .slice(0, 6);
                            setRoomCodeInput(sanitized);
                            if (roomError) {
                                setRoomError('');
                            }
                        }}
                        disabled={roomActionLoading}
                    />
                </div>

                <div className="flow-form">
                    <label className="flow-label" htmlFor="join-room-name">Display Name</label>
                    <input
                        id="join-room-name"
                        className="flow-input"
                        type="text"
                        value={displayName}
                        maxLength={20}
                        placeholder="Guest name (optional)"
                        onChange={(event) => setDisplayName(event.target.value)}
                        disabled={roomActionLoading}
                    />
                </div>

                {roomError && <p className="flow-error">{roomError}</p>}

                <div className="flow-action-row">
                    <button className="menu-button flow-action-button" onClick={joinRoom} disabled={roomActionLoading}>
                        <span>{roomActionLoading ? 'Joining...' : 'Join Room'}</span>
                    </button>
                </div>

                <button className="back-button flow-back-button" onClick={switchToCoopRoomSelect} disabled={roomActionLoading}>
                    Back to Room Options
                </button>
            </div>
        </div>
    );

    const CoopLobbyScene = () => {
        const isHost = roomInfo?.role === 'host';

        const fallbackHost = {
            name: isHost ? roomInfo?.playerName || 'Host' : 'Host',
            connected: isHost ? socketStatus === 'connected' : false,
            ready: false
        };

        const fallbackGuest = {
            name: !isHost ? roomInfo?.playerName || 'Guest' : 'Guest',
            connected: !isHost ? socketStatus === 'connected' : false,
            ready: false
        };

        const roomState = lobbyState ?? {
            room_code: roomInfo?.code || '------',
            game_started: false,
            host: fallbackHost,
            guest: isHost ? null : fallbackGuest,
            both_connected: false,
            both_ready: false,
            can_start: false
        };

        const hostPlayer = roomState.host ?? fallbackHost;
        const guestPlayer = roomState.guest;

        const localPlayer = isHost ? hostPlayer : guestPlayer;
        const localReady = Boolean(localPlayer?.ready);
        const localConnected = Boolean(localPlayer?.connected);

        const canToggleReady = socketStatus === 'connected' && localConnected;
        const canHostStart = isHost && socketStatus === 'connected' && Boolean(roomState.can_start) && !coopStartLoading;

        const connectionLabel = socketStatus === 'connected'
            ? 'Connected'
            : (socketStatus === 'connecting' ? 'Connecting...' : 'Disconnected');

        return (
            <div className="scene-container">
                <div className="grid-background"></div>

                <div className="main-container flow-main">
                    <div className="logo-container flow-logo">
                        <h1 className="game-title flow-title">Co-op Lobby</h1>
                        <p className="subtitle flow-subtitle">Both players must connect and ready up before starting.</p>
                    </div>

                    <div className="lobby-card">
                        <div className="lobby-row">
                            <span className="lobby-label">Room Code</span>
                            <span className="lobby-room-code">{roomState.room_code}</span>
                        </div>
                        <div className="lobby-row">
                            <span className="lobby-label">Socket</span>
                            <span className="lobby-value">{connectionLabel}</span>
                        </div>
                        <div className="lobby-row lobby-player-grid">
                            <div className="lobby-player-item">
                                <div className="lobby-player-header">
                                    <span className="lobby-player-name">{hostPlayer.name}</span>
                                    <span className="lobby-role-tag">Host</span>
                                </div>
                                <div className="lobby-chip-row">
                                    <span className={`lobby-chip ${hostPlayer.connected ? 'online' : 'offline'}`}>
                                        {hostPlayer.connected ? 'Online' : 'Offline'}
                                    </span>
                                    <span className={`lobby-chip ${hostPlayer.ready ? 'ready' : 'waiting'}`}>
                                        {hostPlayer.ready ? 'Ready' : 'Not Ready'}
                                    </span>
                                </div>
                            </div>
                            <div className="lobby-player-item">
                                <div className="lobby-player-header">
                                    <span className="lobby-player-name">{guestPlayer?.name || 'Waiting for player...'}</span>
                                    <span className="lobby-role-tag">Guest</span>
                                </div>
                                <div className="lobby-chip-row">
                                    <span className={`lobby-chip ${guestPlayer?.connected ? 'online' : 'offline'}`}>
                                        {guestPlayer?.connected ? 'Online' : 'Offline'}
                                    </span>
                                    <span className={`lobby-chip ${guestPlayer?.ready ? 'ready' : 'waiting'}`}>
                                        {guestPlayer?.ready ? 'Ready' : 'Not Ready'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {lobbyError && <p className="flow-error">{lobbyError}</p>}

                    <div className="flow-action-row lobby-action-row">
                        <button className="menu-button flow-action-button" onClick={toggleReady} disabled={!canToggleReady}>
                            <span>{localReady ? 'Set Not Ready' : 'Ready Up'}</span>
                        </button>
                    </div>

                    {isHost ? (
                        <div className="flow-action-row lobby-action-row">
                            <button className="menu-button flow-action-button" onClick={startCoopCampaign} disabled={!canHostStart}>
                                <span>{coopStartLoading ? 'Starting...' : 'Start Co-op Campaign'}</span>
                            </button>
                        </div>
                    ) : (
                        <p className="flow-note">Host will start the match once both players are ready.</p>
                    )}

                    <button className="back-button flow-back-button" onClick={switchToCoopRoomSelect}>
                        Leave Room
                    </button>
                </div>
            </div>
        );
    };

    // Render current scene
    const renderCurrentScene = () => {
        switch (currentScene) {
            case SCENES.MENU:
                return MainMenu();
            case SCENES.MODE_SELECT:
                return PlayModeScene();
            case SCENES.COOP_ROOM_SELECT:
                return CoopRoomSelectScene();
            case SCENES.COOP_CREATE_ROOM:
                return CreateRoomScene();
            case SCENES.COOP_JOIN_ROOM:
                return JoinRoomScene();
            case SCENES.COOP_LOBBY:
                return CoopLobbyScene();
            case SCENES.GAME:
                return (
                    <GameScene
                        switchToMenu={switchToMenu}
                        switchToScoreSubmission={switchToScoreSubmission}
                        sessionMode={selectedMode}
                        coopSession={selectedMode === 'coop' ? {
                            roomCode: roomInfo?.code ?? '',
                            roomToken: roomInfo?.token ?? '',
                            role: roomInfo?.role ?? '',
                            runId: coopRunId
                        } : null}
                    />
                );
            case SCENES.HOWTO:
                return <HowToPlayScene switchToMenu={switchToMenu} />;
            case SCENES.LEADERBOARD:
                return <LeaderboardScene switchToMenu={switchToMenu} initialMode={leaderboardMode} />;
            case SCENES.CHANGELOG:
                return <ChangelogScene switchToMenu={switchToMenu} />;
            case SCENES.SCORE_SUBMISSION:
                return (
                    <ScoreSubmissionScene
                        runId={runId}
                        sessionMode={scoreSubmissionMode}
                        switchToMenu={switchToMenu}
                        switchToLeaderboard={switchToLeaderboard}
                    />
                );
            default:
                return MainMenu();
        }
    };

    // If mobile, show modal instead of game
    if (isMobile) {
        return (
            <div className="mobile-modal">
                <div className="mobile-modal-content">
                    <h2>{'\u{1F6AB} Mobile Not Supported'}</h2>
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
