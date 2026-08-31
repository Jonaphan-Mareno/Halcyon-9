import * as THREE from 'three';
import { Game } from './Game.js';
import './style.css';

// Entry point for Halcyon-9
const game = new Game();

const startBtn = document.getElementById('start-btn');
const welcomeScreen = document.getElementById('welcome-screen');
const welcomeContent = document.getElementById('welcome-content');

if (startBtn && welcomeScreen && welcomeContent) {
  // Preload the background image to prevent Flash of Unstyled Content (FOUC)
  const bgImg = new Image();
  bgImg.src = '/public/assets/textures/bunker_bg.jpg';
  
  bgImg.onload = () => {
    // Once the large image is loaded, fade in the text content
    welcomeContent.style.opacity = '1';
  };

  startBtn.addEventListener('click', () => {
    // Fade out welcome screen
    welcomeScreen.style.opacity = '0';
    
    // We MUST initialize and request pointer lock synchronously!
    // Browsers block pointer lock if it's called inside a setTimeout
    game.init();
    game.lockControls();
    
    // After fade transition, hide the UI overlay entirely
    setTimeout(() => {
      welcomeScreen.style.display = 'none';
    }, 1500); // 1.5s matches CSS transition
  });
} else {
  // Fallback if UI is missing
  game.init();
}
