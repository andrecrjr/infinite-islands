import { Game } from './Game';
import './index.css';
import { createShipCustomizationUI } from './Menu/ShipCustomization';

// Wait for DOM to be fully loaded before starting the game
document.addEventListener('DOMContentLoaded', () => {
    console.log("Document loaded, starting game...");
    
    // Create game instance with document.body as container (like original)
    const game = new Game(document.body);
    
    // The game is already initialized in the constructor, but explicitly start it
    game.start();
    
    // Create UI for ship customization
    createShipCustomizationUI(game);
    
    // Handle page unload for cleanup
    window.addEventListener('beforeunload', () => {
        game.dispose();
    });
});
