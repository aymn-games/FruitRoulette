/* =========================================================
   FRUIT ROULETTE — script.js
   All game logic:
     - host player input / removal
     - wheel build + spin + random winner
     - automatic fruit-crate popup after each spin
     - 4 crates: 3 safe fruit, 1 Hidden Character (elimination)
   ========================================================= */
(function () {
  'use strict';

  /* ============ STATE ============ */
  const state = {
    players: [],        // { id, name, color } — still in the game
    fullRoster: [],      // everyone loaded this session, incl. eliminated (for Rematch)
    isSpinning: false,
    currentRotation: 0,
    muted: false,
    activeWinner: null,
    hiddenSlotIndices: [],
    crateResolved: false
  };

  const PALETTE = ['#FF4D6D', '#FFA630', '#8BD450', '#9B6BF2', '#FFD23F', '#35C98D'];

  // Safe fruit slots. Swap/extend freely — just keep matching files in folder_images/.
  const SAFE_FRUITS = [
    { name: 'تفاح',    img: 'folder_images/apple.png',      emoji: '🍎' },
    { name: 'موز',     img: 'folder_images/banana.png',     emoji: '🍌' },
    { name: 'عنب',     img: 'folder_images/grape.png',      emoji: '🍇' },
    { name: 'برتقال',  img: 'folder_images/orange.png',     emoji: '🍊' },
    { name: 'أناناس',  img: 'folder_images/pineapple.png',  emoji: '🍍' },
    { name: 'فراولة',  img: 'folder_images/strawberry.png', emoji: '🍓' },
    { name: 'كيوي',    img: 'folder_images/kiwi.png',       emoji: '🥝' }
  ];

  // The elimination slot.
  const HIDDEN_CHARACTER = {
    name: 'الشخصية الخفية',
    img: 'folder_images/hidden_character.png',
    emoji: '💀'
  };

  const CRATE_COUNT = 4;

  /* ============ DOM REFS ============ */
  const namesInput = document.getElementById('namesInput');
  const loadBtn = document.getElementById('loadBtn');
  const spinBtn = document.getElementById('spinBtn');
  const shuffleBtn = document.getElementById('shuffleBtn');
  const resetWheelBtn = document.getElementById('resetWheelBtn');
  const playerListEl = document.getElementById('playerList');
  const playerCountVal = document.getElementById('playerCountVal');

  const currentTurnName = document.getElementById('currentTurnName');
  const wheel = document.getElementById('wheel');
  const wheelEmpty = document.getElementById('wheelEmpty');
  const wheelRing = document.getElementById('wheelRing');
  const hub = document.getElementById('hub');
  const hubImg = document.getElementById('hubImg');
  const hubFallback = document.getElementById('hubFallback');

  const winnerStrip = document.getElementById('winnerStrip');
  const winnerStripName = document.getElementById('winnerStripName');

  const fruitOverlay = document.getElementById('fruitOverlay');
  const fruitPopupPlayer = document.getElementById('fruitPopupPlayer');
  const crateGrid = document.getElementById('crateGrid');
  const crateResult = document.getElementById('crateResult');
  const resultText = document.getElementById('resultText');
  const continueBtn = document.getElementById('continueBtn');
  const eliminateBtn = document.getElementById('eliminateBtn');

  const winnerOverlay = document.getElementById('winnerOverlay');
  const winnerNameEl = document.getElementById('winnerName');
  const rematchBtn = document.getElementById('rematchBtn');
  const newGameBtn = document.getElementById('newGameBtn');

  const soundBtn = document.getElementById('soundBtn');
  const soundIcon = document.getElementById('soundIcon');
  const liveRegion = document.getElementById('liveRegion');
  const roundCounterVal = document.getElementById('roundCounterVal');
  const fruitBg = document.getElementById('fruitBg');
  const roundTimerBox = document.getElementById('roundTimerBox');
  const roundTimerVal = document.getElementById('roundTimerVal');
  const fruitModalSub = document.getElementById('fruitModalSub');

  /* ============ IMAGE FALLBACK ============
     If an image referenced in folder_images/ hasn't been added yet,
     fall back to an emoji so the game still demos cleanly. */
  function bindImageFallback(imgEl, fallbackEl) {
    function showFallback() {
      imgEl.hidden = true;
      if (fallbackEl) fallbackEl.hidden = false;
    }
    function showImage() {
      imgEl.hidden = false;
      if (fallbackEl) fallbackEl.hidden = true;
    }
    imgEl.addEventListener('error', showFallback);
    imgEl.addEventListener('load', showImage);
    if (imgEl.complete) {
      if (imgEl.naturalWidth === 0) showFallback();
      else showImage();
    }
  }
  bindImageFallback(hubImg, hubFallback);

  /* ============ SOUND (Web Audio API, no external files) ============ */
  let audioCtx = null;
  function getCtx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function tone(freq, duration, type, gainPeak, delay) {
    if (state.muted) return;
    try {
      const ctx = getCtx();
      const startAt = ctx.currentTime + (delay || 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(gainPeak || 0.12, startAt + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + duration + 0.02);
    } catch (e) { /* audio unavailable — fail silently */ }
  }

  function playClick() { tone(720, 0.06, 'square', 0.08); }
  function playTick() { tone(560, 0.05, 'square', 0.07); }
  function playChime() {
    tone(523.25, 0.22, 'sine', 0.12, 0);
    tone(659.25, 0.22, 'sine', 0.12, 0.1);
    tone(783.99, 0.3, 'sine', 0.14, 0.2);
  }
  function playBoom() {
    tone(120, 0.35, 'sawtooth', 0.16, 0);
    tone(70, 0.4, 'sine', 0.18, 0.04);
  }

  function scheduleSpinTicks(totalDurationMs) {
    let elapsed = 0;
    let delay = 55;
    function step() {
      if (elapsed >= totalDurationMs - 150) return;
      playTick();
      delay = Math.min(delay * 1.09, 260);
      elapsed += delay;
      setTimeout(step, delay);
    }
    step();
  }

  soundBtn.addEventListener('click', function () {
    state.muted = !state.muted;
    soundBtn.setAttribute('aria-pressed', String(state.muted));
    soundIcon.textContent = state.muted ? '🔇' : '🔊';
    soundBtn.querySelector('.btn-label').textContent = state.muted ? 'الصوت مغلق' : 'الصوت مفعّل';
    if (!state.muted) getCtx();
  });

  /* ============ FLYING FRUIT BACKGROUND ============ */
  const BG_FRUITS = ['🍉', '🍓', '🍇', '🍍', '🍌', '🍊', '🥝', '🍒', '🍑'];
  function buildFruitBackground() {
    if (!fruitBg) return;
    const count = 18;
    for (let i = 0; i < count; i++) {
      const el = document.createElement('span');
      el.textContent = BG_FRUITS[Math.floor(Math.random() * BG_FRUITS.length)];
      const left = Math.random() * 100;
      const duration = 14 + Math.random() * 16;
      const delay = Math.random() * -30;
      const size = 1.4 + Math.random() * 1.6;
      const drift = (Math.random() * 160 - 80) + 'px';
      el.style.left = left + 'vw';
      el.style.fontSize = size + 'rem';
      el.style.animationDuration = duration + 's';
      el.style.animationDelay = delay + 's';
      el.style.setProperty('--drift', drift);
      fruitBg.appendChild(el);
    }
  }
  buildFruitBackground();

  /* ============ ROUND COUNTER ============ */
  let roundCount = 0;
  function incrementRoundCounter() {
    roundCount += 1;
    if (roundCounterVal) roundCounterVal.textContent = String(roundCount);
  }
  function resetRoundCounter() {
    roundCount = 0;
    if (roundCounterVal) roundCounterVal.textContent = '0';
  }

  /* ============ ROUND TIMER (4 min, escalating elimination crates) ============
     - Starts the moment the first crate popup appears (i.e. right after the
       first spin of the wheel).
     - Every time the crate popup opens, 10 seconds are deducted instantly
       and the countdown pauses.
     - The countdown resumes the moment the popup closes.
     - Whenever the timer reaches 00:00, the number of "hidden" elimination
       crates goes up by one (capped so at least one crate stays safe), and
       the timer resets to 4:00 and keeps going. */
  const ROUND_DURATION = 240; // 4 minutes, in seconds
  const POPUP_TIME_PENALTY = 10;

  let roundTimerRemaining = ROUND_DURATION;
  let roundTimerInterval = null;
  let roundTimerStarted = false;
  let eliminationLevel = 1; // number of hidden crates currently in play

  function formatTime(totalSeconds) {
    const sec = Math.max(0, totalSeconds);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function updateTimerDisplay() {
    if (roundTimerVal) roundTimerVal.textContent = formatTime(roundTimerRemaining);
    if (roundTimerBox) roundTimerBox.classList.toggle('urgent', roundTimerRemaining > 0 && roundTimerRemaining <= 30);
  }

  function stopRoundTimerInterval() {
    if (roundTimerInterval) {
      window.clearInterval(roundTimerInterval);
      roundTimerInterval = null;
    }
    if (roundTimerBox) roundTimerBox.classList.add('paused');
  }

  function startRoundTimerInterval() {
    stopRoundTimerInterval();
    if (roundTimerBox) roundTimerBox.classList.remove('paused');
    roundTimerInterval = window.setInterval(tickRoundTimer, 1000);
  }

  function tickRoundTimer() {
    if (roundTimerRemaining <= 0) {
      handleTimerExpire();
      return;
    }
    roundTimerRemaining -= 1;
    updateTimerDisplay();
    if (roundTimerRemaining <= 0) handleTimerExpire();
  }

  function handleTimerExpire() {
    const maxHidden = CRATE_COUNT - 1; // always keep at least one safe crate
    if (eliminationLevel < maxHidden) {
      eliminationLevel += 1;
      liveRegion.textContent = 'ارتفعت صعوبة الجولة! الآن ' + eliminationLevel + ' من الصناديق تخفي الشخصية.';
    }
    roundTimerRemaining = ROUND_DURATION;
    updateTimerDisplay();
  }

  // Called right when the crate popup opens (every spin, including the first).
  function onFruitPopupOpen() {
    if (!roundTimerStarted) {
      roundTimerStarted = true;
      roundTimerRemaining = ROUND_DURATION;
    }
    stopRoundTimerInterval();
    roundTimerRemaining = Math.max(0, roundTimerRemaining - POPUP_TIME_PENALTY);
    updateTimerDisplay();
    if (roundTimerRemaining <= 0) handleTimerExpire();
  }

  // Called right when the crate popup closes.
  function onFruitPopupClose() {
    if (!roundTimerStarted) return;
    if (state.players.length < 2) return; // game already decided, no need to keep ticking
    startRoundTimerInterval();
  }

  function resetRoundTimer() {
    stopRoundTimerInterval();
    roundTimerStarted = false;
    roundTimerRemaining = ROUND_DURATION;
    eliminationLevel = 1;
    updateTimerDisplay();
    if (roundTimerBox) roundTimerBox.classList.remove('paused', 'urgent');
  }

  /* ============ PLAYER MANAGEMENT ============ */
  let idCounter = 0;

  function parseNames(raw) {
    return raw
      .split(/[\n,]/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
  }

  function loadPlayers() {
    const names = parseNames(namesInput.value);
    if (names.length === 0) return;

    names.forEach(function (name) {
      const player = {
        id: 'p' + (idCounter++),
        name: name,
        color: PALETTE[state.players.length % PALETTE.length]
      };
      state.players.push(player);
      state.fullRoster.push(player);
    });

    namesInput.value = '';
    winnerStrip.classList.remove('show');
    renderPlayerList();
    buildWheel();
    playClick();
  }

  function removePlayer(id) {
    state.players = state.players.filter(function (p) { return p.id !== id; });
    renderPlayerList();
    buildWheel();
    checkGameOver();
  }

  function renderPlayerList() {
    playerListEl.innerHTML = '';

    if (state.players.length === 0) {
      const note = document.createElement('div');
      note.className = 'empty-note';
      note.textContent = 'لا يوجد لاعبون بعد. أضف الأسماء أعلاه وقم بتحميلها.';
      playerListEl.appendChild(note);
    } else {
      state.players.forEach(function (p) {
        const row = document.createElement('div');
        row.className = 'player-chip';

        const nameWrap = document.createElement('div');
        nameWrap.className = 'name-wrap';
        const swatch = document.createElement('span');
        swatch.className = 'swatch';
        swatch.style.color = p.color;
        swatch.style.background = p.color;
        const nameSpan = document.createElement('span');
        nameSpan.textContent = p.name;
        nameWrap.appendChild(swatch);
        nameWrap.appendChild(nameSpan);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.type = 'button';
        removeBtn.textContent = '✕';
        removeBtn.setAttribute('aria-label', 'إزالة ' + p.name);
        removeBtn.addEventListener('click', function () {
          playClick();
          removePlayer(p.id);
        });

        row.appendChild(nameWrap);
        row.appendChild(removeBtn);
        playerListEl.appendChild(row);
      });
    }

    playerCountVal.textContent = String(state.players.length);
    spinBtn.disabled = state.players.length < 2 || state.isSpinning;
  }

  function shufflePlayers() {
    if (state.isSpinning || state.players.length < 2) return;
    for (let i = state.players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = state.players[i];
      state.players[i] = state.players[j];
      state.players[j] = tmp;
    }
    state.players.forEach(function (p, i) { p.color = PALETTE[i % PALETTE.length]; });
    renderPlayerList();
    buildWheel();
    playClick();
  }
  shuffleBtn.addEventListener('click', shufflePlayers);

  function snapWheelTo(deg) {
    wheel.style.transition = 'none';
    wheel.style.transform = 'rotate(' + deg + 'deg)';
    void wheel.offsetWidth; // force reflow before re-enabling the transition
    wheel.style.transition = '';
  }

  function resetWheelPosition() {
    if (state.isSpinning) return;
    state.currentRotation = 0;
    state.activeWinner = null;
    snapWheelTo(0);
    currentTurnName.textContent = '—';
    playClick();
  }
  resetWheelBtn.addEventListener('click', resetWheelPosition);

  /* ============ WHEEL BUILDING ============ */
  function buildWheel() {
    wheel.innerHTML = '';
    const n = state.players.length;

    if (n < 2) {
      const msg = document.createElement('div');
      msg.className = 'wheel-empty';
      msg.id = 'wheelEmpty';
      msg.textContent = n === 1
        ? 'بقي لاعب واحد — إنه الفائز! 🏆'
        : 'أضف لاعبين اثنين على الأقل لبناء العجلة 🍓';
      wheel.appendChild(msg);
      wheel.style.background = 'rgba(255,255,255,0.03)';
      buildBulbs();
      return;
    }

    const segAngle = 360 / n;
    const gradientParts = [];

    state.players.forEach(function (p, i) {
      const start = (segAngle * i).toFixed(3);
      const end = (segAngle * (i + 1)).toFixed(3);
      gradientParts.push(p.color + ' ' + start + 'deg ' + end + 'deg');
    });

    wheel.style.background = 'conic-gradient(from 0deg, ' + gradientParts.join(', ') + ')';

    state.players.forEach(function (p, i) {
      const midAngle = segAngle * i + segAngle / 2;
      const labelWrap = document.createElement('div');
      labelWrap.className = 'wheel-label';
      labelWrap.style.transform = 'rotate(' + midAngle + 'deg)';

      const span = document.createElement('span');
      span.textContent = p.name;
      labelWrap.appendChild(span);
      wheel.appendChild(labelWrap);
    });

    buildBulbs();
  }

  function buildBulbs() {
    const existing = wheelRing.querySelectorAll('.bulb');
    existing.forEach(function (b) { b.remove(); });

    const count = 26;
    const radius = 50; // percent of ring
    for (let i = 0; i < count; i++) {
      const angle = (360 / count) * i;
      const rad = angle * Math.PI / 180;
      const x = 50 + radius * Math.sin(rad);
      const y = 50 - radius * Math.cos(rad);
      const bulb = document.createElement('div');
      bulb.className = 'bulb';
      bulb.style.left = 'calc(' + x + '% - 4.5px)';
      bulb.style.top = 'calc(' + y + '% - 4.5px)';
      bulb.style.animationDelay = (i * 0.06) + 's';
      bulb.style.background = i % 3 === 0 ? 'var(--watermelon)' : (i % 3 === 1 ? 'var(--lime)' : 'var(--banana)');
      wheelRing.appendChild(bulb);
    }
  }

  /* ============ SPIN + RANDOM WINNER ============ */
  function spin() {
    if (state.isSpinning || state.players.length < 2) return;

    state.isSpinning = true;
    spinBtn.disabled = true;
    currentTurnName.textContent = '…';
    getCtx();

    const n = state.players.length;
    const winnerIndex = Math.floor(Math.random() * n);
    const winner = state.players[winnerIndex];
    const segAngle = 360 / n;
    const thetaCenter = segAngle * winnerIndex + segAngle / 2;

    const extraSpins = 6 + Math.floor(Math.random() * 3); // 6-8 full turns
    const currentMod = state.currentRotation % 360;
    const target = extraSpins * 360 + (360 - thetaCenter);
    const newRotation = state.currentRotation - currentMod + target;

    state.currentRotation = newRotation;
    wheel.style.transform = 'rotate(' + newRotation + 'deg)';

    scheduleSpinTicks(4600);

    window.clearTimeout(spin._timeout);
    spin._timeout = window.setTimeout(function () {
      state.isSpinning = false;
      state.activeWinner = winner;
      currentTurnName.textContent = winner.name;
      liveRegion.textContent = 'اختارت العجلة ' + winner.name + '.';
      incrementRoundCounter();
      playChime();
      openFruitPopup(winner); // automatic popup after each spin
      spinBtn.disabled = state.players.length < 2;
    }, 4650);
  }
  spinBtn.addEventListener('click', spin);
  loadBtn.addEventListener('click', loadPlayers);

  namesInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) loadPlayers();
  });

  /* ============ FRUIT CRATE POPUP ============
     3 safe fruit slots + 1 Hidden Character slot, shuffled into
     random positions every time. */
  function pickSafeFruits(count) {
    const pool = SAFE_FRUITS.slice().sort(function () { return Math.random() - 0.5; });
    const picked = [];
    for (let i = 0; i < count; i++) picked.push(pool[i % pool.length]);
    return picked;
  }

  function openFruitPopup(winner) {
    onFruitPopupOpen(); // start/deduct/pause the 4-minute round timer

    fruitPopupPlayer.textContent = winner.name;
    crateResult.classList.remove('show');
    resultText.textContent = '';
    continueBtn.hidden = true;
    eliminateBtn.hidden = true;
    state.crateResolved = false;

    const hiddenCount = Math.min(eliminationLevel, CRATE_COUNT - 1);
    const hiddenIndices = [];
    while (hiddenIndices.length < hiddenCount) {
      const idx = Math.floor(Math.random() * CRATE_COUNT);
      if (hiddenIndices.indexOf(idx) === -1) hiddenIndices.push(idx);
    }
    state.hiddenSlotIndices = hiddenIndices;

    if (fruitModalSub) {
      fruitModalSub.textContent = hiddenCount === 1
        ? 'اختر صندوقًا واحدًا. صندوق واحد فقط يخفي الشخصية — إذا اخترته يتم إقصاؤك.'
        : 'اختر صندوقًا واحدًا. ' + hiddenCount + ' من أصل ' + CRATE_COUNT + ' صناديق تخفي الشخصية — إذا اخترت واحدًا منها يتم إقصاؤك.';
    }

    const safeFruits = pickSafeFruits(CRATE_COUNT - hiddenCount);

    crateGrid.innerHTML = '';
    let fruitCursor = 0;

    for (let i = 0; i < CRATE_COUNT; i++) {
      const isHidden = state.hiddenSlotIndices.indexOf(i) !== -1;
      const content = isHidden ? HIDDEN_CHARACTER : safeFruits[fruitCursor++];

      const crate = document.createElement('button');
      crate.className = 'crate';
      crate.type = 'button';
      crate.setAttribute('aria-label', 'الصندوق ' + (i + 1));
      crate.dataset.index = String(i);

      const inner = document.createElement('div');
      inner.className = 'crate-inner';

      const front = document.createElement('div');
      front.className = 'crate-face crate-front';
      front.innerHTML = '<span class="qmark">?</span><span class="crate-label">الصندوق ' + (i + 1) + '</span>';

      const back = document.createElement('div');
      back.className = 'crate-face crate-back ' + (isHidden ? 'is-hidden' : 'is-safe');

      const img = document.createElement('img');
      img.src = content.img;
      img.alt = content.name;
      const emojiFallback = document.createElement('span');
      emojiFallback.className = 'crate-emoji';
      emojiFallback.textContent = content.emoji;
      emojiFallback.hidden = true;
      back.appendChild(img);
      back.appendChild(emojiFallback);
      bindImageFallback(img, emojiFallback);

      inner.appendChild(front);
      inner.appendChild(back);
      crate.appendChild(inner);

      crate.addEventListener('click', function () {
        handleCrateClick(crate, isHidden, content);
      });

      crateGrid.appendChild(crate);
    }

    fruitOverlay.classList.add('active');
  }

  function handleCrateClick(crateEl, isHidden, content) {
    if (state.crateResolved) return;
    state.crateResolved = true;

    playClick();

    const all = crateGrid.querySelectorAll('.crate');
    all.forEach(function (c) { c.disabled = true; });
    crateEl.classList.add('flipped');

    window.setTimeout(function () {
      if (isHidden) {
        playBoom();
        resultText.className = 'result-text danger';
        resultText.textContent = '💀 ' + content.name + '! تم إقصاء ' + state.activeWinner.name + '!';
        eliminateBtn.hidden = false;
        continueBtn.hidden = true;
        liveRegion.textContent = 'تم إقصاء ' + state.activeWinner.name + '.';
      } else {
        playChime();
        resultText.className = 'result-text safe';
        resultText.textContent = '🍉 آمن! ' + state.activeWinner.name + ' ينجو من هذه الجولة.';
        continueBtn.hidden = false;
        eliminateBtn.hidden = true;
        liveRegion.textContent = state.activeWinner.name + ' بأمان.';
      }
      crateResult.classList.add('show');
    }, 650);
  }

  function closeFruitPopup() {
    fruitOverlay.classList.remove('active');
    state.activeWinner = null;
    onFruitPopupClose(); // resume the 4-minute round timer
  }

  continueBtn.addEventListener('click', function () {
    playClick();
    closeFruitPopup();
  });

  eliminateBtn.addEventListener('click', function () {
    playClick();
    if (state.activeWinner) removePlayer(state.activeWinner.id);
    closeFruitPopup();
  });

  fruitOverlay.addEventListener('click', function (e) {
    if (e.target === fruitOverlay && crateResult.classList.contains('show')) {
      closeFruitPopup();
    }
  });

  /* ============ GAME OVER / WINNER ============ */
  function checkGameOver() {
    if (state.players.length === 1) {
      const champion = state.players[0];
      winnerStripName.textContent = champion.name;
      winnerStrip.classList.add('show');
      spinBtn.disabled = true;
      stopRoundTimerInterval();
      openWinnerModal(champion);
    } else if (state.players.length === 0) {
      winnerStrip.classList.remove('show');
    }
  }

  function openWinnerModal(champion) {
    winnerNameEl.textContent = champion.name;
    liveRegion.textContent = champion.name + ' فاز باللعبة!';
    rematchBtn.hidden = state.fullRoster.length < 2;
    winnerOverlay.classList.add('active');
    playChime();
  }

  function closeWinnerModal() {
    winnerOverlay.classList.remove('active');
  }

  function resetGame() {
    state.players = [];
    state.fullRoster = [];
    state.isSpinning = false;
    state.activeWinner = null;
    state.currentRotation = 0;
    namesInput.value = '';
    winnerStrip.classList.remove('show');
    closeWinnerModal();
    snapWheelTo(0);
    currentTurnName.textContent = '—';
    resetRoundCounter();
    resetRoundTimer();
    renderPlayerList();
    buildWheel();
    namesInput.focus();
  }

  function rematchRound() {
    if (state.fullRoster.length < 2) return;
    state.players = state.fullRoster.slice();
    state.isSpinning = false;
    state.activeWinner = null;
    state.currentRotation = 0;
    winnerStrip.classList.remove('show');
    closeWinnerModal();
    snapWheelTo(0);
    currentTurnName.textContent = '—';
    liveRegion.textContent = 'بدأت جولة جديدة — عاد الجميع إلى اللعب!';
    resetRoundCounter();
    resetRoundTimer();
    renderPlayerList();
    buildWheel();
  }

  newGameBtn.addEventListener('click', function () { playClick(); resetGame(); });
  rematchBtn.addEventListener('click', function () { playClick(); rematchRound(); });

  /* ============ INIT ============ */
  renderPlayerList();
  buildWheel();
})();
