// Initialize socket connection
const socket = io();

// Application elements
const loginScreen = document.getElementById('login-screen');
const mainLayout = document.getElementById('main-layout');
const loginForm = document.getElementById('login-form');
const inputName = document.getElementById('input-name');
const inputPseudonym = document.getElementById('input-pseudonym');

const playersList = document.getElementById('players-list');
const playerCountBadge = document.getElementById('player-count-badge');
const directorControls = document.getElementById('director-controls');
const btnForceAuto = document.getElementById('btn-force-auto');
const btnResetGame = document.getElementById('btn-reset-game');

const gameHeader = document.getElementById('game-header');
const competitionTitle = document.getElementById('competition-title');
const gamePhaseLabel = document.getElementById('game-phase-label');
const turnBanner = document.getElementById('active-turn-banner');
const turnText = document.getElementById('turn-text');
const specialsBadge = document.getElementById('specials-badge');

const lobbyView = document.getElementById('lobby-view');
const playingView = document.getElementById('playing-view');
const resultsView = document.getElementById('results-view');
const hostConfigPanel = document.getElementById('host-config-panel');
const guestWaitingPanel = document.getElementById('guest-waiting-panel');

const selectCompetition = document.getElementById('select-competition');
const inputTeams = document.getElementById('input-teams');
const inputComponents = document.getElementById('input-components');
const selectPhases = document.getElementById('select-phases');
const checkMulti10 = document.getElementById('check-multi10');
const inputExclusions = document.getElementById('input-exclusions');
const inputAdditions = document.getElementById('input-additions');

const specialCapullo = document.getElementById('special-capullo');
const specialCapullon = document.getElementById('special-capullon');
const specialTorpe = document.getElementById('special-torpe');
const specialTorpon = document.getElementById('special-torpon');

const configForm = document.getElementById('config-form');
const boardGrid = document.getElementById('board-grid');
const chatLogsContainer = document.getElementById('chat-logs-container');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');

const resultsTablesContainer = document.getElementById('results-tables-container');
const btnExportCsv = document.getElementById('btn-export-csv');
const btnHostRestart = document.getElementById('btn-host-restart');

// Summary elements for guests
const summaryComp = document.getElementById('summary-comp');
const summaryTeams = document.getElementById('summary-teams');
const summaryComponents = document.getElementById('summary-components');
const summaryPhases = document.getElementById('summary-phases');
const summaryMulti10 = document.getElementById('summary-multi10');

// Local user state
let me = null; // player object
let myPseudonym = '';
let currentTurnOrder = [];
let currentTurnIndex = 0;
let defaultCompetitions = [];
let localConfig = {};
let accumulatedSpecials = '';
let cardDisplayNumbers = {}; // Maps card index to random display number

// ==================== WEB AUDIO SYNTH EFFECTS ====================
const soundEffects = {
  ctx: null,
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  },
  playClick() {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  },
  playReveal() {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(350, this.ctx.currentTime);
    osc.frequency.setValueAtTime(523.25, this.ctx.currentTime + 0.08); // C5
    osc.frequency.setValueAtTime(659.25, this.ctx.currentTime + 0.16); // E5
    
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime + 0.16);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.35);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.35);
  },
  playSpecial() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const freqs = [523.25, 659.25, 783.99, 1046.50]; // C-E-G-C chime
    freqs.forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + idx * 0.06);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.1, now + idx * 0.06 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.35);
      
      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.4);
    });
  }
};

// ==================== THEME MANAGEMENT ====================
function updateAppTheme(competitionId) {
  // Reset themes
  document.body.classList.remove('theme-tour', 'theme-giro', 'theme-vuelta', 'theme-generic');
  
  const id = parseInt(competitionId);
  switch(id) {
    case 1:
      document.body.classList.add('theme-tour');
      break;
    case 2:
      document.body.classList.add('theme-giro');
      break;
    case 3:
      document.body.classList.add('theme-vuelta');
      break;
    case 4:
    case 5:
    default:
      document.body.classList.add('theme-generic');
      break;
  }
}

// Get icon markup based on type
function getIconSvg(type) {
  switch (type) {
    case 'jefefila':
      return `<svg class="card-front-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zM5 20h14a1 1 0 0 1 1 1v1H4v-1a1 1 0 0 1 1-1z"/></svg>`;
    case 'gregario':
      return `<svg class="card-front-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5.5" cy="17.5" r="2.5"/><circle cx="18.5" cy="17.5" r="2.5"/><path d="M15 6h3m-3 0v4m-3.5 7.5 2.5-4.5h5.5l2.5 4.5M12 9.5l-4 4.5h8l-4-4.5z"/></svg>`;
    case 'capullo':
      return `<span style="font-size: 20px;">🥀</span>`;
    case 'capullon':
      return `<span style="font-size: 24px;">🌹</span>`;
    case 'torpe':
      return `<span style="font-size: 20px;">🐌</span>`;
    case 'torpon':
      return `<span style="font-size: 24px;">🐢</span>`;
    default:
      return '';
  }
}

function getRiderTypeStr(type) {
  switch (type) {
    case 'jefefila': return 'Jefe Fila';
    case 'gregario': return 'Gregario';
    case 'capullo': return 'Capullo';
    case 'capullon': return 'Capullón';
    case 'torpe': return 'Torpe';
    case 'torpon': return 'Torpón';
    default: return 'Corredor';
  }
}

// Determine rider type from dorsal number (mirrors server logic)
function getRiderType(dorsal) {
  const num = parseInt(dorsal);
  if (isNaN(num)) return 'gregario';
  if (num > 10000) {
    const typeDigit = Math.floor(num / 10000);
    switch (typeDigit) {
      case 3: return 'capullo';
      case 4: return 'capullon';
      case 5: return 'torpe';
      case 6: return 'torpon';
      default: return 'gregario';
    }
  } else {
    return num % 10 === 1 ? 'jefefila' : 'gregario';
  }
}

// Generate random display numbers for cards (randomized each game)
function generateRandomCardNumbers(boardLength) {
  cardDisplayNumbers = {};
  const usedNumbers = new Set();
  
  for (let i = 0; i < boardLength; i++) {
    let randomNum;
    do {
      randomNum = Math.floor(Math.random() * 999) + 1; // Random 1-999
    } while (usedNumbers.has(randomNum));
    
    usedNumbers.add(randomNum);
    cardDisplayNumbers[i] = randomNum;
  }
}


// ==================== SOCKET.IO RECEIVERS ====================

// Lobby initialization
socket.on('initLobby', (data) => {
  defaultCompetitions = data.competitions;
  localConfig = data.config;
  gameStateUpdate(data.status);
  
  // Populate select options if empty
  if (selectCompetition.children.length === 0) {
    defaultCompetitions.forEach(comp => {
      const opt = document.createElement('option');
      opt.value = comp.id;
      opt.textContent = comp.name;
      selectCompetition.appendChild(opt);
    });
  }

  // Set values
  selectCompetition.value = localConfig.competitionId;
  updateAppTheme(localConfig.competitionId);
  syncConfigInputs(localConfig);

  // Set players list
  updatePlayersUI(data.players);

  // Load chat log
  chatLogsContainer.innerHTML = '';
  data.log.forEach(entry => appendLogToUI(entry));
  scrollLogsToBottom();

  if (data.status !== 'LOBBY' && data.gameState) {
    currentTurnOrder = data.gameState.turnOrder;
    currentTurnIndex = data.gameState.currentTurnIndex;
    accumulatedSpecials = data.gameState.accumulatedSpecials;
    renderBoard(data.gameState.board);
    updateTurnBannerUI();
    
    if (data.status === 'FINISHED' && data.finishedResults) {
      displayFinalResults(data.finishedResults);
    }
  }
});


// Update configurations in real-time
socket.on('configUpdated', (config) => {
  localConfig = config;
  syncConfigInputs(config);
  updateAppTheme(config.competitionId);
});

// Join feedback
socket.on('joinSuccess', ({ player, isReconnection }) => {
  me = player;
  myPseudonym = player.pseudonym;
  loginScreen.classList.remove('active');
  mainLayout.classList.add('active');
  
  if (player.role === 'director') {
    directorControls.classList.remove('hidden');
    hostConfigPanel.classList.remove('hidden');
    guestWaitingPanel.classList.add('hidden');
    btnHostRestart.classList.remove('hidden');
  } else {
    directorControls.classList.add('hidden');
    hostConfigPanel.classList.add('hidden');
    guestWaitingPanel.classList.remove('hidden');
    btnHostRestart.classList.add('hidden');
  }
});

// Players list update
socket.on('playersUpdate', (players) => {
  updatePlayersUI(players);
  
  // Update my role if changed (e.g. host disconnects, guest becomes host)
  const myPlayer = players.find(p => p.pseudonym === myPseudonym);
  if (myPlayer) {
    me = myPlayer;
    if (myPlayer.role === 'director') {
      directorControls.classList.remove('hidden');
      hostConfigPanel.classList.remove('hidden');
      guestWaitingPanel.classList.add('hidden');
      btnHostRestart.classList.remove('hidden');
    } else {
      directorControls.classList.add('hidden');
      hostConfigPanel.classList.add('hidden');
      guestWaitingPanel.classList.remove('hidden');
      btnHostRestart.classList.add('hidden');
    }
  }
  playerCountBadge.textContent = players.length;
});

// Game Started
socket.on('gameStarted', (data) => {
  currentTurnOrder = data.turnOrder;
  currentTurnIndex = data.currentTurnIndex;
  accumulatedSpecials = '';
  gameStateUpdate('PLAYING');
  generateRandomCardNumbers(data.board.length); // Generate random display numbers
  renderBoard(data.board);
  updateTurnBannerUI();
  soundEffects.playSpecial(); // shiny chime to start
});

// Turn updates
socket.on('turnUpdate', (data) => {
  currentTurnIndex = data.currentTurnIndex;
  accumulatedSpecials = data.accumulatedSpecials;
  updateTurnBannerUI();
});

// Log entries
socket.on('logUpdate', (entry) => {
  appendLogToUI(entry);
  scrollLogsToBottom();
});

// Card Flip update
socket.on('cardRevealed', (data) => {
  const cardElem = document.querySelector(`.card-container[data-index="${data.index}"] .card`);
  if (cardElem) {
    // Fill front card content
    const frontFace = cardElem.querySelector('.card-front');
    frontFace.className = `card-face card-front ${data.item.type}`;
    
    // Set colors & icons
    frontFace.innerHTML = `
      ${getIconSvg(data.item.type)}
      <div class="card-front-num">${data.item.dorsal > 10000 ? '' : data.item.dorsal}</div>
      <div class="card-front-label">${getRiderTypeStr(data.item.type)}</div>
    `;

    // Trigger 3D flip class
    cardElem.classList.add('flipped');
  }

  // Play appropriate sound effect
  if (data.item.type === 'gregario' || data.item.type === 'jefefila') {
    soundEffects.playReveal();
  } else {
    soundEffects.playSpecial();
  }

  // Update players info (like drafted lists)
  updatePlayersUI(data.players);
});

// Phase transitions (Fase 1 -> Fase 2)
socket.on('phaseTransition', (data) => {
  currentTurnOrder = data.turnOrder;
  currentTurnIndex = data.currentTurnIndex;
  accumulatedSpecials = '';
  
  // Update phase indicator
  gamePhaseLabel.textContent = `FASE ${data.phase}: ELECCIÓN DE JEFES DE FILA`;
  
  // Re-draw board with transition
  boardGrid.style.opacity = 0;
  setTimeout(() => {
    renderBoard(data.board);
    boardGrid.style.opacity = 1;
    updateTurnBannerUI();
    soundEffects.playSpecial();
  }, 300);
});

// Game Finished
socket.on('gameFinished', (results) => {
  gameStateUpdate('FINISHED');
  displayFinalResults(results);
});

// Game Reset back to Lobby
socket.on('gameReset', (data) => {
  gameStateUpdate('LOBBY');
  localConfig = data.config;
  syncConfigInputs(localConfig);
  updatePlayersUI(data.players);
  boardGrid.innerHTML = '';
  accumulatedSpecials = '';
});

socket.on('errorMsg', (msg) => {
  alert(msg);
});

// ==================== UI STATE FUNCTIONS ====================

function gameStateUpdate(status) {
  // Hide all panels
  lobbyView.classList.remove('active');
  playingView.classList.remove('active');
  resultsView.classList.remove('active');

  if (status === 'LOBBY') {
    lobbyView.classList.add('active');
    gamePhaseLabel.textContent = 'CONFIGURACIÓN DE LA CARRERA';
    turnBanner.style.display = 'none';
  } else if (status === 'PLAYING') {
    playingView.classList.add('active');
    gamePhaseLabel.textContent = 'FASE 1: GREGARIOS Y ESPECIALES';
    turnBanner.style.display = 'flex';
  } else if (status === 'FINISHED') {
    resultsView.classList.add('active');
    gamePhaseLabel.textContent = 'SORTEO COMPLETADO';
    turnBanner.style.display = 'none';
  }
}

// Synchonize config inputs to matches
function syncConfigInputs(config) {
  const comp = defaultCompetitions.find(c => c.id === parseInt(config.competitionId));
  const compName = comp ? comp.name : 'Personalizada';
  competitionTitle.textContent = compName;
  
  // Wait summaries
  summaryComp.textContent = compName;
  summaryTeams.textContent = config.teams;
  summaryComponents.textContent = config.components;
  summaryPhases.textContent = config.phases === 2 ? '2 Fases (Gregarios, Jefes)' : '1 Fase';
  summaryMulti10.textContent = config.quitarMultiplos10 ? 'No usar' : 'Permitidos';

  // Form values
  inputTeams.value = config.teams;
  inputComponents.value = config.components;
  selectPhases.value = config.phases;
  checkMulti10.checked = config.quitarMultiplos10;
  inputExclusions.value = config.exclusions || '';
  inputAdditions.value = config.additions || '';
  
  if (config.specials) {
    specialCapullo.value = config.specials[3] || 0;
    specialCapullon.value = config.specials[4] || 0;
    specialTorpe.value = config.specials[5] || 0;
    specialTorpon.value = config.specials[6] || 0;
  }
}

// Update players list on left panel
function updatePlayersUI(players) {
  playersList.innerHTML = '';
  
  const activePlayerPseudonym = currentTurnOrder[currentTurnIndex];
  
  players.forEach((p, idx) => {
    const isMyTurn = activePlayerPseudonym === p.pseudonym;
    const isMe = p.pseudonym === myPseudonym;
    
    // Compile label
    const chosenLabels = p.chosen ? p.chosen.map(item => item.label).join(', ') : '';
    
    const playerCard = document.createElement('div');
    playerCard.className = `player-item ${isMyTurn ? 'active-turn' : ''} ${!p.active ? 'disconnected' : ''}`;
    
    playerCard.innerHTML = `
      <div class="player-row">
        <div class="player-info-meta">
          <span class="player-status-dot"></span>
          <span class="player-name">${p.name} ${isMe ? '<span style="color:var(--accent-color)">(Tú)</span>' : ''}</span>
          <span class="player-pseudonym">@${p.pseudonym}</span>
        </div>
        <div class="player-row-actions">
          <span class="player-count">(${p.chosen ? p.chosen.filter(item => item.type === 'gregario' || item.type === 'jefefila').length : 0})</span>
          ${me && me.role === 'director' && p.pseudonym !== me.pseudonym ? `
            <button class="btn-remove-player" data-pseudonym="${p.pseudonym}" title="Eliminar jugador">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          ` : ''}
        </div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
        <span class="player-role-badge ${p.role === 'director' ? 'director' : ''}">${p.role === 'director' ? 'Director' : 'Jugador'}</span>
        ${!p.active ? '<span style="font-size:0.7rem; color:var(--danger)">Desconectado</span>' : ''}
      </div>
      ${chosenLabels ? `<div class="player-drafted-list"><strong>Asignados:</strong> ${chosenLabels}</div>` : ''}
    `;
    playersList.appendChild(playerCard);
    
    // Add event listener for remove button
    const removeBtn = playerCard.querySelector('.btn-remove-player');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        const pseudonym = removeBtn.getAttribute('data-pseudonym');
        if (confirm(`¿Estás seguro de que quieres eliminar a ${p.name}?`)) {
          socket.emit('removePlayer', pseudonym);
          soundEffects.playClick();
        }
      });
    }
  });
}

// Render dynamic cards board
function renderBoard(board) {
  boardGrid.innerHTML = '';
  
  board.forEach(item => {
    const cardContainer = document.createElement('div');
    cardContainer.className = 'card-container';
    cardContainer.setAttribute('data-index', item.index);
    
    const card = document.createElement('div');
    card.className = `card ${item.discovered ? 'flipped' : ''}`;
    
    // Back face (covered)
    const cardBack = document.createElement('div');
    cardBack.className = 'card-face card-back';
    cardBack.innerHTML = `
      <div class="card-back-design">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/>
        </svg>
        <span class="card-back-number">?</span>
      </div>
    `;
    
    // Front face (revealed)
    const cardFront = document.createElement('div');
    if (item.discovered) {
      cardFront.className = `card-face card-front ${item.type}`;
      const displayNum = item.dorsal > 10000 ? '' : (cardDisplayNumbers[item.index] || item.dorsal);
      cardFront.innerHTML = `
        ${getIconSvg(item.type)}
        <div class="card-front-num">${displayNum}</div>
        <div class="card-front-label">${getRiderTypeStr(item.type)}</div>
      `;
    } else {
      cardFront.className = 'card-face card-front';
    }
    
    card.appendChild(cardBack);
    card.appendChild(cardFront);
    cardContainer.appendChild(card);
    
    // Add Click listener
    cardContainer.addEventListener('click', () => {
      if (item.discovered) return;
      
      // Check if it's my turn
      const activePlayerPseudonym = currentTurnOrder[currentTurnIndex];
      if (activePlayerPseudonym !== myPseudonym) {
        soundEffects.playClick();
        return; 
      }
      
      socket.emit('selectCard', item.index);
    });
    
    boardGrid.appendChild(cardContainer);
  });
}

// Update turn banner UI details
function updateTurnBannerUI() {
  const activePlayerPseudonym = currentTurnOrder[currentTurnIndex];
  const isMyTurn = activePlayerPseudonym === myPseudonym;
  
  if (isMyTurn) {
    turnText.textContent = '¡Es Tu Turno!';
    turnBanner.style.borderColor = 'var(--accent-color)';
    turnBanner.style.boxShadow = '0 0 10px var(--accent-glow)';
  } else {
    turnText.textContent = `Turno de: @${activePlayerPseudonym || '...'}`;
    turnBanner.style.borderColor = 'var(--panel-border)';
    turnBanner.style.boxShadow = 'none';
  }

  if (accumulatedSpecials) {
    specialsBadge.textContent = `+${accumulatedSpecials}`;
    specialsBadge.classList.remove('hidden');
  } else {
    specialsBadge.classList.add('hidden');
  }
}

// Append logs/messages to sidebar
function appendLogToUI(entry) {
  const entryDiv = document.createElement('div');
  entryDiv.className = `log-entry ${entry.type}`;
  
  if (entry.type === 'chat') {
    entryDiv.innerHTML = `
      <span class="log-time">${entry.time}</span>
      <span class="log-sender">${entry.sender}:</span>
      <span class="log-text">${entry.text}</span>
    `;
  } else {
    entryDiv.innerHTML = `
      <span class="log-time">${entry.time}</span>
      <span class="log-text">${entry.text}</span>
    `;
  }
  
  chatLogsContainer.appendChild(entryDiv);
}

function scrollLogsToBottom() {
  chatLogsContainer.scrollTop = chatLogsContainer.scrollHeight;
}

// Show results grid sheet
function displayFinalResults(results) {
  resultsTablesContainer.innerHTML = '';
  
  for (let pseudonym in results) {
    const data = results[pseudonym];
    const userCard = document.createElement('div');
    userCard.className = 'result-card';
    
    const ridersOnly = data.chosen.filter(item => getRiderType(item.dorsal) === 'gregario' || getRiderType(item.dorsal) === 'jefefila');
    
    userCard.innerHTML = `
      <div class="result-card-header">
        <h3>${data.name} (@${pseudonym})</h3>
        <span class="result-count">${ridersOnly.length} Corredores</span>
      </div>
      <div class="result-items-list">
        ${data.chosen.map(item => {
          const isJefe = getRiderType(item.dorsal) === 'jefefila';
          return `<span class="result-tag ${isJefe ? 'jefe' : ''}">${item.label}</span>`;
        }).join('')}
      </div>
    `;
    resultsTablesContainer.appendChild(userCard);
  }
  
  soundEffects.playSpecial(); // celebration chime
}

// Helper: export game to CSV
function exportResultsToCSV() {
  const results = {};
  // Extract results from active players
  const playerItems = document.querySelectorAll('.result-card');
  if (playerItems.length === 0) return;
  
  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "Participante,Usuario,Dorsales Asignados\n";
  
  playerItems.forEach(card => {
    const header = card.querySelector('h3').textContent;
    const namePart = header.split(' (@')[0];
    const pseudPart = header.split(' (@')[1].replace(')', '');
    
    const tags = Array.from(card.querySelectorAll('.result-tag')).map(t => t.textContent).join(' ');
    
    csvContent += `"${namePart}","${pseudPart}","${tags}"\n`;
  });
  
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Sorteo_Ciclisto_${competitionTitle.textContent.replace(/ /g, '_')}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==================== EVENT LISTENERS ====================

// Login Form Submit
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const name = inputName.value.trim();
  const pseudonym = inputPseudonym.value.trim();
  
  if (name && pseudonym) {
    socket.emit('joinGame', { name, pseudonym });
    soundEffects.playClick();
  }
});

// Host selector change -> update configurations on server
selectCompetition.addEventListener('change', (e) => {
  const compId = parseInt(e.target.value);
  const defaultComp = defaultCompetitions.find(c => c.id === compId);
  if (defaultComp) {
    const updated = {
      competitionId: compId,
      teams: defaultComp.teams,
      components: defaultComp.components,
      phases: defaultComp.phases
    };
    socket.emit('updateConfig', updated);
  }
});

// Update config elements dynamically on input change
const configInputs = [inputTeams, inputComponents, selectPhases, checkMulti10, inputExclusions, inputAdditions, specialCapullo, specialCapullon, specialTorpe, specialTorpon];
configInputs.forEach(input => {
  input.addEventListener('change', () => {
    if (me && me.role === 'director') {
      const config = {
        competitionId: selectCompetition.value === '5' ? 5 : selectCompetition.value, // keep custom/current
        teams: parseInt(inputTeams.value),
        components: parseInt(inputComponents.value),
        phases: parseInt(selectPhases.value),
        quitarMultiplos10: checkMulti10.checked,
        exclusions: inputExclusions.value,
        additions: inputAdditions.value,
        specials: {
          3: parseInt(specialCapullo.value) || 0,
          4: parseInt(specialCapullon.value) || 0,
          5: parseInt(specialTorpe.value) || 0,
          6: parseInt(specialTorpon.value) || 0
        }
      };
      
      // If any of the team/component inputs change, switch select competition to 'custom' (Mi sorteo Nuevo)
      const matchingComp = defaultCompetitions.find(c => c.teams === config.teams && c.components === config.components && c.phases === config.phases && c.id !== 5);
      if (!matchingComp) {
        selectCompetition.value = '5';
        config.competitionId = 5;
      }
      
      socket.emit('updateConfig', config);
    }
  });
});

// Chat submit message
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (text) {
    socket.emit('chatMessage', text);
    chatInput.value = '';
    chatInput.focus();
    soundEffects.playClick();
  }
});

// Start Game click (Director only)
configForm.addEventListener('submit', (e) => {
  e.preventDefault();
  socket.emit('startGame');
  soundEffects.playClick();
});

// Admin buttons
btnForceAuto.addEventListener('click', () => {
  socket.emit('forceAutoPick');
  soundEffects.playClick();
});

btnResetGame.addEventListener('click', () => {
  if (confirm('¿Estás seguro de que quieres reiniciar el sorteo? Se perderán todas las asignaciones actuales.')) {
    socket.emit('resetGame');
    soundEffects.playClick();
  }
});

btnHostRestart.addEventListener('click', () => {
  socket.emit('resetGame');
  soundEffects.playClick();
});

btnExportCsv.addEventListener('click', () => {
  exportResultsToCSV();
  soundEffects.playClick();
});
