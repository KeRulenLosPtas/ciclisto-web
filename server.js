const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  }
});

// Serve client assets
app.use(express.static(path.join(__dirname, 'public')));

// Default configurations from the original database dump
const DEFAULT_COMPETITIONS = [
  { id: 1, name: 'Tour de Francia', teams: 20, components: 10, phases: 2 },
  { id: 2, name: 'Giro de Italia', teams: 22, components: 10, phases: 2 },
  { id: 3, name: 'Vuelta a España', teams: 22, components: 10, phases: 2 },
  { id: 4, name: 'Fórmula F1', teams: 10, components: 10, phases: 1 },
  { id: 5, name: 'Mi Sorteo Nuevo', teams: 20, components: 10, phases: 2 }
];

const SPECIAL_TYPES = {
  3: { key: 'c', name: 'Capullo' },
  4: { key: 'C', name: 'Capullón' },
  5: { key: 't', name: 'Torpe' },
  6: { key: 'T', name: 'Torpón' }
};

// Global game state in memory
let gameState = {
  status: 'LOBBY', // 'LOBBY', 'PLAYING', 'FINISHED'
  config: {
    competitionId: 1,
    teams: 20,
    components: 10,
    phases: 2,
    quitarMultiplos10: true,
    exclusions: '',
    additions: '',
    specials: {
      3: 4, // Capullo
      4: 1, // Capullón
      5: 4, // Torpe
      6: 1  // Torpón
    }
  },
  players: [], // { name, pseudonym, socketId, active: true, role: 'director'|'player', chosen: [] }
  board: [], // { index, dorsal, type, discovered: false, iconIndex }
  turnOrder: [], // array of pseudonyms
  currentTurnIndex: 0,
  phase: 1,
  accumulatedSpecials: '', // current turn accumulated specials like 'c', 'cC'
  log: [] // log list { id, time, text, type: 'chat'|'system', sender: '' }
};

let logIdCounter = 0;
function addLog(text, type = 'system', sender = '') {
  const logEntry = {
    id: logIdCounter++,
    time: new Date().toLocaleTimeString(),
    text,
    type,
    sender
  };
  gameState.log.push(logEntry);
  if (gameState.log.length > 200) {
    gameState.log.shift();
  }
  io.emit('logUpdate', logEntry);
}

// Helper: Determine rider type based on dorsal
function getRiderType(num) {
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
    // If ends in 1, it's a JefeFilas
    if (num % 10 === 1) {
      return 'jefefila';
    } else {
      return 'gregario';
    }
  }
}

// Helper: Get clean type string
function getRiderTypeStr(type) {
  switch (type) {
    case 'jefefila': return 'Jefe de Fila';
    case 'gregario': return 'Gregario';
    case 'capullo': return 'Capullo';
    case 'capullon': return 'Capullón';
    case 'torpe': return 'Torpe';
    case 'torpon': return 'Torpón';
    default: return 'Desconocido';
  }
}

// Helper: Get abbreviation letter for specials
function getRiderTypeLetter(type) {
  switch (type) {
    case 'capullo': return 'c';
    case 'capullon': return 'C';
    case 'torpe': return 't';
    case 'torpon': return 'T';
    default: return '';
  }
}

// Generate the draft items
function generateItems(config) {
  let totalRiders = config.teams * config.components;
  let pool = [];
  for (let i = 1; i <= totalRiders; i++) {
    pool.push(i);
  }

  // Quitar múltiplos de 10
  if (config.quitarMultiplos10) {
    pool = pool.filter(n => n % 10 !== 0);
  }

  // Exclusiones (comma-separated list of numbers)
  if (config.exclusions) {
    const exc = config.exclusions.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    pool = pool.filter(n => !exc.includes(n));
  }

  // Añadidos (comma-separated list of numbers)
  if (config.additions) {
    const add = config.additions.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    add.forEach(num => {
      const randPos = Math.floor(Math.random() * (pool.length + 1));
      pool.splice(randPos, 0, num);
    });
  }

  // Especiales (shuffled into random positions)
  // Format: TypeCode * 10000 + OccurrenceIndex
  for (let typeStr in config.specials) {
    const typeCode = parseInt(typeStr);
    const count = config.specials[typeStr];
    for (let o = 1; o <= count; o++) {
      const specNum = typeCode * 10000 + o;
      const randPos = Math.floor(Math.random() * (pool.length + 1));
      pool.splice(randPos, 0, specNum);
    }
  }

  // Map to objects
  const iconCover = Math.floor(Math.random() * 5) + 1; // random cover back for the session
  const items = pool.map((dorsal, idx) => {
    return {
      index: idx,
      dorsal: dorsal,
      type: getRiderType(dorsal),
      discovered: false,
      iconIndex: iconCover
    };
  });

  return items;
}

// Check if all active players have reached the limit of runners in Phase 1
function checkPhase1Equality() {
  if (gameState.config.phases !== 2) return false;

  // Total gregarios in Phase 1
  const totalPhase1Gregarios = gameState.board.filter(item => item.type === 'gregario').length;
  const activePlayersCount = gameState.players.filter(p => p.active).length;
  if (activePlayersCount === 0) return false;

  const maxGregariosPerPlayer = Math.floor(totalPhase1Gregarios / activePlayersCount);
  
  // Check if every active player has at least maxGregariosPerPlayer gregarios
  for (let player of gameState.players) {
    if (!player.active) continue;
    // Count how many gregarios they have
    const gregariosCount = player.chosen.filter(item => getRiderType(item.dorsal) === 'gregario').length;
    if (gregariosCount < maxGregariosPerPlayer) {
      return false; // at least one player has not reached the max limit
    }
  }
  return true;
}

// Transition from Phase 1 to Phase 2
function transitionToPhase2() {
  addLog('Alcanzada la igualdad de corredores para todos los participantes.', 'system');
  addLog('Iniciando Fase 2: Elección de Jefes de Fila.', 'system');

  // 1. Gather all unrevealed items from the board
  const leftovers = gameState.board.filter(item => !item.discovered);
  
  // 2. Clear board and create phase 2 board
  // Phase 2 items = Jefes de Fila (filtered in game setup) + Leftovers
  const phase2Original = gameState.fullItemsPool.filter(item => item.type === 'jefefila');
  
  // Combine phase2Original and leftovers, shuffling leftovers into random positions
  const phase2Pool = [...phase2Original];
  leftovers.forEach(item => {
    // Reset discovered state
    item.discovered = false;
    const randPos = Math.floor(Math.random() * (phase2Pool.length + 1));
    phase2Pool.splice(randPos, 0, item);
  });

  // Re-index the phase 2 board
  phase2Pool.forEach((item, idx) => {
    item.index = idx;
  });

  gameState.board = phase2Pool;
  gameState.phase = 2;
  gameState.currentTurnIndex = 0; // turn goes back to the first player in order
  gameState.accumulatedSpecials = '';

  io.emit('phaseTransition', {
    board: gameState.board,
    phase: gameState.phase,
    turnOrder: gameState.turnOrder,
    currentTurnIndex: gameState.currentTurnIndex
  });

  const activePlayerPseudonym = gameState.turnOrder[gameState.currentTurnIndex];
  const activePlayer = gameState.players.find(p => p.pseudonym === activePlayerPseudonym);
  addLog(`Turno para ${activePlayer ? activePlayer.name : activePlayerPseudonym}`, 'system');
}

// Check if game is completely finished (no covered items left)
function checkGameFinished() {
  const coveredCount = gameState.board.filter(item => !item.discovered).length;
  if (coveredCount === 0) {
    finishGame();
    return true;
  }
  return false;
}

function finishGame() {
  gameState.status = 'FINISHED';
  addLog('¡El Sorteo ha Finalizado!', 'system');
  
  // Compile results
  gameState.finishedResults = {};
  gameState.players.forEach(p => {
    gameState.finishedResults[p.pseudonym] = {
      name: p.name,
      chosen: p.chosen
    };
  });

  io.emit('gameFinished', gameState.finishedResults);
}

// Select a random covered item (Auto-pick / CPU player)
function selectRandomItem(pseudonym) {
  const coveredItems = gameState.board.filter(item => !item.discovered);
  if (coveredItems.length === 0) return;

  const randomIndex = Math.floor(Math.random() * coveredItems.length);
  const selectedItem = coveredItems[randomIndex];
  
  handleItemSelection(selectedItem.index, pseudonym);
}

// Handle card click / item selection
function handleItemSelection(cardIndex, pseudonym) {
  const item = gameState.board[cardIndex];
  if (!item || item.discovered) return;

  const player = gameState.players.find(p => p.pseudonym === pseudonym);
  if (!player) return;

  // Reveal item
  item.discovered = true;

  if (item.type === 'gregario' || item.type === 'jefefila') {
    // Regular runner selected
    let label = item.dorsal.toString();
    if (gameState.accumulatedSpecials) {
      label += `(${gameState.accumulatedSpecials})`;
    }
    
    // Add to player's list
    player.chosen.push({
      dorsal: item.dorsal,
      type: item.type,
      label: label
    });

    addLog(`${player.name} -> ${label}`, 'system');
    
    // Reset accumulated specials
    gameState.accumulatedSpecials = '';

    // Broadcast board reveal
    io.emit('cardRevealed', {
      index: cardIndex,
      item: item,
      players: gameState.players
    });

    // Check game transition or end
    if (checkGameFinished()) {
      return;
    }

    if (gameState.phase === 1 && checkPhase1Equality()) {
      transitionToPhase2();
      return;
    }

    // Advance turn
    gameState.currentTurnIndex = (gameState.currentTurnIndex + 1) % gameState.turnOrder.length;
    const nextPlayerPseudonym = gameState.turnOrder[gameState.currentTurnIndex];
    const nextPlayer = gameState.players.find(p => p.pseudonym === nextPlayerPseudonym);
    
    io.emit('turnUpdate', {
      currentTurnIndex: gameState.currentTurnIndex,
      accumulatedSpecials: gameState.accumulatedSpecials
    });

    addLog(`Turno para ${nextPlayer ? nextPlayer.name : nextPlayerPseudonym}`, 'system');

    // If next player is inactive, Director can force auto-pick or we can auto-trigger if CPU
    // Note: CPU features can be added, but this is human-only with Director forcing auto-picks.

  } else {
    // Special item selected
    const specLetter = getRiderTypeLetter(item.type);
    gameState.accumulatedSpecials += specLetter;
    
    addLog(`${player.name} -> (${getRiderTypeStr(item.type)})`, 'system');

    // Push special item to player's chosen list for logs/results but keep turn
    player.chosen.push({
      dorsal: item.dorsal,
      type: item.type,
      label: `(${getRiderTypeStr(item.type)})`
    });

    // Broadcast board reveal
    io.emit('cardRevealed', {
      index: cardIndex,
      item: item,
      players: gameState.players
    });

    // Check game transition or end (special items could be the last items)
    if (checkGameFinished()) {
      return;
    }

    if (gameState.phase === 1 && checkPhase1Equality()) {
      transitionToPhase2();
      return;
    }

    // Notice: turn does NOT advance. Broadcast turn specials accumulation.
    io.emit('turnUpdate', {
      currentTurnIndex: gameState.currentTurnIndex,
      accumulatedSpecials: gameState.accumulatedSpecials
    });
  }
}

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Send current configuration and default competitions to newly connected socket
  socket.emit('initLobby', {
    competitions: DEFAULT_COMPETITIONS,
    config: gameState.config,
    players: gameState.players.map(p => ({
      name: p.name,
      pseudonym: p.pseudonym,
      active: p.active,
      role: p.role,
      chosen: p.chosen
    })),
    status: gameState.status,
    log: gameState.log,
    finishedResults: gameState.status === 'FINISHED' ? gameState.finishedResults : null,
    gameState: gameState.status !== 'LOBBY' ? {
      phase: gameState.phase,
      board: gameState.board,
      turnOrder: gameState.turnOrder,
      currentTurnIndex: gameState.currentTurnIndex,
      accumulatedSpecials: gameState.accumulatedSpecials
    } : null
  });


  // Join handler
  socket.on('joinGame', ({ name, pseudonym }) => {
    // Clean pseudonym
    const cleanPseudonym = pseudonym.trim().toLowerCase();
    
    // Check if player already exists (reconnection)
    let existingPlayer = gameState.players.find(p => p.pseudonym.toLowerCase() === cleanPseudonym);
    
    if (existingPlayer) {
      // Reconnection
      existingPlayer.socketId = socket.id;
      existingPlayer.active = true;
      existingPlayer.name = name; // Update name just in case
      socket.emit('joinSuccess', { player: existingPlayer, isReconnection: true });
      addLog(`${name} (@${pseudonym}) se ha reconectado.`, 'system');
    } else {
      // New connection
      // First player is director
      const role = gameState.players.length === 0 ? 'director' : 'player';
      const newPlayer = {
        name: name.trim(),
        pseudonym: pseudonym.trim(),
        socketId: socket.id,
        active: true,
        role: role,
        chosen: []
      };
      
      gameState.players.push(newPlayer);
      socket.emit('joinSuccess', { player: newPlayer, isReconnection: false });
      addLog(`${newPlayer.name} (@${newPlayer.pseudonym}) se ha unido a la partida como ${role === 'director' ? 'Director' : 'Jugador'}.`, 'system');
    }

    // Broadcast updated player list
    io.emit('playersUpdate', gameState.players.map(p => ({
      name: p.name,
      pseudonym: p.pseudonym,
      active: p.active,
      role: p.role,
      chosen: p.chosen
    })));
  });

  // Host updates config
  socket.on('updateConfig', (newConfig) => {
    // Check if socket is director
    const player = gameState.players.find(p => p.socketId === socket.id);
    if (!player || player.role !== 'director') return;

    gameState.config = { ...gameState.config, ...newConfig };
    io.emit('configUpdated', gameState.config);
  });

  // Host starts the game
  socket.on('startGame', () => {
    const player = gameState.players.find(p => p.socketId === socket.id);
    if (!player || player.role !== 'director') return;

    if (gameState.players.filter(p => p.active).length === 0) {
      socket.emit('errorMsg', 'No hay jugadores activos para comenzar.');
      return;
    }

    // 1. Generate items
    const allItems = generateItems(gameState.config);
    gameState.fullItemsPool = allItems;
    
    // 2. Separate into phases
    if (gameState.config.phases === 2) {
      gameState.board = allItems.filter(item => item.type !== 'jefefila');
      gameState.phase = 1;
    } else {
      gameState.board = allItems;
      gameState.phase = 1;
    }

    // Reset player chosen items
    gameState.players.forEach(p => p.chosen = []);

    // 3. Shuffle turn order of active players
    const activePseudonyms = gameState.players.filter(p => p.active).map(p => p.pseudonym);
    // Shuffle helper
    const shuffled = [...activePseudonyms].sort(() => Math.random() - 0.5);
    gameState.turnOrder = shuffled;
    gameState.currentTurnIndex = 0;
    gameState.accumulatedSpecials = '';
    
    gameState.status = 'PLAYING';
    
    addLog('¡Comienza el Sorteo!', 'system');
    addLog(`Fase 1: Elección de Gregarios y Especiales.`, 'system');
    
    io.emit('gameStarted', {
      board: gameState.board,
      phase: gameState.phase,
      turnOrder: gameState.turnOrder,
      currentTurnIndex: gameState.currentTurnIndex,
      players: gameState.players
    });

    const activePlayerPseudonym = gameState.turnOrder[gameState.currentTurnIndex];
    const activePlayer = gameState.players.find(p => p.pseudonym === activePlayerPseudonym);
    addLog(`Turno para ${activePlayer ? activePlayer.name : activePlayerPseudonym}`, 'system');
  });

  // Client selects card
  socket.on('selectCard', (cardIndex) => {
    if (gameState.status !== 'PLAYING') return;

    // Check if it's this player's turn
    const activePlayerPseudonym = gameState.turnOrder[gameState.currentTurnIndex];
    const player = gameState.players.find(p => p.socketId === socket.id);
    
    if (!player || player.pseudonym !== activePlayerPseudonym) {
      socket.emit('errorMsg', 'No es tu turno de elegir.');
      return;
    }

    handleItemSelection(cardIndex, player.pseudonym);
  });

  // Chat message
  socket.on('chatMessage', (msgText) => {
    const player = gameState.players.find(p => p.socketId === socket.id);
    if (!player) return;

    addLog(msgText.trim(), 'chat', player.name);
  });

  // Host forces auto-pick
  socket.on('forceAutoPick', () => {
    const hostPlayer = gameState.players.find(p => p.socketId === socket.id);
    if (!hostPlayer || hostPlayer.role !== 'director') return;

    if (gameState.status !== 'PLAYING') return;

    const activePlayerPseudonym = gameState.turnOrder[gameState.currentTurnIndex];
    addLog(`[Director] Selección automática forzada para ${activePlayerPseudonym}.`, 'system');
    selectRandomItem(activePlayerPseudonym);
  });

  // Host resets game to lobby
  socket.on('resetGame', () => {
    const hostPlayer = gameState.players.find(p => p.socketId === socket.id);
    if (!hostPlayer || hostPlayer.role !== 'director') return;

    gameState.status = 'LOBBY';
    gameState.board = [];
    gameState.turnOrder = [];
    gameState.currentTurnIndex = 0;
    gameState.phase = 1;
    gameState.accumulatedSpecials = '';
    
    // Clear selections
    gameState.players.forEach(p => p.chosen = []);

    addLog('El sorteo ha sido reiniciado por el Director.', 'system');

    io.emit('gameReset', {
      players: gameState.players,
      config: gameState.config
    });
  });

  // Director removes a player
  socket.on('removePlayer', (pseudonymToRemove) => {
    const hostPlayer = gameState.players.find(p => p.socketId === socket.id);
    if (!hostPlayer || hostPlayer.role !== 'director') return;

    const playerIndex = gameState.players.findIndex(p => p.pseudonym.toLowerCase() === pseudonymToRemove.toLowerCase());
    if (playerIndex === -1) return;

    const removedPlayer = gameState.players[playerIndex];
    gameState.players.splice(playerIndex, 1);

    addLog(`${removedPlayer.name} (@${removedPlayer.pseudonym}) ha sido eliminado por el Director.`, 'system');

    // Broadcast updated player list
    io.emit('playersUpdate', gameState.players.map(p => ({
      name: p.name,
      pseudonym: p.pseudonym,
      active: p.active,
      role: p.role,
      chosen: p.chosen
    })));
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    const player = gameState.players.find(p => p.socketId === socket.id);
    if (player) {
      player.active = false;
      addLog(`${player.name} (@${player.pseudonym}) se ha desconectado.`, 'system');
      
      // Check if all players disconnected
      const activePlayers = gameState.players.filter(p => p.active);
      if (activePlayers.length === 0) {
        console.log('No active players. Resetting game to lobby.');
        // Optionally reset after some time, but we keep the state in case of server restart
      } else {
        // If the disconnected player was the director, assign director to the next active player
        if (player.role === 'director') {
          player.role = 'player';
          activePlayers[0].role = 'director';
          addLog(`${activePlayers[0].name} es ahora el nuevo Director.`, 'system');
        }
      }

      // Broadcast update
      io.emit('playersUpdate', gameState.players.map(p => ({
        name: p.name,
        pseudonym: p.pseudonym,
        active: p.active,
        role: p.role,
        chosen: p.chosen
      })));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
