/* ============================================
   MAGIC CHESS GO GO PREDICTOR - JavaScript
   ============================================
   ALGORITMA: Exact Cycle Round-Robin Predictor
   
   Based on empirical data: The game uses a strict Round-Robin system.
   Player fights every living opponent once before the cycle repeats.
   ============================================ */

// ===== KONFIGURASI =====
const creepRounds = ["1-1", "2-3", "3-3", "4-3", "5-3"];
const STORAGE_KEY = 'mcgg_predictor_session';

// ===== SOUND EFFECTS (Base64 encoded simple beeps) =====
const sounds = {
    // Simple beep sounds using Web Audio API
    predict: { frequency: 880, duration: 150, type: 'sine' },
    fight: { frequency: 440, duration: 100, type: 'square' },
    eliminate: { frequency: 220, duration: 200, type: 'sawtooth' },
    complete: { frequency: 660, duration: 300, type: 'sine' },
    alert: { frequency: 1000, duration: 100, type: 'sine' }
};

let audioContext = null;
let soundEnabled = true;

function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playSound(soundType) {
    if (!soundEnabled) return;

    try {
        initAudio();
        const sound = sounds[soundType];
        if (!sound) return;

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = sound.frequency;
        oscillator.type = sound.type;

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + sound.duration / 1000);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + sound.duration / 1000);
    } catch (e) {
        console.log('Sound error:', e);
    }
}

// ===== STATE VARIABLES =====
let opponentsCycle = [];      // Urutan siklus lawan
let currentStage = 1;         // Stage saat ini (1, 2, 3, ...)
let currentSubRound = 1;      // Sub-round dalam stage
let enemies = [];             // Array musuh dengan status
let foughtThisCycle = new Set(); // Track musuh yang sudah dilawan di cycle ini
let battleHistory = [];       // Track semua pertarungan
let gameStarted = false;      // Track apakah game sudah dimulai
let stateHistory = [];        // Stack untuk undo (max 10 states)
const MAX_HISTORY = 10;

// ===== UNDO SYSTEM =====
function saveState() {
    const currentState = {
        opponentsCycle: [...opponentsCycle],
        currentStage,
        currentSubRound,
        enemies: JSON.parse(JSON.stringify(enemies)),
        foughtThisCycle: new Set(foughtThisCycle),
        battleHistory: [...battleHistory]
    };

    stateHistory.push(currentState);

    // Limit history size
    if (stateHistory.length > MAX_HISTORY) {
        stateHistory.shift();
    }

    updateUndoButton();
}

function undo() {
    if (stateHistory.length === 0) {
        showToast('⚠️ Tidak ada yang bisa dibatalkan', 'warning');
        return;
    }

    const previousState = stateHistory.pop();

    // Restore state
    opponentsCycle = previousState.opponentsCycle;
    currentStage = previousState.currentStage;
    currentSubRound = previousState.currentSubRound;
    enemies = previousState.enemies;
    foughtThisCycle = previousState.foughtThisCycle;
    battleHistory = previousState.battleHistory;

    saveSession();
    updateUI();
    updateUndoButton();
    playSound('alert');
    showToast('↩️ Aksi dibatalkan!', 'info');
}

function updateUndoButton() {
    const btn = document.getElementById('undoBtn');
    if (btn) {
        btn.disabled = stateHistory.length === 0;
        btn.style.opacity = stateHistory.length === 0 ? '0.5' : '1';
    }
}

// ===== LOCAL STORAGE - AUTO SAVE =====
function saveSession() {
    const session = {
        opponentsCycle,
        currentStage,
        currentSubRound,
        enemies,
        foughtThisCycle: Array.from(foughtThisCycle),
        battleHistory,
        gameStarted,
        savedAt: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function loadSession() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const session = JSON.parse(saved);
            opponentsCycle = session.opponentsCycle || [];
            currentStage = session.currentStage || 1;
            currentSubRound = session.currentSubRound || 1;
            enemies = session.enemies || [];
            foughtThisCycle = new Set(session.foughtThisCycle || []);
            battleHistory = session.battleHistory || [];
            gameStarted = session.gameStarted || false;
            return true;
        }
    } catch (e) {
        console.log('Error loading session:', e);
    }
    return false;
}

function clearSession() {
    localStorage.removeItem(STORAGE_KEY);
}

// ===== INITIALIZATION =====
function init() {
    // Check for saved session
    if (loadSession() && gameStarted && enemies.length > 0) {
        // Restore game state
        document.getElementById('setupPhase').classList.add('hidden');
        document.getElementById('gamePhase').classList.remove('hidden');
        document.querySelector('#phase1 .phase-dot').classList.remove('active');
        document.querySelector('#phase2 .phase-dot').classList.add('active');
        updateUI();
        showToast('💾 Sesi sebelumnya dipulihkan!', 'success');
    } else {
        generatePlayerInputs();
    }

    // Setup keyboard shortcuts
    setupKeyboardShortcuts();

    // Load sound preference
    soundEnabled = localStorage.getItem('mcgg_sound') !== 'false';
    updateSoundButton();
}

function generatePlayerInputs() {
    const container = document.getElementById('playerInputs');
    container.innerHTML = '';

    for (let i = 1; i <= 7; i++) {
        const inputGroup = document.createElement('div');
        inputGroup.className = 'input-group';
        inputGroup.innerHTML = `
            <label class="input-label">
                <span class="input-number">${i}</span>
                Musuh #${i}
            </label>
            <input type="text" class="input-field" id="player${i}" 
                   placeholder="Nama musuh ke-${i}..." 
                   onkeypress="handleEnterKey(event, ${i})">
        `;
        container.appendChild(inputGroup);
    }
}

function handleEnterKey(event, currentIndex) {
    if (event.key === 'Enter') {
        if (currentIndex < 7) {
            document.getElementById(`player${currentIndex + 1}`).focus();
        } else {
            startGame();
        }
    }
}

// ===== KEYBOARD SHORTCUTS =====
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Only work when game phase is active
        if (!gameStarted) return;

        const prediction = getPrediction();
        const aliveEnemies = enemies.filter(en => en.status === 'alive');

        // Number keys 1-7 to fight enemy
        if (e.key >= '1' && e.key <= '7') {
            const index = parseInt(e.key) - 1;
            if (index < aliveEnemies.length) {
                handleFight(aliveEnemies[index].name);
                playSound('fight');
            }
        }

        // Space to skip creep round
        if (e.code === 'Space' && prediction.type === 'PVE') {
            e.preventDefault();
            skipCreepRound();
        }

        // Ctrl+Z to undo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            undo();
        }

        // R to reset (with confirmation)
        if (e.key === 'r' || e.key === 'R') {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                resetGame();
            }
        }

        // M to toggle sound
        if (e.key === 'm' || e.key === 'M') {
            toggleSound();
        }
    });
}

// ===== GAME START =====
function startGame() {
    enemies = [];
    opponentsCycle = [];
    currentStage = 1;
    currentSubRound = 1;
    foughtThisCycle = new Set();
    battleHistory = [];
    gameStarted = true;

    for (let i = 1; i <= 7; i++) {
        const input = document.getElementById(`player${i}`);
        const name = input.value.trim() || `Musuh ${i}`;
        enemies.push({ name: name, status: 'alive', wins: 0, losses: 0 });
    }

    document.getElementById('setupPhase').classList.add('hidden');
    document.getElementById('gamePhase').classList.remove('hidden');

    // Update phase indicators
    document.querySelector('#phase1 .phase-dot').classList.remove('active');
    document.querySelector('#phase2 .phase-dot').classList.add('active');

    saveSession();
    updateUI();
    playSound('complete');
    showToast('🎮 Game dimulai! Gunakan angka 1-7 untuk input cepat', 'success');
}

// ===== CORE LOGIC - PREDIKSI =====
function advanceRound() {
    currentSubRound++;
    if (currentStage === 1 && currentSubRound > 4) {
        currentSubRound = 1;
        currentStage++;
    } else if (currentStage > 1 && currentSubRound > 6) {
        currentSubRound = 1;
        currentStage++;
    }
}

function getPrediction() {
    const roundID = `${currentStage}-${currentSubRound}`;
    const aliveEnemies = enemies.filter(e => e.status === "alive");

    // A. Cek Ronde Monster (PVE)
    if (creepRounds.includes(roundID)) {
        return {
            type: "PVE",
            msg: "Ronde Monster (Creep)",
            icon: "🐉",
            prediction: null,
            list: []
        };
    }

    // B. Cek jika hanya 1 musuh tersisa (DUEL)
    if (aliveEnemies.length === 1) {
        return {
            type: "DUEL",
            msg: `DUEL MAUT! Pasti lawan: ${aliveEnemies[0].name}`,
            icon: "⚔️",
            prediction: aliveEnemies[0].name,
            list: [{ name: aliveEnemies[0].name, isPrediction: true, fought: false }]
        };
    }

    // C. Jika tidak ada musuh tersisa (VICTORY)
    if (aliveEnemies.length === 0) {
        return {
            type: "VICTORY",
            msg: "KEMENANGAN! Semua musuh telah dieliminasi!",
            icon: "🏆",
            prediction: null,
            list: []
        };
    }

    // D. Jika data siklus belum lengkap (LEARNING PHASE)
    if (opponentsCycle.length < aliveEnemies.length) {
        const foughtCount = foughtThisCycle.size;
        const totalAlive = aliveEnemies.length;

        return {
            type: "LEARNING",
            msg: `Fase Mencatat Pola... (${foughtCount}/${totalAlive} dilawan)`,
            icon: "📚",
            prediction: null,
            foughtCount: foughtCount,
            totalAlive: totalAlive,
            list: aliveEnemies.map(e => ({
                name: e.name,
                isPrediction: false,
                fought: foughtThisCycle.has(e.name)
            }))
        };
    }

    // E. PREDIKSI PASTI (Playback Siklus)
    let nextOpponent = null;
    for (let i = 0; i < opponentsCycle.length; i++) {
        const name = opponentsCycle[i];
        const enemy = enemies.find(e => e.name === name);
        if (enemy && enemy.status === "alive") {
            nextOpponent = name;
            break;
        }
    }

    if (nextOpponent) {
        return {
            type: "PREDICTION",
            msg: `TARGET TERKUNCI: ${nextOpponent}`,
            icon: "🎯",
            prediction: nextOpponent,
            list: aliveEnemies.map(e => ({
                name: e.name,
                isPrediction: e.name === nextOpponent,
                fought: false
            }))
        };
    } else {
        // Fallback jika tidak ada prediksi
        return {
            type: "LEARNING",
            msg: "Menunggu Input...",
            icon: "📚",
            prediction: null,
            foughtCount: 0,
            totalAlive: aliveEnemies.length,
            list: aliveEnemies.map(e => ({ name: e.name, isPrediction: false, fought: false }))
        };
    }
}

// ===== EVENT HANDLERS =====
function handleFight(enemyName) {
    // Save state before action for undo
    saveState();

    const roundID = `${currentStage}-${currentSubRound}`;
    const prevPrediction = getPrediction();

    if (!creepRounds.includes(roundID)) {
        // Tambah ke tracking "sudah dilawan"
        foughtThisCycle.add(enemyName);

        // Record battle history
        battleHistory.push({
            round: roundID,
            opponent: enemyName,
            timestamp: new Date().toISOString()
        });

        // Update cycle
        const index = opponentsCycle.indexOf(enemyName);
        if (index === -1) {
            opponentsCycle.push(enemyName);
        } else {
            opponentsCycle.splice(index, 1);
            opponentsCycle.push(enemyName);
        }

        // Cek jika cycle lengkap
        const aliveEnemies = enemies.filter(e => e.status === "alive");
        if (opponentsCycle.length === aliveEnemies.length) {
            // Cycle complete, reset fought tracking untuk cycle berikutnya
            foughtThisCycle.clear();
            playSound('complete');
            showToast('🔄 Siklus lengkap! Prediksi sekarang aktif!', 'success');
        }
    }

    advanceRound();
    saveSession();
    updateUI();

    // Check if we just entered prediction mode
    const newPrediction = getPrediction();
    if (prevPrediction.type === 'LEARNING' && newPrediction.type === 'PREDICTION') {
        playSound('predict');
    }
}

function handleEliminate(enemyName) {
    // Save state before action for undo
    saveState();

    const target = enemies.find(e => e.name === enemyName);
    if (target) {
        target.status = "dead";
        // Hapus dari foughtThisCycle jika ada
        foughtThisCycle.delete(enemyName);
        playSound('eliminate');
        showToast(`💀 ${enemyName} tereliminasi!`, 'warning');
    }
    saveSession();
    updateUI();
}

function skipCreepRound() {
    // Save state before action for undo
    saveState();

    advanceRound();
    saveSession();
    updateUI();
    showToast('⏭️ Melewati ronde monster', 'info');
}

// ===== SOUND TOGGLE =====
function toggleSound() {
    soundEnabled = !soundEnabled;
    localStorage.setItem('mcgg_sound', soundEnabled);
    updateSoundButton();
    if (soundEnabled) {
        playSound('alert');
    }
    showToast(soundEnabled ? '🔊 Suara aktif' : '🔇 Suara mati', 'info');
}

function updateSoundButton() {
    const btn = document.getElementById('soundToggle');
    if (btn) {
        btn.textContent = soundEnabled ? '🔊' : '🔇';
    }
}

// ===== TOAST NOTIFICATION =====
function showToast(message, type = 'info') {
    // Remove existing toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => toast.classList.add('show'), 10);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ===== UI UPDATE =====
function updateUI() {
    const roundString = `${currentStage}-${currentSubRound}`;
    const prediction = getPrediction();
    const aliveEnemies = enemies.filter(e => e.status === "alive");
    const deadEnemies = enemies.filter(e => e.status === "dead");

    // Update Round Display
    document.getElementById('roundNumber').textContent = roundString;

    // Update round info & icon
    const roundInfo = document.getElementById('roundInfo');
    const roundIcon = document.getElementById('roundIcon');

    switch (prediction.type) {
        case "PVE":
            roundInfo.textContent = "Monster Round";
            roundIcon.textContent = "🐉";
            break;
        case "DUEL":
            roundInfo.textContent = "Final Duel!";
            roundIcon.textContent = "⚔️";
            break;
        case "LEARNING":
            roundInfo.textContent = "Learning Phase";
            roundIcon.textContent = "📚";
            break;
        case "VICTORY":
            roundInfo.textContent = "Victory!";
            roundIcon.textContent = "🏆";
            break;
        default:
            roundInfo.textContent = "Prediction Active";
            roundIcon.textContent = "🎯";
    }

    // Update Stats
    document.getElementById('aliveCount').textContent = aliveEnemies.length;
    document.getElementById('eliminatedCount').textContent = deadEnemies.length;
    document.getElementById('memorySize').textContent = opponentsCycle.length;

    // Update Prediction Box
    const predBox = document.getElementById('predictionBox');
    const predIcon = document.getElementById('predictionIcon');
    const predLabel = document.getElementById('predictionLabel');
    const predMsg = document.getElementById('predictionMsg');

    predIcon.textContent = prediction.icon;
    predMsg.textContent = prediction.msg;

    // Reset classes
    predBox.className = 'prediction-box';

    switch (prediction.type) {
        case "PVE":
            predBox.classList.add('pve');
            predLabel.textContent = "Monster Round";
            break;
        case "DUEL":
            predBox.classList.add('duel');
            predLabel.textContent = "Final Battle";
            break;
        case "LEARNING":
            predBox.classList.add('learning');
            predLabel.textContent = "Learning Phase";
            break;
        case "VICTORY":
            predBox.classList.add('victory');
            predLabel.textContent = "Game Over";
            break;
        case "PREDICTION":
            predBox.classList.add('duel');
            predLabel.textContent = "Prediksi Akurat";
            break;
    }

    // Update Learning Progress Bar
    const progressEl = document.getElementById('learningProgress');
    if (prediction.type === "LEARNING" && prediction.foughtCount !== undefined) {
        progressEl.classList.remove('hidden');
        document.getElementById('progressText').textContent =
            `${prediction.foughtCount}/${prediction.totalAlive}`;
        const percentage = (prediction.foughtCount / prediction.totalAlive) * 100;
        document.getElementById('progressFill').style.width = `${percentage}%`;
    } else {
        progressEl.classList.add('hidden');
    }

    // Update Enemy List
    const enemyListEl = document.getElementById('enemyList');
    enemyListEl.innerHTML = '';

    // Show skip button for PVE rounds
    if (prediction.type === "PVE") {
        const skipCard = document.createElement('div');
        skipCard.className = 'enemy-card fade-in';
        skipCard.style.justifyContent = 'center';
        skipCard.innerHTML = `
            <button class="btn btn-primary" onclick="skipCreepRound()" style="width: 100%;">
                <span class="btn-icon">⏭️</span>
                <span>Lewati Ronde Monster (Space)</span>
            </button>
        `;
        enemyListEl.appendChild(skipCard);
    }

    // Show alive enemies
    prediction.list.forEach((enemy, index) => {
        const card = document.createElement('div');
        let cardClass, statusClass, badgeClass, badgeText;

        if (prediction.type === 'LEARNING') {
            if (enemy.fought) {
                cardClass = 'fought';
                statusClass = 'fought';
                badgeClass = 'fought';
                badgeText = '✓ Sudah';
            } else {
                cardClass = 'unknown';
                statusClass = 'unknown';
                badgeClass = 'unknown';
                badgeText = '? Belum';
            }
        } else {
            if (enemy.isPrediction) {
                cardClass = 'danger';
                statusClass = 'danger';
                badgeClass = 'danger';
                badgeText = '🎯 TARGET';
            } else {
                cardClass = 'safe';
                statusClass = 'safe';
                badgeClass = 'safe';
                badgeText = 'SAFE';
            }
        }

        const shortcutKey = index + 1;
        card.className = `enemy-card ${cardClass} fade-in`;
        card.style.animationDelay = `${index * 0.05}s`;
        card.innerHTML = `
            <div class="enemy-info">
                <div class="enemy-status ${statusClass}"></div>
                <span class="shortcut-key">${shortcutKey}</span>
                <span class="enemy-name">${enemy.name}</span>
                <span class="enemy-badge ${badgeClass}">${badgeText}</span>
            </div>
            <div class="enemy-actions">
                <button class="btn-action btn-fight" onclick="handleFight('${enemy.name}')">
                    ⚔️ Lawan
                </button>
                <button class="btn-action btn-eliminate" onclick="handleEliminate('${enemy.name}')">
                    💀 Mati
                </button>
            </div>
        `;
        enemyListEl.appendChild(card);
    });

    // Show eliminated enemies
    deadEnemies.forEach((enemy, index) => {
        const card = document.createElement('div');
        card.className = 'enemy-card eliminated fade-in';
        card.style.animationDelay = `${(prediction.list.length + index) * 0.05}s`;
        card.innerHTML = `
            <div class="enemy-info">
                <div class="enemy-status eliminated"></div>
                <span class="enemy-name" style="text-decoration: line-through;">${enemy.name}</span>
                <span class="enemy-badge" style="background: rgba(74,74,90,0.3); color: var(--eliminated-color);">ELIMINASI</span>
            </div>
        `;
        enemyListEl.appendChild(card);
    });

    // Update Cycle Display
    updateCycleDisplay();
}

function updateCycleDisplay() {
    const historyEl = document.getElementById('historyDisplay');

    if (opponentsCycle.length === 0) {
        historyEl.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📝</span>
                <p>Belum ada data siklus.</p>
            </div>
        `;
    } else {
        let cycleHTML = '<div class="cycle-visual">';

        opponentsCycle.forEach((name, index) => {
            const enemy = enemies.find(e => e.name === name);
            const isDead = enemy && enemy.status === 'dead';
            const itemClass = isDead ? 'dead' : 'alive';

            if (index > 0) {
                cycleHTML += '<span class="cycle-arrow">→</span>';
            }
            cycleHTML += `<span class="cycle-item ${itemClass}">${name}</span>`;
        });

        cycleHTML += '</div>';
        cycleHTML += `
            <div class="cycle-info">
                <span>🔁</span>
                <span>Siklus: ${opponentsCycle.length} entries</span>
            </div>
        `;

        historyEl.innerHTML = cycleHTML;
    }
}

// ===== RESET GAME =====
function resetGame() {
    if (confirm('Yakin ingin reset dan mulai pertandingan baru?')) {
        enemies = [];
        opponentsCycle = [];
        currentStage = 1;
        currentSubRound = 1;
        foughtThisCycle = new Set();
        battleHistory = [];
        gameStarted = false;

        clearSession();

        document.getElementById('gamePhase').classList.add('hidden');
        document.getElementById('setupPhase').classList.remove('hidden');

        // Reset phase indicators
        document.querySelector('#phase2 .phase-dot').classList.remove('active');
        document.querySelector('#phase1 .phase-dot').classList.add('active');

        generatePlayerInputs();
        showToast('🔄 Game direset!', 'info');
    }
}

// ===== START APPLICATION =====
document.addEventListener('DOMContentLoaded', init);
