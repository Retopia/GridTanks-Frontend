import { useEffect, useRef } from 'react';
import { Game } from './Game.js'; // Your existing Game class

function GameScene() {
  const gameRef = useRef(null);
  const gameInstanceRef = useRef(null);
  const hasInitialized = useRef(false); // Prevent double initialization

  useEffect(() => {
    // Prevent double initialization in React StrictMode
    if (hasInitialized.current) {
      return;
    }
    hasInitialized.current = true;

    // Add a small delay to ensure the DOM element exists
    const initializeGame = async () => {
      // Wait a frame to ensure gameContainer exists
      await new Promise(resolve => requestAnimationFrame(resolve));

      // Check if gameContainer exists
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

      // Call your existing setup method
      try {
        gameInstance.setup();
        console.log('Game setup completed');
      } catch (error) {
        console.error('Game setup failed:', error);
      }

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
    };
  }, []); // Empty dependency array

  return (
    <div className="scene-basic">
      <div className="game-container">
        <div id="gameContainer" style={{ position: 'relative' }} />
      </div>
    </div>
  );
}

export default GameScene;