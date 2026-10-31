import { useState, useEffect, useRef } from 'react';
import { Game } from '../game/Game';
import { soundManager } from '../game/SoundManager';
import { CoopTransport } from '../game/CoopTransport';

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

const areInputStatesEqual = (a, b) => {
    if (!a || !b) {
        return false;
    }

    return (
        Boolean(a.isMouseDown) === Boolean(b.isMouseDown)
        && Number(a.mouseX) === Number(b.mouseX)
        && Number(a.mouseY) === Number(b.mouseY)
        && Boolean(a.keys?.w) === Boolean(b.keys?.w)
        && Boolean(a.keys?.a) === Boolean(b.keys?.a)
        && Boolean(a.keys?.s) === Boolean(b.keys?.s)
        && Boolean(a.keys?.d) === Boolean(b.keys?.d)
    );
};

function GameScene({ switchToMenu, switchToScoreSubmission, sessionMode = 'solo', coopSession = null, aiAlly = null, playerSelector = 'player', rlModelUrl = null }) {
    // Admin test runs (AI teammate, or an AI type playing the run itself) are
    // watch/test only — never submit their scores to the leaderboard.
    const isAdminRun = Boolean(aiAlly || rlModelUrl || (playerSelector && playerSelector !== 'player'));
    const gameRef = useRef(null);
    const gameContainerRef = useRef(null);
    const hasInitialized = useRef(false);
    const roomSocketRef = useRef(null);
    const guestInputIntervalRef = useRef(null);
    const lastGuestInputRef = useRef(null);
    const transportRef = useRef(null);

    const [showPerformanceWarning, setShowPerformanceWarning] = useState(false);
    const [isMuted, setIsMuted] = useState(soundManager.muted);
    const [countdown, setCountdown] = useState(null);
    const [runId, setRunId] = useState(null);
    const [coopSocketStatus, setCoopSocketStatus] = useState('disconnected');
    const [coopNetwork, setCoopNetwork] = useState({ path: 'Server relay', rtt: null });
    const [gameStats, setGameStats] = useState({
        currentLevel: 1,
        timer: '0:00',
        enemiesLeft: 0,
        totalEnemies: 0,
        fps: 0
    });

    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

    const isCoopSession = Boolean(
        sessionMode.includes('coop')
        && coopSession
        && coopSession.roomCode
        && coopSession.roomToken
        && coopSession.role
        && coopSession.runId
    );
    const isEndlessSession = sessionMode.includes('endless');
    const isCoopHost = isCoopSession && coopSession.role === 'host';
    const isCoopGuest = isCoopSession && coopSession.role === 'guest';

    const cleanupRoomSocket = () => {
        transportRef.current?.close();
        transportRef.current = null;
        if (guestInputIntervalRef.current) {
            clearInterval(guestInputIntervalRef.current);
            guestInputIntervalRef.current = null;
        }
        lastGuestInputRef.current = null;

        const roomSocket = roomSocketRef.current;
        roomSocketRef.current = null;

        if (roomSocket && (roomSocket.readyState === WebSocket.OPEN || roomSocket.readyState === WebSocket.CONNECTING)) {
            try {
                roomSocket.close();
            } catch {
                // Ignore close errors on teardown.
            }
        }

        setCoopSocketStatus('disconnected');
    };

    const cleanupGame = () => {
        cleanupRoomSocket();

        if (gameRef.current) {
            try {
                gameRef.current.cleanup();
            } catch (error) {
                console.error('Cleanup error:', error);
            }
            gameRef.current = null;
        }

        hasInitialized.current = false;
    };

    const handleFinishRun = async () => {
        console.log('Finishing run...');
        const roomSocket = roomSocketRef.current;
        if (isCoopHost && roomSocket && roomSocket.readyState === WebSocket.OPEN) {
            try {
                roomSocket.send(JSON.stringify({ type: 'finish_run' }));
                await new Promise((resolve) => setTimeout(resolve, 100));
            } catch {
                // Ignore room finish-send failures during teardown.
            }
        }

        cleanupGame();
        if (isAdminRun) {
            switchToMenu();
        } else {
            switchToScoreSubmission(runId, sessionMode);
        }
    };

    const handleBackToMenu = () => {
        console.log('Going back to menu...');
        cleanupGame();
        switchToMenu();
    };

    useEffect(() => {
        if (hasInitialized.current) {
            return undefined;
        }
        hasInitialized.current = true;

        const initializeGame = async () => {
            const gameContainer = gameContainerRef.current;
            if (!gameContainer) {
                return;
            }

            const gameInstance = new Game({
                sessionMode,
                coopRole: isCoopSession ? coopSession.role : 'host',
                aiAlly: aiAlly || null,
                playerSelector
            });

            // Register on the ref immediately (not after the awaits below) so
            // an unmount during init — e.g. React StrictMode's dev double
            // mount — disposes this instance instead of orphaning it. An
            // orphaned instance appends a second canvas and runs a second
            // game loop on top of the real one.
            gameRef.current = gameInstance;

            // Admin "Watch RL Agent": hand the player to a trained ONNX policy.
            if (rlModelUrl) {
                gameInstance.attachOnnxAgent(rlModelUrl).catch((err) => {
                    console.error('Failed to load ONNX agent:', err);
                });
            }

            gameInstance.setGameStatsUpdater(setGameStats);
            gameInstance.setCountdownUpdater(setCountdown);
            // When the run ends on its own (e.g. both co-op players die in
            // endless), the host must tell the guest to leave before it
            // navigates to the score screen.
            gameInstance.setScoreSubmissionSwitcher((endedRunId, endedMode) => {
                const roomSocket = roomSocketRef.current;
                if (isCoopHost && roomSocket && roomSocket.readyState === WebSocket.OPEN) {
                    try {
                        roomSocket.send(JSON.stringify({ type: 'finish_run' }));
                    } catch {
                        // Ignore send failures during teardown.
                    }
                }
                if (isAdminRun) {
                    switchToMenu();
                } else {
                    switchToScoreSubmission(endedRunId, endedMode);
                }
            });
            gameInstance.setPerformanceWarningCallback(() => setShowPerformanceWarning(true));

            let activeRunId = null;

            if (isCoopSession) {
                activeRunId = coopSession.runId;
            } else {
                const response = await fetch(`${API_BASE_URL}/start-game`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode: sessionMode === 'endless' ? 'endless' : 'solo' })
                });
                const data = await response.json();
                activeRunId = data.run_id;
            }

            if (!activeRunId) {
                throw new Error('Missing run id while starting game session.');
            }

            // The scene may have unmounted while we awaited the run id; the
            // cleanup disposed this instance, so don't attach it to the DOM.
            if (gameInstance.isDisposed) {
                return;
            }

            gameInstance.setup(activeRunId, gameContainerRef.current);
            setRunId(activeRunId);

            if (!isCoopSession) {
                return;
            }

            const wsBaseUrl = toWebSocketBaseUrl(API_BASE_URL);
            if (!wsBaseUrl) {
                setCoopSocketStatus('error');
                return;
            }

            const roomSocket = new WebSocket(
                `${wsBaseUrl}/ws/rooms/${encodeURIComponent(coopSession.roomCode)}?token=${encodeURIComponent(coopSession.roomToken)}`
            );
            roomSocketRef.current = roomSocket;
            setCoopSocketStatus('connecting');

            const sendRelay = (message) => {
                if (roomSocketRef.current !== roomSocket || roomSocket.readyState !== WebSocket.OPEN || roomSocket.bufferedAmount > 262144) return false;
                roomSocket.send(JSON.stringify(message));
                return true;
            };
            const transport = new CoopTransport({
                Peer: import.meta.env.VITE_COOP_P2P === 'true' ? globalThis.RTCPeerConnection : null,
                role: coopSession.role,
                runId: activeRunId,
                signal: (payload) => sendRelay({ type: 'rtc_signal', run_id: activeRunId, payload }),
                relay: sendRelay,
                receive: (message) => {
                    if (isCoopHost) gameInstance.setRemoteInput(message.payload || {});
                    else gameInstance.applyCoopSnapshot(message.payload || {});
                },
                status: setCoopNetwork,
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
            });
            transportRef.current = transport;

            if (isCoopHost) {
                gameInstance.setCoopSnapshotEmitter((snapshot) => {
                    transport.send('coop_snapshot', snapshot);
                });
            }

            roomSocket.onopen = () => {
                if (roomSocketRef.current === roomSocket) {
                    setCoopSocketStatus('connected');
                    transport.start();
                }
            };

            roomSocket.onmessage = (event) => {
                let parsed = null;
                try {
                    parsed = JSON.parse(event.data);
                } catch {
                    return;
                }
                if (!parsed || typeof parsed !== 'object') return;

                if (parsed.type === 'rtc_config' && parsed.run_id === activeRunId && Array.isArray(parsed.ice_servers)) {
                    transport.iceServers = parsed.ice_servers;
                }
                if (parsed.type === 'rtc_signal' && parsed.run_id === activeRunId) {
                    transport.onSignal(parsed.payload);
                }

                if (parsed.type === 'error') {
                    setCoopSocketStatus('error');
                    return;
                }

                if (parsed.type === 'coop_input' && isCoopHost) {
                    transport.deliver(parsed);
                }

                if (parsed.type === 'coop_snapshot' && isCoopGuest) {
                    transport.deliver(parsed);
                }

                if (parsed.type === 'run_finished' && isCoopGuest) {
                    cleanupGame();
                    switchToMenu();
                }
            };

            roomSocket.onerror = () => {
                if (roomSocketRef.current === roomSocket) {
                    setCoopSocketStatus('error');
                }
            };

            roomSocket.onclose = () => {
                if (roomSocketRef.current === roomSocket) {
                    roomSocketRef.current = null;
                    setCoopSocketStatus('disconnected');
                }
            };

            if (isCoopGuest) {
                let lastSentAt = 0;
                guestInputIntervalRef.current = setInterval(() => {
                    const socket = roomSocketRef.current;
                    const game = gameRef.current;

                    if (!socket || socket.readyState !== WebSocket.OPEN || !game) {
                        return;
                    }

                    const payload = game.getLocalInputState();
                    if (areInputStatesEqual(lastGuestInputRef.current, payload) && Date.now() - lastSentAt < 250) {
                        return;
                    }
                    if (transport.send('coop_input', payload)) {
                        lastGuestInputRef.current = payload;
                        lastSentAt = Date.now();
                    }
                }, 16);
            }
        };

        initializeGame().catch((error) => {
            console.error('Failed to initialize game scene:', error);
            setCoopSocketStatus('error');
        });

        return () => {
            cleanupGame();
        };
        // The PIXI game owns its lifecycle after mount; re-running this effect
        // would create a second renderer and duplicate sockets/input handlers.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="scene-basic">
            {showPerformanceWarning && (
                <div className="performance-banner">
                    <span>Your browser is using software rendering. Enable hardware acceleration for better performance.</span>
                    <button className="performance-banner-close" onClick={() => setShowPerformanceWarning(false)}>
                        {'\u00D7'}
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
                        <div className="sidebar-title">{isEndlessSession ? 'Wave' : 'Level'}</div>
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

                    {isCoopSession && (
                        <div className="sidebar-section">
                            <div className="sidebar-title">Co-op Connection</div>
                            <div className="sidebar-value">{coopNetwork.path}</div>
                            <div>{coopNetwork.rtt === null ? coopSocketStatus : `${coopNetwork.rtt} ms RTT`}</div>
                        </div>
                    )}

                    <div className="sidebar-section">
                        <div className="sidebar-buttons">
                            <button className="sidebar-button" onClick={() => setIsMuted(soundManager.toggleMuted())}>
                                {isMuted ? '\u{1F507} Sound Off' : '\u{1F50A} Sound On'}
                            </button>
                            {!isCoopGuest && (
                                <button className="sidebar-button danger" onClick={handleFinishRun}>
                                    Finish Run
                                </button>
                            )}
                            <button className="sidebar-button" onClick={handleBackToMenu}>
                                Back to Menu
                            </button>
                        </div>
                    </div>
                </div>

                {/* Game Canvas */}
                <div className="game-stage-wrap">
                    <div ref={gameContainerRef} className="game-container" />
                    {countdown != null && (
                        <div className="countdown-overlay">
                            <div className="countdown-stage-label">
                                {isEndlessSession ? 'Wave' : 'Level'} {gameStats.currentLevel}
                            </div>
                            <div className="countdown-enemies-label">
                                {gameStats.totalEnemies} {gameStats.totalEnemies === 1 ? 'Enemy' : 'Enemies'}
                            </div>
                            <div className="countdown-number" key={countdown}>{countdown}</div>
                            <div className="countdown-getready">Get Ready</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default GameScene;
