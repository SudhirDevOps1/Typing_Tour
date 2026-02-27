/**
 * script.js - SKSingh Typing App
 * Modular sections for levels, practice, games, keyboard and storage.
 *
 * Note: this file is purposely structured as a single module file but divided into
 * logical classes/objects for clarity: Storage, Levels, UI, TypingEngine, Games.
 */

/* ========== Storage Module ========== */
const Storage = {
  key: 'sks_typing_v1',
  defaults: {
    settings: {
      sound: true,
      highlight: true,
      hints: true,
      mode: 'structured',
      theme: 'theme-light',
      contrast: false,
      fontSize: 'medium'
    },
    stats: {
      // per-level stats will be stored under stats.levels[levelIndex]
      levels: {},
      totalMinutes: 0,
      streak: 0,
      attempts: 0,
      lastPracticeDate: null
    },
    scoreboard: {
      fallingWords: []
    }
  },
  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) { localStorage.setItem(this.key, JSON.stringify(this.defaults)); return JSON.parse(JSON.stringify(this.defaults)); }
      const parsed = JSON.parse(raw);
      // merge defaults for backward compatibility
      return deepMerge(JSON.parse(JSON.stringify(this.defaults)), parsed);
    } catch (e) {
      console.error('Storage load error', e);
      localStorage.setItem(this.key, JSON.stringify(this.defaults));
      return JSON.parse(JSON.stringify(this.defaults));
    }
  },
  save(data) {
    localStorage.setItem(this.key, JSON.stringify(data));
  }
};

function deepMerge(base, update) {
  for (let k in update) {
    if (update[k] && typeof update[k] === 'object' && !Array.isArray(update[k])) {
      base[k] = deepMerge(base[k] || {}, update[k]);
    } else {
      base[k] = update[k];
    }
  }
  return base;
}

/* ========== Levels Module (50 levels + random mode) ========== */
const Levels = (function(){
  // A lightweight programmatic level generator that produces 50 levels focusing on
  // finger/row progression. Each level has: name, targetKeys, samples (array of short strings), wpmTarget.
  const levels = [];
  const home = ['a','s','d','f','j','k','l',';'];
  const top = ['q','w','e','r','t','y','u','i','o','p'];
  const bottom = ['z','x','c','v','b','n','m',',','.','/'];

  function mkSamples(chars, duplicates = 6) {
    const arr = [];
    for (let i=0;i<duplicates;i++) {
      arr.push(chars.map(c=> c + (i%2===0? ' ' : '') ).join(' ').slice(0,60).trim());
    }
    return arr;
  }

  // Level progression: 1-10 home row, 11-20 top row, 21-30 bottom + combos, 31-40 mixed, 41-49 speed + accuracy, 50 random
  for (let i=1;i<=50;i++){
    let name = `Level ${i}`;
    let targetKeys = [];
    let samples = [];
    let wpmTarget = 15 + Math.floor(i*1.6);
    if (i <= 10) {
      targetKeys = home.slice(0, Math.min(home.length, Math.ceil(i/1.1)));
      samples = mkSamples(targetKeys);
      name = `Home Focus ${i}`;
    } else if (i <= 20) {
      targetKeys = top.slice(0, Math.min(top.length, i-10));
      samples = mkSamples(targetKeys);
      name = `Top Row ${i-10}`;
    } else if (i <= 30) {
      const pick = bottom.slice(0, Math.min(bottom.length, i-20));
      targetKeys = pick;
      samples = mkSamples(pick);
      name = `Bottom Row ${i-20}`;
    } else if (i <= 40) {
      // combos
      const mix = [...home.slice(0,4), ...top.slice(0,4)];
      targetKeys = mix;
      samples = mkSamples(mix, 8);
      name = `Combos ${i-30}`;
    } else if (i <= 49) {
      // sentences and higher complexity
      targetKeys = 'full';
      samples = [
        "Practice makes progress. Keep your fingers relaxed and eyes on the screen.",
        "Speed comes from accuracy. Aim for consistent correct keystrokes.",
        "The quick brown fox jumps over the lazy dog. Use proper posture."
      ];
      name = `Advanced ${i-40}`;
      wpmTarget += 10;
    } else {
      // level 50 random
      targetKeys = 'full';
      samples = [
        "Random mode unlocked. Type freely with full QWERTY text mixed in.",
        "Every key may appear here — practice everything!"
      ];
      name = 'Level 50 - Random Mode';
      wpmTarget += 20;
    }

    levels.push({
      index: i,
      name,
      targetKeys: Array.isArray(targetKeys) ? targetKeys.join(' ') : targetKeys,
      samples,
      wpmTarget
    });
  }

  // Expose getLevels and getLevel(index)
  return {
    all: levels,
    get(i){ return levels[i-1]; },
    count(){ return levels.length; }
  };
})();

/* ========== UI Module ========== */
const UI = (function(){
  // main DOM references
  const screens = document.querySelectorAll('.screen');
  const home = document.getElementById('home');
  const practice = document.getElementById('practice');
  const levelsScreen = document.getElementById('levels');
  const games = document.getElementById('games');
  const settings = document.getElementById('settings');

  const state = {
    currentScreen: 'home',
    storage: Storage.load()
  };

  function showScreen(name) {
    screens.forEach(s => {
      s.hidden = true;
      s.classList.remove('active');
    });
    const el = document.getElementById(name);
    if (!el) return;
    el.hidden = false;
    el.classList.add('active');
    state.currentScreen = name;
    // simple animated transition
  }

  /* HOME quick stats update */
  function updateHomeStats() {
    const s = state.storage;
    const streak = s.stats.streak || 0;
    document.getElementById('dailyStreak').textContent = streak;
    document.getElementById('avgWPM').textContent = calcAverageWPM();
    document.getElementById('totalMinutes').textContent = s.stats.totalMinutes || 0;
  }

  function calcAverageWPM(){
    const lv = state.storage.stats.levels || {};
    let sum=0, cnt=0;
    for (let k in lv){
      if (lv[k].bestWPM){
        sum += lv[k].bestWPM;
        cnt++;
      }
    }
    return cnt? Math.round(sum/cnt) : 0;
  }

  /* Levels grid */
  function renderLevelsGrid() {
    const grid = document.getElementById('levelsGrid');
    grid.innerHTML = '';
    const stats = state.storage.stats.levels || {};
    Levels.all.forEach(l => {
      const div = document.createElement('div');
      div.className = 'level-card';
      if (isLocked(l.index)) div.classList.add('locked');
      div.setAttribute('role','button');
      div.setAttribute('tabindex','0');
      div.innerHTML = `
        <h4>${l.name}</h4>
        <div>Targets: <small>${l.targetKeys}</small></div>
        <div>WPM Target: ${l.wpmTarget}</div>
        <div class="progress-row small"><div class="progress-bar"><div class="fill" style="width:${getProgressPct(l.index)}%"></div></div><small>${getProgressPct(l.index)}%</small></div>
      `;
      div.addEventListener('click', ()=> openLevel(l.index));
      grid.appendChild(div);
    });
  }

  function getProgressPct(index){
    const lv = state.storage.stats.levels || {};
    const id = `L${index}`;
    const s = lv[id];
    if (!s) return 0;
    return Math.min(100, Math.round((s.bestWPM || 0) / (Levels.get(index).wpmTarget || 30) * 100));
  }

  function isLocked(index) {
    if (state.storage.settings.mode === 'free') return false;
    if (index === 1) return false;
    const prev = state.storage.stats.levels[`L${index-1}`];
    if (!prev) return true;
    // unlocked if accuracy >= 80 or bestWPM >= target
    const acc = prev.bestAcc || 0;
    const wpm = prev.bestWPM || 0;
    const target = Levels.get(index-1).wpmTarget || 9999;
    return !(acc >= 80 || wpm >= target);
  }

  function openLevel(index) {
    if (isLocked(index) && state.storage.settings.mode === 'structured') {
      alert('This level is locked. Achieve ≥80% accuracy or hit the WPM target on the previous level to unlock.');
      return;
    }
    // set practice context
    TypingEngine.loadLevel(index);
    showScreen('practice');
  }

  /* Settings UI */
  function applySettingsToUI() {
    const s = state.storage.settings;
    document.getElementById('soundToggle').checked = !!s.sound;
    document.getElementById('highlightToggle').checked = !!s.highlight;
    document.getElementById('hintsToggle').checked = !!s.hints;
    document.getElementById('appMode').value = s.mode || 'structured';
    document.getElementById('themeSelect').value = s.theme || 'theme-light';
    document.getElementById('contrastToggle').checked = !!s.contrast;
    document.getElementById('fontSizeSelect').value = s.fontSize || 'medium';
    // apply theme
    document.body.className = s.theme || 'theme-light';
    document.body.dataset.contrast = s.contrast ? 'high' : 'normal';
    document.body.dataset.font = s.fontSize || 'medium';
  }

  /* Export progress as JSON/CSV */
  function exportProgress() {
    const payload = state.storage;
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sks_typing_progress_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* Scoreboard render */
  function renderScoreboard() {
    const sb = document.getElementById('scoreboard');
    const scores = state.storage.scoreboard.fallingWords || [];
    sb.innerHTML = '<h4>Falling Words Scores</h4>';
    if (!scores.length) { sb.innerHTML += '<div>No scores yet</div>'; return; }
    const ol = document.createElement('ol');
    scores.slice().sort((a,b)=>b.score-a.score).slice(0,10).forEach(s => {
      const li = document.createElement('li');
      li.textContent = `${s.name || 'Player'} — ${s.score} pts — ${new Date(s.when).toLocaleString()}`;
      ol.appendChild(li);
    });
    sb.appendChild(ol);
  }

  /* initialize event listeners for navigation */
  function bindNav() {
    document.getElementById('startPracticeBtn').addEventListener('click', ()=> {
      TypingEngine.loadLevel(1);
      showScreen('practice');
    });
    document.getElementById('levelsBtn').addEventListener('click', ()=> {
      renderLevelsGrid();
      showScreen('levels');
    });
    document.getElementById('speedTestBtn').addEventListener('click', ()=> {
      TypingEngine.loadRandomTest();
      showScreen('practice');
    });
    document.getElementById('gamesBtn').addEventListener('click', ()=> {
      renderGames();
      showScreen('games');
    });
    document.getElementById('settingsBtn').addEventListener('click', ()=> { applySettingsToUI(); showScreen('settings'); });
    document.getElementById('hintsBtn').addEventListener('click', ()=> { alert('Hints: Keep wrists straight. Use home row. Practice 10 minutes daily.'); });

    // back buttons
    document.querySelectorAll('.nav-back').forEach(btn => {
      btn.addEventListener('click', (e)=>{
        showScreen(btn.dataset.target || 'home');
        updateHomeStats();
      });
    });

    // practice controls
    document.getElementById('startTestBtn').addEventListener('click', ()=> TypingEngine.startTest());
    document.getElementById('resetTestBtn').addEventListener('click', ()=> TypingEngine.resetTest());
    document.getElementById('modeSelect').addEventListener('change', (e)=> {
      document.getElementById('modeSelect').value = e.target.value;
    });

    // toggles
    document.getElementById('toggleKeyboard').addEventListener('click', ()=> {
      const wrap = document.getElementById('keyboardWrap');
      wrap.hidden = !wrap.hidden;
      document.getElementById('toggleKeyboard').setAttribute('aria-pressed', String(!wrap.hidden));
    });
    document.getElementById('toggleHints').addEventListener('click', ()=> {
      const area = document.getElementById('hintArea');
      area.hidden = !area.hidden;
      document.getElementById('toggleHints').setAttribute('aria-pressed', String(!area.hidden));
    });
    document.getElementById('playSoundBtn').addEventListener('click', ()=> {
      state.storage.settings.sound = !state.storage.settings.sound;
      Storage.save(state.storage);
      applySettingsToUI();
    });

    // settings interactions
    document.getElementById('soundToggle').addEventListener('change', (e)=> {
      state.storage.settings.sound = e.target.checked; Storage.save(state.storage);
    });
    document.getElementById('highlightToggle').addEventListener('change', (e)=> {
      state.storage.settings.highlight = e.target.checked; Storage.save(state.storage);
    });
    document.getElementById('hintsToggle').addEventListener('change', (e)=> {
      state.storage.settings.hints = e.target.checked; Storage.save(state.storage);
    });
    document.getElementById('appMode').addEventListener('change', (e)=> {
      state.storage.settings.mode = e.target.value; Storage.save(state.storage);
      renderLevelsGrid();
    });
    document.getElementById('themeSelect').addEventListener('change', (e)=> {
      state.storage.settings.theme = e.target.value; Storage.save(state.storage); applySettingsToUI();
    });
    document.getElementById('contrastToggle').addEventListener('change', (e)=> {
      state.storage.settings.contrast = e.target.checked; Storage.save(state.storage); applySettingsToUI();
    });
    document.getElementById('fontSizeSelect').addEventListener('change', (e)=> {
      state.storage.settings.fontSize = e.target.value; Storage.save(state.storage); applySettingsToUI();
    });
    document.getElementById('resetProgress').addEventListener('click', ()=> {
      if (!confirm('Reset all progress?')) return;
      state.storage = Storage.defaults;
      Storage.save(state.storage);
      applySettingsToUI();
      renderLevelsGrid();
      updateHomeStats();
      alert('Progress reset.');
    });

    document.getElementById('exportBtn').addEventListener('click', exportProgress);
  }

  /* Games render */
  function renderGames() {
    renderScoreboard();
    // unlock some games based on milestones
    const unlocks = [5,10,20,30,40];
    const available = unlocks.filter(i => {
      const st = state.storage.stats.levels[`L${i}`];
      return st && (st.bestAcc >= 80 || st.bestWPM >= Levels.get(i).wpmTarget);
    });
    // enable appropriate game buttons
    const gameBtns = document.querySelectorAll('.game-card');
    gameBtns.forEach(b=>{
      const name = b.dataset.game;
      if (name === 'fallingWords') {
        b.disabled = false; b.classList.remove('disabled');
        b.addEventListener('click', ()=> Games.launch('fallingWords'));
      }
    });
  }

  return {
    showScreen, updateHomeStats, renderLevelsGrid, openLevel, bindNav, state, applySettingsToUI, renderScoreboard
  };
})();

/* ========== Typing Engine Module ========== */
const TypingEngine = (function(){
  // DOM references
  const sampleTextEl = document.getElementById('sampleText');
  const userProgressEl = document.getElementById('userProgress');
  const wpmEl = document.getElementById('wpm');
  const accuracyEl = document.getElementById('accuracy');
  const errorsEl = document.getElementById('errors');
  const timerEl = document.getElementById('timer');
  const levelNameEl = document.getElementById('levelName');
  const targetKeysEl = document.getElementById('targetKeys');
  const bestWPMEl = document.getElementById('bestWPM');
  const bestAccEl = document.getElementById('bestAcc');
  const levelProgressEl = document.getElementById('levelProgress');
  const levelProgressLabel = document.getElementById('levelProgressLabel');
  const hintsList = document.getElementById('hintsList');
  const hintArea = document.getElementById('hintArea');

  // state
  let timerInterval = null;
  let startTime = null;
  let elapsed = 0;
  let running = false;
  let duration = 60;
  let targetText = '';
  let position = 0;
  let errors = 0;
  let totalTyped = 0;
  let levelIndex = 1;

  // debounce helper
  function debounce(fn, wait=20){
    let t;
    return function(...args){
      clearTimeout(t);
      t = setTimeout(()=> fn.apply(this,args), wait);
    };
  }

  // keyboard mapping and rendering
  const keyboardLayout = [
    ['Esc','F1','F2','F3','F4','F5'],
    ['`','1','2','3','4','5','6','7','8','9','0','-','='],
    ['Tab','q','w','e','r','t','y','u','i','o','p','[',']','\\'],
    ['Caps','a','s','d','f','g','h','j','k','l',';','\'','Enter'],
    ['Shift','z','x','c','v','b','n','m',',','.','/','Shift'],
    ['Space']
  ];

  function renderKeyboard() {
    const wrap = document.getElementById('onScreenKeyboard');
    wrap.innerHTML = '';
    keyboardLayout.forEach(row => {
      const r = document.createElement('div');
      r.className = 'key-row';
      row.forEach(k=>{
        const el = document.createElement('div');
        el.className = 'key';
        el.textContent = k;
        el.dataset.key = k.toLowerCase();
        r.appendChild(el);
      });
      wrap.appendChild(r);
    });
  }

  // highlight a key on press and show finger guide
  function highlightKey(key, down=true) {
    const norm = key.toLowerCase();
    document.querySelectorAll('.key').forEach(k => {
      if (k.dataset.key === norm || (norm === ' ' && k.dataset.key==='space')) {
        if (down) k.classList.add('active');
        else k.classList.remove('active');
      }
    });
  }

  // finger mapping for live guide (simplified)
  const fingerMap = {
    'a':'left-pinkie','s':'left-ring','d':'left-middle','f':'left-index',
    'j':'right-index','k':'right-middle','l':'right-ring',';':'right-pinkie',
    'q':'left-pinkie','z':'left-pinkie','p':'right-pinkie','/':'right-pinkie'
  };

  function highlightFingerForChar(ch) {
    // clear previous inline highlights by manipulating legend background via style
    document.querySelectorAll('.finger-legend .finger').forEach(f=> f.style.opacity=0.4);
    const mapped = fingerMap[ch];
    if (!mapped) return;
    const el = document.querySelector(`.finger.${mapped}`);
    if (el) el.style.opacity = 1;
  }

  // load a specific level
  function loadLevel(idx) {
    levelIndex = idx || 1;
    const lvl = Levels.get(levelIndex);
    levelNameEl.textContent = `${lvl.name} (L${levelIndex})`;
    targetKeysEl.textContent = `Target: ${lvl.targetKeys}`;
    // pick a sample text
    targetText = lvl.samples[Math.floor(Math.random()*lvl.samples.length)];
    sampleTextEl.textContent = targetText;
    position = 0; errors = 0; totalTyped = 0;
    renderUserProgress();
    // populate best stats
    const st = UI.state.storage.stats.levels[`L${levelIndex}`] || {};
    bestWPMEl.textContent = st.bestWPM || 0;
    bestAccEl.textContent = (st.bestAcc != null) ? st.bestAcc + '%' : '0%';
    updateProgressBar();
    hintArea.hidden = !UI.state.storage.settings.hints;
    populateHints();
  }

  function loadRandomTest(){
    // free text sample
    levelIndex = 0;
    levelNameEl.textContent = 'Free Test';
    targetKeysEl.textContent = 'Target: Free';
    targetText = generateRandomText(60);
    sampleTextEl.textContent = targetText;
    position = 0; errors = 0; totalTyped = 0;
    renderUserProgress();
    hintArea.hidden = !UI.state.storage.settings.hints;
    populateHints();
  }

  function populateHints(){
    const hints = [
      "Keep wrists relaxed and fingers curved.",
      "Use home row as your anchor — return fingers to it after each key.",
      "Accuracy first, then speed — speed follows accuracy.",
      "Breathe, and keep posture upright to avoid fatigue."
    ];
    hintsList.innerHTML = '';
    hints.slice(0,3).forEach(h => {
      const li = document.createElement('li'); li.textContent = h;
      hintsList.appendChild(li);
    });
  }

  function generateRandomText(len) {
    const words = ["quick","brown","fox","jumps","over","lazy","dog","practice","typing","speed","accuracy","keyboard","fingers","smooth","progress"];
    let s = '';
    while (s.length < len) s += words[Math.floor(Math.random()*words.length)] + ' ';
    return s.trim().slice(0, len);
  }

  function renderUserProgress() {
    // show completed and remaining with spans
    const completed = escapeHTML(targetText.slice(0, position));
    const nextChar = escapeHTML(targetText[position] || '');
    const rest = escapeHTML(targetText.slice(position+1));
    userProgressEl.innerHTML = `<span class="correct">${completed}</span><span class="current">${nextChar}</span><span class="rest">${rest}</span>`;
  }

  function escapeHTML(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // start, stop and reset
  function startTest() {
    if (running) return;
    duration = Math.max(15, parseInt(document.getElementById('durationInput').value || 60, 10));
    startTime = Date.now();
    elapsed = 0;
    running = true;
    document.getElementById('startTestBtn').disabled = true;
    // focus exercise area for keyboard capture
    document.getElementById('exerciseBox').focus();
    timerInterval = setInterval(()=> {
      elapsed = Math.floor((Date.now() - startTime)/1000);
      const remain = Math.max(0, duration - elapsed);
      timerEl.textContent = formatTime(remain);
      if (remain <= 0) {
        finishTest();
      }
    }, 250);
  }

  function resetTest() {
    clearInterval(timerInterval);
    timerInterval = null; running = false;
    elapsed = 0; startTime = null;
    position = 0; errors = 0; totalTyped = 0;
    timerEl.textContent = formatTime(duration || 0);
    wpmEl.textContent = '0';
    accuracyEl.textContent = '100%';
    errorsEl.textContent = '0';
    renderUserProgress();
    document.getElementById('startTestBtn').disabled = false;
  }

  function finishTest() {
    clearInterval(timerInterval);
    timerInterval = null;
    running = false;
    document.getElementById('startTestBtn').disabled = false;
    // compute final stats
    const minutes = Math.max( (elapsed || 1) / 60, 1/60);
    const wpm = Math.round((totalTyped / 5) / minutes);
    const acc = Math.round(((totalTyped - errors) / Math.max(1,totalTyped)) * 100);
    // save stats
    saveStats(wpm, acc);
    // show motivational hint
    showMotivation(wpm, acc);
  }

  function saveStats(wpm, acc) {
    const storage = UI.state.storage;
    const id = `L${levelIndex || 'free'}`;
    if (!storage.stats.levels[id]) storage.stats.levels[id] = { attempts:0, bestWPM:0, bestAcc:0, streak:0, totalTime:0 };
    const st = storage.stats.levels[id];
    st.attempts = (st.attempts||0) + 1;
    if (wpm > (st.bestWPM||0)) st.bestWPM = wpm;
    if (acc > (st.bestAcc||0)) st.bestAcc = acc;
    st.totalTime = (st.totalTime || 0) + (elapsed || 0);
    // global stats
    storage.stats.attempts = (storage.stats.attempts || 0) + 1;
    storage.stats.totalMinutes = Math.round((storage.stats.totalMinutes || 0) + ((elapsed || 0)/60));
    // streak update (simple day-based)
    const last = storage.stats.lastPracticeDate;
    const today = (new Date()).toDateString();
    if (last === today) {
      // same day
    } else {
      // increment streak if yesterday was lastPracticeDate
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
      if (last === yesterday.toDateString()) storage.stats.streak = (storage.stats.streak || 0) +1;
      else storage.stats.streak = 1;
      storage.stats.lastPracticeDate = today;
    }
    Storage.save(storage);
    UI.renderLevelsGrid();
    UI.updateHomeStats();
    UI.renderScoreboard();
  }

  function showMotivation(wpm, acc) {
    const message = `Nice work! WPM: ${wpm}, Accuracy: ${acc}%. Tip: ${acc < 85 ? 'Slow down, focus on accuracy' : 'Keep pushing for speed!'}`;
    alert(message);
  }

  function formatTime(sec) {
    const mm = Math.floor(sec/60).toString().padStart(2,'0');
    const ss = Math.floor(sec%60).toString().padStart(2,'0');
    return `${mm}:${ss}`;
  }

  // keyboard event handling (debounced)
  const onKey = debounce(function(e){
    const key = typeof e === 'string' ? e : (e.key || '');
    handleKeyPress(key, e);
  }, 6);

  function handleKeyPress(key, rawEvent) {
    if (!targetText) return;
    // normalize some keys
    const k = key.length === 1 ? key : key;
    // highlight on-screen key
    if (UI.state.storage.settings.highlight) highlightKey(k, true);
    setTimeout(()=> highlightKey(k, false), 120);

    // finger guide
    const ch = k.length === 1 ? k.toLowerCase() : '';
    highlightFingerForChar(ch);

    // sound
    if (UI.state.storage.settings.sound) AudioHelper.click();

    if (!running) return; // ignore typed characters when not running

    // acceptance: treat Enter as newline and space, also allow Backspace (counts as typed but doesn't increase totalTyped)
    if (rawEvent && rawEvent.key === 'Backspace') {
      // move back if possible
      if (position>0) position--;
      renderUserProgress();
      return;
    }

    // the expected char
    const expected = targetText[position] || '';
    const typed = (k.length === 1 ? k : (k === 'Backspace' ? '' : ''));
    totalTyped++;
    if (typed === expected) {
      position++;
    } else {
      errors++;
      // minimal visual error feedback: mark current char as incorrect
    }
    // update stats
    const minutes = Math.max((elapsed || 1) / 60, 1/60);
    const wpm = Math.round((totalTyped / 5) / minutes);
    const acc = Math.round(((totalTyped - errors) / Math.max(1,totalTyped)) * 100);
    wpmEl.textContent = wpm;
    accuracyEl.textContent = acc + '%';
    errorsEl.textContent = errors;
    renderUserProgress();
  }

  // minimal input capture via keydown on document
  function bindKeyListeners() {
    // keydown
    document.addEventListener('keydown', (e)=>{
      // ignore modifiers alone
      if (e.key === 'Shift' || e.key === 'Alt' || e.key === 'Control' || e.key === 'Meta') return;
      onKey(e);
    });

    // optional on-screen keyboard clicks
    document.getElementById('onScreenKeyboard').addEventListener('click', (ev)=>{
      const keyEl = ev.target.closest('.key');
      if (!keyEl) return;
      const key = keyEl.dataset.key;
      onKey(key);
    });
  }

  /* Progress bar update */
  function updateProgressBar() {
    const st = UI.state.storage.stats.levels[`L${levelIndex}`] || {};
    const pct = Math.min(100, Math.round(((st.bestWPM || 0) / (Levels.get(levelIndex).wpmTarget || 30)) * 100));
    levelProgressEl.style.width = pct + '%';
    levelProgressLabel.textContent = pct + '%';
  }

  // initialization
  function init() {
    renderKeyboard();
    bindKeyListeners();
    // load first level by default when practice opened
    loadLevel(1);
    resetTest();
  }

  // expose functions
  return {
    init, loadLevel, loadRandomTest, startTest, resetTest
  };
})();

/* ========== Audio Helper (uses asset or fallback) ========== */
const AudioHelper = (function(){
  let clickBuffer = null;
  const audioCtx = (typeof window.AudioContext !== 'undefined') ? new window.AudioContext() : null;
  // attempt to load assets/click.mp3
  fetch('assets/click.mp3').then(r=>{
    if (!r.ok) throw new Error('no mp3');
    return r.arrayBuffer();
  }).then(buf => audioCtx.decodeAudioData(buf)).then(decoded => {
    clickBuffer = decoded;
  }).catch(()=> {
    // we'll fallback to generated beep; leave clickBuffer null
  });

  function click() {
    if (!UI.state.storage.settings.sound) return;
    if (audioCtx && clickBuffer) {
      const src = audioCtx.createBufferSource();
      src.buffer = clickBuffer;
      src.connect(audioCtx.destination);
      src.start();
    } else if (audioCtx) {
      // fallback short oscillator beep
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = 800;
      g.gain.value = 0.05;
      o.connect(g); g.connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + 0.03);
    } else {
      // last resort: simple play using HTMLAudioElement if present
      const a = new Audio('assets/click.mp3');
      a.volume = 0.1;
      a.play().catch(()=>{});
    }
  }

  return { click };
})();

/* ========== Games Module (Falling Words sample fully working) ========== */
const Games = (function(){
  const gameArea = document.getElementById('gameArea');
  let animationId = null;
  let objects = [];
  let lastSpawn = 0;
  let score = 0;
  let running = false;
  const spawnInterval = 1300;

  function launch(name) {
    if (name === 'fallingWords') startFallingWords();
  }

  function startFallingWords() {
    reset();
    running = true;
    gameArea.innerHTML = '<div style="padding:8px"><input id="playerName" placeholder="Your name" /></div><canvas id="fallCanvas" width="800" height="300" style="width:100%;border-radius:8px;display:block"></canvas>';
    const canvas = document.getElementById('fallCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    // simple words dictionary
    const words = ["apple","code","speed","type","skill","focus","practice","keyboard","rapid","brown","fox","jumps","over","lazy","dog","project","stack","shift","space","enter"];

    const startTime = Date.now();
    function spawn(now) {
      if (!running) return;
      if (now - lastSpawn > spawnInterval) {
        const w = words[Math.floor(Math.random()*words.length)];
        objects.push({
          text: w,
          x: Math.random() * (canvas.clientWidth - 60) + 20,
          y: -20,
          speed: 40 + Math.random()*80,
          hit: false
        });
        lastSpawn = now;
      }
      // clear
      ctx.clearRect(0,0, canvas.clientWidth, canvas.clientHeight);
      // update and draw
      objects.forEach(o=>{
        o.y += o.speed * (1/60);
        ctx.fillStyle = '#111';
        ctx.font = '16px Arial';
        ctx.fillText(o.text, o.x, o.y);
      });
      // remove off-screen and deduct score on miss
      objects = objects.filter(o=>{
        if (o.y > canvas.clientHeight + 20) {
          score = Math.max(0, score - 2);
          return false;
        }
        return true;
      });
      // draw score
      ctx.fillStyle = '#000';
      ctx.font = '14px Arial';
      ctx.fillText(`Score: ${score}`, 8, 18);
      animationId = requestAnimationFrame(spawn);
    }

    animationId = requestAnimationFrame(spawn);

    // typed input capture for game
    const onKey = function(e){
      if (!running) return;
      if (e.key.length === 1) {
        const char = e.key.toLowerCase();
        // append char to a typed buffer to match words
        typedBuffer += char;
        // check objects if any whose text starts with typedBuffer
        objects.forEach(o=>{
          if (!o.hit && o.text.startsWith(typedBuffer)) {
            if (o.text === typedBuffer) {
              score += Math.max(1, Math.floor(10 + (o.text.length * 2)));
              o.hit = true;
              // remove o
              o.y = canvas.clientHeight + 999;
            }
          }
        });
      } else if (e.key === 'Backspace') {
        typedBuffer = typedBuffer.slice(0, -1);
      } else if (e.key === 'Enter') {
        typedBuffer = '';
      }
    };

    let typedBuffer = '';
    document.addEventListener('keydown', onKey);

    // end game after 60s
    setTimeout(()=> {
      running = false;
      cancelAnimationFrame(animationId);
      document.removeEventListener('keydown', onKey);
      const player = (document.getElementById('playerName')||{}).value || 'Guest';
      saveScore(player, score);
      gameArea.innerHTML += `<div style="padding:8px">Game Over. Score: ${score}</div>`;
      UI.state.storage.scoreboard.fallingWords = UI.state.storage.scoreboard.fallingWords || [];
      UI.state.storage.scoreboard.fallingWords.push({ name: player, score, when: Date.now() });
      Storage.save(UI.state.storage);
      UI.renderScoreboard();
    }, 60000);
  }

  function saveScore(name, score) {
    UI.state.storage.scoreboard.fallingWords = UI.state.storage.scoreboard.fallingWords || [];
    UI.state.storage.scoreboard.fallingWords.push({ name, score, when: Date.now() });
    Storage.save(UI.state.storage);
  }

  function reset() {
    objects = []; lastSpawn = 0; score = 0; if (animationId) cancelAnimationFrame(animationId);
  }

  return { launch };
})();

/* ========== App Init ========== */
(function initApp(){
  // initial UI bindings
  UI.bindNav();
  UI.applySettingsToUI();
  UI.updateHomeStats();
  UI.renderLevelsGrid();
  TypingEngine.init();
  UI.renderScoreboard();

  // small onboarding: show first screen
  UI.showScreen('home');

  // performance note: keep key listener simple and debounced inside TypingEngine
})();
