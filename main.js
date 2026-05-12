import './style.css';
import { initializeApp, getAnalytics, logEvent } from "./analytics_wrapper.js";

let analytics;
if (import.meta.env && import.meta.env.VITE_FIREBASE_API_KEY) {
  try {
    const firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
      measurementId: "G-BJLK9339LN",
    };
    const app = initializeApp(firebaseConfig);
    analytics = getAnalytics(app);
  } catch (e) {
    console.warn("Analytics error:", e);
  }
}

let publisherDomain = 'unknown';
if (document.referrer) {
    try {
        publisherDomain = new URL(document.referrer).hostname;
    } catch(e) {}
}

const params = new URLSearchParams(window.location.search);
if (params.get('autoplay') === 'split') {
    const asmrFile = params.get('asmr');
    if (asmrFile) {
        const vid = document.createElement('video');
        vid.src = `/asmr/${asmrFile}`;
        vid.autoplay = true;
        vid.loop = true;
        vid.muted = true;
        vid.style.position = 'absolute';
        vid.style.bottom = '0';
        vid.style.left = '0';
        vid.style.width = '100%';
        vid.style.height = '50%';
        vid.style.objectFit = 'cover';
        document.body.appendChild(vid);
    }
    
    const banner = document.createElement('div');
    banner.innerText = "Nomisekili from Oops-games";
    banner.style.position = 'absolute';
    banner.style.top = '50%';
    banner.style.left = '50%';
    banner.style.transform = 'translate(-50%, -50%)';
    banner.style.background = 'rgba(0, 0, 0, 0.85)';
    banner.style.color = '#fde047';
    banner.style.padding = '12px 24px';
    banner.style.borderRadius = '12px';
    banner.style.border = '2px solid #b45309';
    banner.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    banner.style.fontWeight = '800';
    banner.style.fontSize = '28px';
    banner.style.zIndex = '1000';
    banner.style.whiteSpace = 'nowrap';
    banner.style.boxShadow = '0 4px 15px rgba(0,0,0,0.5)';
    banner.style.textShadow = '1px 1px 2px rgba(0,0,0,0.8)';
    document.body.appendChild(banner);
}
// Fixed Resolution Scaling Logic
function resizeCanvas() {
  const container = document.getElementById('game-container');
  const LOGICAL_WIDTH = 450;
  const LOGICAL_HEIGHT = 800; 

  let effectiveHeight = window.innerHeight;
  if (params.get('autoplay') === 'split') {
      effectiveHeight = window.innerHeight / 2;
  }
  const scaleWidth = window.innerWidth / LOGICAL_WIDTH;
  const scaleHeight = effectiveHeight / LOGICAL_HEIGHT;
  const scale = Math.min(scaleWidth, scaleHeight);

  container.style.transform = `scale(${scale})`;
  container.style.transformOrigin = 'center center';
  
  if (params.get('autoplay') === 'split') {
      container.style.position = 'absolute';
      container.style.top = '25%';
      container.style.left = '50%';
      container.style.marginLeft = `-${LOGICAL_WIDTH / 2}px`;
      container.style.marginTop = `-${LOGICAL_HEIGHT / 2}px`;
  }
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Audio Engine (Web Audio API)
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playNote(freq) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  
  osc.type = 'triangle'; // Pleasant synthetic tone
  osc.frequency.value = freq;
  
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  
  osc.start();
  // Attack and release
  gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.05);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
  osc.stop(audioCtx.currentTime + 0.5);
}

// 7-note Major Scale (C Major base)
// Rows are notes (Row 0 = highest, Row 6 = lowest)
// Cols are Octaves (Col 0 = Octave 3, Col 1 = Octave 4, Col 2 = Octave 5)
const baseFrequencies = [
  [246.94, 493.88, 987.77], // B
  [220.00, 440.00, 880.00], // A
  [196.00, 392.00, 783.99], // G
  [174.61, 349.23, 698.46], // F
  [164.81, 329.63, 659.25], // E
  [146.83, 293.66, 587.33], // D
  [130.81, 261.63, 523.25]  // C
];

// Game State
let isPlaying = false;
let isPaused = false;
let score = 0;
let startTime = 0;
let lastPauseTime = 0;
let accumulatedPauseTime = 0; // Total time spent paused in ms
let activeFlower = null;
let currentTimeout = null;
let currentInterval = 3000; // Start with 3 second gap (Half speed for testing)
const MIN_INTERVAL = 500; // Fastest possible gap
let pausesEarned = 0;
let nextPauseThreshold = 20; // Earn pause at 20s, 40s, etc.
let flowerEls = [];

// Pattern Logic
let sequenceQueue = [];

// DOM Elements
const gridEl = document.getElementById('flower-grid');
const scoreEl = document.getElementById('score-val');
const timeEl = document.getElementById('time-val');
const pauseBtn = document.getElementById('pause-btn'); // Now acts as Breather
const messageEl = document.getElementById('message');
const gameOverOverlay = document.getElementById('game-over');
const startOverlay = document.getElementById('start-overlay');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const container = document.getElementById('game-container');

const tutorialBtn = document.getElementById('tutorial-btn');
const tutorialModal = document.getElementById('tutorial-modal');
const closeTutorialBtn = document.getElementById('btn-close-tutorial');

tutorialBtn.addEventListener('click', () => {
  tutorialModal.classList.remove('hidden');
});
closeTutorialBtn.addEventListener('click', () => {
  tutorialModal.classList.add('hidden');
});

// Init Grid
function createGrid() {
  gridEl.innerHTML = '';
  flowerEls = [];
  for (let r = 0; r < 7; r++) {
    let rowEls = [];
    for (let c = 0; c < 3; c++) {
      const f = document.createElement('div');
      f.className = 'flower';
      // Use pointerdown for responsive mobile interactions
      f.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        handleFlowerClick(r, c);
      });
      gridEl.appendChild(f);
      rowEls.push(f);
    }
    flowerEls.push(rowEls);
  }
}

function handleFlowerClick(r, c) {
  if (!isPlaying || isPaused) return;
  
  if (activeFlower && activeFlower.r === r && activeFlower.c === c) {
    // Success
    score++;
    scoreEl.innerText = score;
    flowerEls[r][c].classList.remove('lit');
    clearTimeout(currentTimeout);
    activeFlower = null;
    
    // Play note manually for feedback
    playNote(baseFrequencies[r][c]);
    
    // Decrease interval slightly, aim for ~60s survival (so it should get hard around 50-60s)
    // Reduce interval by ~2.5% each click
    currentInterval = Math.max(MIN_INTERVAL, currentInterval * 0.975);
    
    // Trigger next immediately
    nextTurn();
  }
}

function getDailyCypher(gameIndex) {
  const seed = Math.floor(new Date().getTime() / 86400000);
  const x = Math.sin(seed + gameIndex) * 10000;
  return "Cypher: " + Math.floor((x - Math.floor(x)) * 10000).toString().padStart(4, '0');
}

function gameOver() {
  isPlaying = false;
  clearTimeout(currentTimeout);
  if (activeFlower) {
    flowerEls[activeFlower.r][activeFlower.c].classList.remove('lit');
  }
  const now = Date.now();
  const survived = Math.floor((now - startTime - accumulatedPauseTime) / 1000);
  document.getElementById('final-time').innerText = survived;
  const embedFinalTime = document.getElementById('embed-final-time');
  if (embedFinalTime) embedFinalTime.innerText = survived;
  
  document.getElementById('vic-cypher').innerText = getDailyCypher(3);
  gameOverOverlay.classList.remove('hidden');
  
  if (analytics) {
      let eventParams = { time_survived: survived, score: score };
      if (params.get('mode') === 'embed') eventParams.publisher_domain = publisherDomain;
      logEvent(analytics, 'level_complete', eventParams);
  }
  
  window._VIDEO_RECORDING_DONE = true;
}

function generatePattern() {
  const patternType = Math.floor(Math.random() * 3);
  let seq = [];
  
  if (patternType === 0) {
    // Triad Chord Arpeggio (Root, 3rd, 5th) going up (Row 6, 4, 2)
    const col = Math.floor(Math.random() * 3);
    seq = [{r: 6, c: col}, {r: 4, c: col}, {r: 2, c: col}];
  } else if (patternType === 1) {
    // Octave jump (same note, left to right)
    const row = Math.floor(Math.random() * 7);
    seq = [{r: row, c: 0}, {r: row, c: 1}, {r: row, c: 2}];
  } else {
    // Scale run (3 consecutive notes going up)
    const col = Math.floor(Math.random() * 3);
    const startRow = Math.floor(Math.random() * 5) + 2; // e.g. from row 6 to 4, going up means decreasing row index
    seq = [{r: startRow, c: col}, {r: startRow-1, c: col}, {r: startRow-2, c: col}];
  }
  return seq;
}

function nextTurn() {
  if (!isPlaying || isPaused) return;

  if (activeFlower) {
    // Player missed the previous one!
    gameOver();
    return;
  }

  // Determine next flower
  if (sequenceQueue.length === 0) {
    // 50/50 logic for random vs pattern
    if (Math.random() > 0.5) {
      sequenceQueue = generatePattern();
    } else {
      sequenceQueue.push({
        r: Math.floor(Math.random() * 7),
        c: Math.floor(Math.random() * 3)
      });
    }
  }

  activeFlower = sequenceQueue.shift();
  flowerEls[activeFlower.r][activeFlower.c].classList.add('lit');
  playNote(baseFrequencies[activeFlower.r][activeFlower.c]);

  // Set timeout for game over if missed
  currentTimeout = setTimeout(() => {
    if (isPlaying && !isPaused) {
      gameOver();
    }
  }, currentInterval);
}

function updateTime() {
  if (!isPlaying) return;
  
  const now = Date.now();
  if (!isPaused) {
    const elapsed = Math.floor((now - startTime - accumulatedPauseTime) / 1000);
    timeEl.innerText = elapsed;
    
    // Check pause earned
    if (elapsed >= nextPauseThreshold) {
      pausesEarned++;
      nextPauseThreshold += 20;
      updatePauseBtn();
    }
  }
  requestAnimationFrame(updateTime);
}

function updatePauseBtn() {
  pauseBtn.innerText = `Breather (${pausesEarned})`;
  pauseBtn.disabled = pausesEarned <= 0 || isPaused;
  if (pausesEarned > 0 && !isPaused) {
    pauseBtn.classList.add('breather-ready');
  } else {
    pauseBtn.classList.remove('breather-ready');
  }
}

pauseBtn.addEventListener('click', () => {
  if (pausesEarned > 0 && !isPaused) {
    pausesEarned--;
    updatePauseBtn();
    
    isPaused = true;
    lastPauseTime = Date.now();
    clearTimeout(currentTimeout);
    
    // Clear the active flower so the player isn't penalized for it when resuming
    if (activeFlower) {
      flowerEls[activeFlower.r][activeFlower.c].classList.remove('lit');
      activeFlower = null;
    }
    
    // Show countdown text
    const pt = document.createElement('div');
    pt.className = 'paused-text';
    pt.id = 'paused-text-el';
    container.appendChild(pt);
    
    let countdown = 3;
    pt.innerText = countdown;
    
    const countInterval = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        pt.innerText = countdown;
        if (countdown === 1) {
          pt.classList.add('flash-text');
        }
      } else {
        clearInterval(countInterval);
        pt.innerText = 'GO!';
        pt.classList.remove('flash-text');
        pt.classList.add('go-text');
        
        setTimeout(() => {
          pt.remove();
          isPaused = false;
          accumulatedPauseTime += (Date.now() - lastPauseTime);
          
          // Reduce speed by 30% (increase interval)
          currentInterval = currentInterval * 1.30; 
          
          updatePauseBtn();
          
          // The timer on the next button press needs to start over after the breather happens.
          // Calling nextTurn() here will pull the next flower and immediately start a brand new full currentInterval timer.
          nextTurn();
        }, 500); // Display GO for half a second before starting
      }
    }, 1000);
  }
});

function startGame() {
  initAudio();
  score = 0;
  scoreEl.innerText = '0';
  startTime = Date.now();
  accumulatedPauseTime = 0;
  currentInterval = 3000;
  if (params.get('autoplay') === 'split') currentInterval = 500;
  pausesEarned = 0;
  nextPauseThreshold = 20;
  sequenceQueue = [];
  activeFlower = null;
  isPlaying = true;
  isPaused = false;
  
  startOverlay.classList.add('hidden');
  gameOverOverlay.classList.add('hidden');
  updatePauseBtn();
  
  createGrid();
  requestAnimationFrame(updateTime);
  
  setTimeout(nextTurn, 500);
}

startBtn.addEventListener('click', () => {
  if (analytics) logEvent(analytics, 'custom_session_start');
  startGame();
});
restartBtn.addEventListener('click', startGame);

// Ecosystem Event Listeners
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

// Standard Button Listeners
document.getElementById('btn-install')?.addEventListener('click', () => {
    if (analytics) logEvent(analytics, 'install_prompt_clicked');
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
        document.getElementById('ios-install-modal').classList.remove('hidden');
    } else {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(() => { deferredPrompt = null; });
        } else {
            alert("App is already installed or not supported on this browser.");
        }
    }
});
document.getElementById('btn-close-ios-modal')?.addEventListener('click', () => {
    document.getElementById('ios-install-modal').classList.add('hidden');
});

document.getElementById('btn-share')?.addEventListener('click', () => {
    if (analytics) logEvent(analytics, 'brag_clicked');
    const survived = document.getElementById('final-time').innerText;
    const text = `🌼 Nomisekili \nI survived for ${survived} seconds!\n\nPlay free at https://Nomisekili.web.app`;
    if (navigator.share) {
        navigator.share({ title: 'Nomisekili', text: text }).then(() => {
            document.getElementById('restart-btn').classList.remove('hidden');
        }).catch(e => {
            document.getElementById('restart-btn').classList.remove('hidden');
        });
    } else {
        navigator.clipboard.writeText(text).then(() => {
            alert("Copied to clipboard!");
            document.getElementById('restart-btn').classList.remove('hidden');
        });
    }
});
document.getElementById('btn-binge')?.addEventListener('click', () => {
    if (analytics) logEvent(analytics, 'binge_presale_click');
    window.location.href = 'https://oops-games.com/presale.html';
});
document.getElementById('btn-hub')?.addEventListener('click', () => {
    if (analytics) logEvent(analytics, 'hub_clicked');
    window.location.href = 'https://oops-games.com';
});


document.getElementById('btn-binge-carousel')?.addEventListener('click', () => {
    if (analytics) logEvent(analytics, 'binge_presale_click');
    window.location.href = 'https://oops-games.com/presale.html?carousel=true';
});

// Embed Listener
document.getElementById('btn-embed-hook')?.addEventListener('click', () => {
    if (analytics) logEvent(analytics, 'embed_hook_clicked');
    window.open('https://oops-games.com/', '_blank');
});

if (params.get('mode') === 'embed') {
  if (analytics) logEvent(analytics, 'embed_visit', { game_id: 'NIM', publisher_domain: publisherDomain });
  document.getElementById('standard-buttons').classList.add('hidden');
  document.getElementById('carousel-buttons').classList.add('hidden');
  const embedBtns = document.getElementById('embed-buttons');
  if (embedBtns) embedBtns.classList.remove('hidden');
  document.getElementById('vic-cypher').style.display = 'none';
  const h2 = document.getElementById('game-over-title');
  if (h2) h2.innerText = "Time's Up!";
} else if (params.get('carousel') === 'true') {
  if (analytics) logEvent(analytics, 'carousel_visit', { game_id: 'NIM' });
  document.getElementById('standard-buttons').classList.add('hidden');
  document.getElementById('carousel-buttons').classList.remove('hidden');
}

// Autoplay for Video Gen
async function autoPlayLogic(mode) {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  await sleep(1000);
  startBtn.click();
  
  let playEndTime = Date.now() + 15000;
  if (mode === 'fail') playEndTime = Date.now() + 6000;
  if (mode === 'interactive') playEndTime = Date.now() + 10000;
  
  const playLoop = async () => {
    if (Date.now() > playEndTime) {
      if (mode === 'fail') {
          return;
      } else if (mode === 'interactive') {
          setTimeout(() => {
              window._VIDEO_RECORDING_DONE = true;
          }, 4000);
          return;
      } else {
          return;
      }
    }
    
    // Find lit flower
    if (activeFlower) {
      const f = flowerEls[activeFlower.r][activeFlower.c];
      f.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    }
    
    await sleep(200);
    requestAnimationFrame(playLoop);
  };
  
  playLoop();
}

if (params.get('autoplay')) {
  autoPlayLogic(params.get('autoplay'));
}

createGrid();

