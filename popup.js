// Stats Machine — popup.js v3
'use strict';

// ── State ──
let currentProfile = 'player';
let currentTheme   = 'nixie';
let pageStats      = null;
let sessionData    = null;
let tabCount       = 0;
const DL_HISTORY   = new Array(20).fill(0);
let lastBytes      = 0;
let peakDl         = 0;
let pingHistory    = [];
let prevValues     = {};
let settings       = {};
let siteLimits     = {};
let onboardStep    = 0;

// Live 1-second counters — seeded from background, ticking every second
// Key rule: on re-seed we fold current elapsed INTO the bases first,
// then take max(local, background) so display never goes backwards.
let live = {
  tabMs:    0,
  todayMs:  0,
  idleMs:   0,
  seededAt: null,
  isIdle:   false,
};

function seedLive(ss) {
  if (!ss) return;
  const now = Date.now();

  // If already running, fold elapsed into bases before re-seeding
  if (live.seededAt !== null) {
    const elapsed = now - live.seededAt;
    if (!live.isIdle) {
      live.tabMs   += elapsed;
      live.todayMs += elapsed;
    } else {
      live.idleMs  += elapsed;
    }
  }

  // Take the max of our running local value vs what the background reports
  // Background is always slightly behind (writes every 5s), never ahead
  live.tabMs   = Math.max(live.tabMs,   ss.tabMs   || 0);
  live.todayMs = Math.max(live.todayMs, ss.todayMs || 0);
  live.idleMs  = Math.max(live.idleMs,  ss.idleMs  || 0);
  live.seededAt = now;
  live.isIdle   = ss.isIdle || false;
}

function tickLive() {
  if (live.seededAt === null) return;
  const elapsed = Date.now() - live.seededAt;

  // Tab Time — pauses when idle
  // Today Total — pauses when idle (matches background.js tickActiveTab behaviour)
  // Idle Today — only ticks when idle
  const tabMs   = live.tabMs   + (live.isIdle ? 0 : elapsed);
  const todayMs = live.todayMs + (live.isIdle ? 0 : elapsed);
  const idleMs  = live.idleMs  + (live.isIdle ? elapsed : 0);

  // Tab Time — Player + Surfer
  const fmtTab = fmtTime(tabMs);
  const el1 = document.getElementById('p-tabtime');
  const el2 = document.getElementById('s-tabtime');
  if (el1) el1.textContent = fmtTab;
  if (el2) el2.textContent = fmtTab;

  // Today Total — Player + Surfer + Focus
  const fmtToday = fmtTime(todayMs);
  const el3 = document.getElementById('p-today');
  const el4 = document.getElementById('s-today');
  const el5 = document.getElementById('f-today');
  if (el3) el3.textContent = fmtToday;
  if (el4) el4.textContent = fmtToday;
  if (el5) el5.textContent = fmtToday;

  // Idle Today — Player + Focus
  const fmtIdle = fmtTime(idleMs);
  const el6 = document.getElementById('p-idle');
  const el7 = document.getElementById('f-idle');
  if (el6) el6.textContent = fmtIdle;
  if (el7) el7.textContent = fmtIdle;
}

// ── Onboarding ──
function initOnboarding() {
  try {
    chrome.storage.local.get(['smOnboarded'], (s) => {
      if (!s.smOnboarded) showOnboarding();
    });
  } catch(e) {}
}

function showOnboarding() {
  document.getElementById('onboarding').classList.remove('hidden');
  document.getElementById('app-root').style.display = 'none';
}

function hideOnboarding() {
  document.getElementById('onboarding').classList.add('hidden');
  document.getElementById('app-root').style.display = '';
  try { chrome.storage.local.set({ smOnboarded: true }); } catch(e) {}
}

function goObSlide(i) {
  onboardStep = i;
  for (let j = 0; j < 3; j++) {
    document.getElementById('ob-' + j)?.classList.toggle('hidden', j !== i);
    document.querySelector('.ob-dot[data-i="' + j + '"]')?.classList.toggle('active', j === i);
  }
  document.getElementById('ob-back').classList.toggle('hidden', i === 0);
  if (i === 2) {
    document.getElementById('ob-next').textContent = 'Get Started ✓';
  } else {
    document.getElementById('ob-next').textContent = 'Next →';
  }
}

// ── Theme ──
function setTheme(t) {
  currentTheme = t;
  document.body.className = 'theme-' + t;
  ['nixie','ghibli','hacker','midnight'].forEach(th => {
    document.getElementById('t-' + th)?.classList.toggle('active', th === t);
  });
  try { chrome.storage.local.set({ smTheme: t }); } catch(e) {}
  drawSparkline();
  if (sessionData) drawHeatmap(sessionData.history90);
  drawFocusRing(sessionData?.focusScore ?? null);
}

// ── Profile switch ──
function switchProfile(profile) {
  currentProfile = profile;
  document.querySelectorAll('.profile-btn').forEach(b => b.classList.toggle('active', b.dataset.profile === profile));
  document.querySelectorAll('.profile-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById('panel-' + profile)?.classList.remove('hidden');
  try { chrome.storage.local.set({ smProfile: profile }); } catch(e) {}
  if (profile === 'focus') {
    drawHeatmap(sessionData?.history90 || {});
    drawFocusRing(sessionData?.focusScore ?? null);
  }
  if (profile === 'surfer') checkPermissions();
}

// ── Clock ──
function tick() {
  const now = new Date(), p = n => String(n).padStart(2, '0');
  const el = document.getElementById('ts-label');
  if (el) el.textContent = p(now.getHours()) + ':' + p(now.getMinutes()) + ':' + p(now.getSeconds());
  updatePomoDisplay();
  tickLive();
}

// ── Formatters ──
function fmtMs(ms) {
  if (ms === null || ms === undefined || isNaN(ms) || ms <= 0) return '—';
  if (ms < 1000) return ms + 'ms';
  return (ms / 1000).toFixed(1) + 's';
}
function fmtBytes(b) {
  if (!b) return '—';
  if (b < 1024) return b + 'B';
  if (b < 1048576) return (b/1024).toFixed(0) + 'KB';
  return (b/1048576).toFixed(1) + 'MB';
}
function fmtTime(ms) {
  if (!ms || ms < 0) return '—';
  const s = Math.floor(ms/1000), m = Math.floor(s/60), h = Math.floor(m/60);
  if (h > 0) return h + 'h ' + String(m%60).padStart(2,'0') + 'm';
  if (m > 0) return m + 'm ' + String(s%60).padStart(2,'0') + 's';
  return s + 's';
}
function fmtSpeed(kbps) {
  if (kbps >= 1024) return (kbps/1024).toFixed(1) + ' <span class="speed-unit">MB/s</span>';
  return kbps.toFixed(1) + ' <span class="speed-unit">KB/s</span>';
}
function fmtMins(m) { return m + ':' + String(Math.floor(((m%1)*60))).padStart(2,'0'); }
function clsMs(ms, good, warn) { return !ms ? '' : ms <= good ? 'good' : ms <= warn ? 'warn' : 'bad'; }
function permClass(p) { return p === 'granted' ? 'good' : p === 'denied' ? 'bad' : 'warn'; }
function permLabel(p) { if (!p || p === 'unknown') return '—'; return p.charAt(0).toUpperCase() + p.slice(1); }

// ── Animated set value ──
function setVal(id, value, cls) {
  const el = document.getElementById(id);
  if (!el) return;
  const newVal = (value !== null && value !== undefined) ? String(value) : '—';
  if (el.dataset.anim && newVal !== el.textContent && el.textContent !== '—') {
    el.classList.remove('updating');
    void el.offsetWidth;
    el.classList.add('updating');
    setTimeout(() => el.classList.remove('updating'), 400);
  }
  el.textContent = newVal;
  const base = 'stat-val' + (el.dataset.anim ? ' anim' : '');
  if (cls !== undefined) el.className = base + (cls ? ' ' + cls : '');
}

// Mark animated fields
document.querySelectorAll('.stat-val.anim').forEach(el => el.dataset.anim = '1');

function setHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}
function setBar(id, pct, cls) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.width = Math.min(Math.max(pct,0),100) + '%';
  if (cls) el.className = 'stat-bar-fill ' + cls;
}

// ── Focus Ring (canvas arc) ──
function drawFocusRing(score) {
  const canvas = document.getElementById('focus-ring');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = 80 * dpr; canvas.height = 80 * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const cx = 40, cy = 40, r = 34, lw = 5;
  const pct = score !== null ? Math.min(Math.max(score, 0), 100) / 100 : 0;

  // Track
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const style = getComputedStyle(document.body);
  ctx.strokeStyle = style.getPropertyValue('--bg3').trim() || '#1f1f26';
  ctx.lineWidth = lw;
  ctx.stroke();

  if (score !== null) {
    // Fill arc
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + pct * Math.PI * 2;
    const color = score >= 70 ? (style.getPropertyValue('--good').trim() || '#3db87a')
                : score >= 40 ? (style.getPropertyValue('--warn').trim() || '#e8a030')
                : (style.getPropertyValue('--bad').trim() || '#e05050');
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Glow
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.strokeStyle = color + '40';
    ctx.lineWidth = lw + 4;
    ctx.stroke();
  }

  const numEl = document.getElementById('f-score');
  if (numEl) {
    numEl.textContent = score !== null ? score : '—';
    const sc = getComputedStyle(document.body);
    const good = sc.getPropertyValue('--good').trim();
    const warn = sc.getPropertyValue('--warn').trim();
    const bad  = sc.getPropertyValue('--bad').trim();
    const accent = sc.getPropertyValue('--accent').trim();
    numEl.style.color = score === null ? accent : score >= 70 ? good : score >= 40 ? warn : bad;
  }
}

// ── Heatmap (90-day) ──
function drawHeatmap(history90) {
  const canvas = document.getElementById('f-heatmap');
  if (!canvas) return;
  const wrap = canvas.parentElement;
  const W = (wrap.offsetWidth || 360) - 20;
  const dpr = window.devicePixelRatio || 1;
  // Smaller cells: 18 columns (weeks) × 7 rows, 2px gap
  const COLS = 18, ROWS = 7, GAP = 2;
  const CELL = Math.floor((W - (COLS - 1) * GAP) / COLS);
  const H = ROWS * CELL + (ROWS - 1) * GAP;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const style = getComputedStyle(document.body);
  const bg3    = style.getPropertyValue('--bg3').trim()   || '#1f1f26';
  const accent = style.getPropertyValue('--accent').trim() || '#e8860a';
  const good   = style.getPropertyValue('--good').trim()   || '#3db87a';

  const now = new Date();
  const days = [];
  for (let i = COLS * ROWS - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    const key = d.toISOString().slice(0,10);
    days.push({ key, ms: history90[key]?.ms || 0, fs: history90[key]?.focusScore, dow: d.getDay() });
  }
  const maxMs = Math.max(...days.map(d => d.ms), 1);

  // Fix #5: place each day at correct (col, row) based on actual day-of-week.
  // The grid starts at the earliest day's column. Sunday=row0 … Saturday=row6.
  // Determine starting column by walking from the first day's dow.
  const firstDow = days[0].dow; // day-of-week of the oldest day shown
  // The oldest day sits at row=firstDow; col=0
  // Each subsequent day increments: when row overflows 6, start next col.
  for (let i = 0; i < days.length; i++) {
    const totalRow = firstDow + i;           // logical row position from slot 0
    const col = Math.floor(totalRow / 7);
    const row = totalRow % 7;
    if (col >= COLS) continue;               // safety: grid not wide enough

    const d = days[i];
      const x = col * (CELL + GAP);
      const y = row * (CELL + GAP);

      // Background cell
      ctx.fillStyle = bg3;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, CELL, CELL, 1);
      else ctx.rect(x, y, CELL, CELL);
      ctx.fill();

      if (d.ms > 0) {
        const alpha = 0.2 + (d.ms / maxMs) * 0.8;
        let fillColor = accent;
        if (d.fs !== undefined && d.fs !== null) {
          fillColor = d.fs >= 70 ? good : d.fs >= 40 ? '#e8a030' : '#e05050';
        }
        ctx.globalAlpha = alpha;
        ctx.fillStyle = fillColor;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, CELL, CELL, 1);
        else ctx.rect(x, y, CELL, CELL);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
  }
}

// ── HTML escaping helper ──
function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Category Bars ──
function renderCategoryBars(catMs) {
  const container = document.getElementById('f-categories');
  if (!container) return;
  if (!catMs || Object.keys(catMs).length === 0) {
    container.innerHTML = '<div class="empty-msg">No browsing data yet today</div>';
    return;
  }
  const entries = Object.entries(catMs).sort((a, b) => b[1] - a[1]);
  const maxMs = entries[0][1];
  container.innerHTML = entries.map(([cat, ms]) => {
    const meta = CATEGORY_META[cat] || CATEGORY_META.other;
    const pct = Math.round((ms / maxMs) * 100);
    return `<div class="cat-row">
      <span class="cat-emoji">${meta.emoji}</span>
      <span class="cat-name">${escHtml(meta.label)}</span>
      <div class="cat-bar-wrap"><div class="cat-bar" style="width:${pct}%;background:${meta.color}"></div></div>
      <span class="cat-time">${fmtTime(ms)}</span>
    </div>`;
  }).join('');
}

// ── Weekly recap ──
function renderWeeklyRecap(history90) {
  const container = document.getElementById('f-weekly-recap');
  if (!container) return;

  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  if (dayOfWeek !== 1) { container.classList.add('hidden'); return; } // only Monday

  // Last 7 days excluding today
  let totalMs = 0, totalFocus = 0, focusDays = 0, topDomain = null, topMs = 0;
  const domTotals = {};

  for (let i = 1; i <= 7; i++) {
    const d = new Date(now - i * 86400000).toISOString().slice(0,10);
    const day = history90[d];
    if (!day) continue;
    totalMs += day.ms || 0;
    if (day.focusScore !== undefined && day.focusScore !== null) {
      totalFocus += day.focusScore;
      focusDays++;
    }
    for (const [dom, ms] of Object.entries(day.domainMs || {})) {
      domTotals[dom] = (domTotals[dom] || 0) + ms;
    }
  }

  const entries = Object.entries(domTotals).sort((a,b)=>b[1]-a[1]);
  topDomain = entries[0]?.[0];
  topMs = entries[0]?.[1];
  const avgFocus = focusDays > 0 ? Math.round(totalFocus / focusDays) : null;

  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="wr-title">📅 Last week in review</div>
    <div class="wr-row"><span>Total browsing time</span><span class="wr-val">${fmtTime(totalMs)}</span></div>
    ${avgFocus !== null ? `<div class="wr-row"><span>Avg focus score</span><span class="wr-val">${avgFocus}/100</span></div>` : ''}
    ${topDomain ? `<div class="wr-row"><span>Most visited</span><span class="wr-val">${topDomain}</span></div>` : ''}
    ${topMs ? `<div class="wr-row"><span>Time there</span><span class="wr-val">${fmtTime(topMs)}</span></div>` : ''}
  `;
}

// ── Pomodoro display ──
function updatePomoDisplay() {
  if (!sessionData?.pomo) return;
  const p = sessionData.pomo;

  const timeEl = document.getElementById('pomo-time');
  const modeEl = document.getElementById('pomo-mode-badge');
  const startBtn = document.getElementById('pomo-start');
  const stopBtn  = document.getElementById('pomo-stop');
  const breakPicker = document.getElementById('pomo-break-picker');

  if (p.running && p.startMs) {
    // Fix #4: compute remaining locally from startMs — don't rely on background's pre-computed p.remaining
    const dur = p.mode === 'work' ? p.durationMs
      : (p.round % 4 === 0 ? p.longBreakMs : p.shortBreakMs);
    const localRemaining = Math.max(0, dur - (Date.now() - p.startMs));
    const totalSec = Math.floor(localRemaining / 1000);
    const m = Math.floor(totalSec / 60), s = totalSec % 60;
    if (timeEl) timeEl.textContent = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  } else {
    // Fix #3: read live from the settings select when not running, not from stale sessionData
    const workSelectVal = parseInt(document.getElementById('cfg-pomo-work')?.value) || 25;
    if (timeEl) timeEl.textContent = String(workSelectVal).padStart(2,'0') + ':00';
  }

  if (modeEl) {
    modeEl.textContent = p.mode === 'break' ? (p.round % 4 === 0 ? 'LONG BREAK' : 'SHORT BREAK') : 'WORK';
    modeEl.className = 'pomo-mode-badge' + (p.mode === 'break' ? ' break' : '');
  }

  if (startBtn) startBtn.classList.toggle('hidden', p.running);
  if (stopBtn)  stopBtn.classList.toggle('hidden', !p.running);

  // Break picker: show only when not running; disable buttons when running
  if (breakPicker) {
    breakPicker.classList.toggle('hidden', p.running);
  }

  // Round dots
  const dotsEl = document.getElementById('pomo-dots');
  if (dotsEl) {
    dotsEl.innerHTML = [0,1,2,3].map(i =>
      `<div class="pomo-rdot${i < (p.round % 4) ? ' done' : ''}"></div>`
    ).join('');
  }

  const todayEl = document.getElementById('pomo-today');
  const totalEl = document.getElementById('pomo-total');
  if (todayEl) todayEl.textContent = p.completedToday || 0;
  if (totalEl) totalEl.textContent = p.completedTotal || 0;
}

// ── Achievements render ──
function renderAchievements(unlocked) {
  const container = document.getElementById('f-achievements');
  if (!container) return;
  const unlockedSet = new Set(unlocked || []);
  container.innerHTML = ACHIEVEMENTS.map(a => `
    <div class="ach-card ${unlockedSet.has(a.id) ? 'unlocked' : 'locked'}" title="${a.desc}">
      <div class="ach-emoji">${a.emoji}</div>
      <div class="ach-name">${a.name}</div>
    </div>
  `).join('');
}

// ── Sparkline ──
function drawSparkline() {
  const canvas = document.getElementById('p-sparkline');
  if (!canvas || !canvas.offsetWidth) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth, H = 32;
  canvas.width = W*dpr; canvas.height = H*dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr); ctx.clearRect(0, 0, W, H);
  const max = Math.max(...DL_HISTORY, 1);
  const step = W / (DL_HISTORY.length - 1);
  ctx.beginPath();
  DL_HISTORY.forEach((v, i) => {
    const x = i * step, y = H - (v / max) * (H - 3) - 2;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  const goodColor = getComputedStyle(document.body).getPropertyValue('--good').trim() || '#3db87a';
  ctx.strokeStyle = goodColor; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.lineTo((DL_HISTORY.length - 1) * step, H); ctx.lineTo(0, H); ctx.closePath();
  ctx.fillStyle = goodColor + '22';
  try { ctx.fill(); } catch(e) {}
}

// ── Speed meter ──
function updateSpeedMeter() {
  try {
    const resources = performance.getEntriesByType('resource');
    const cur = resources.reduce((s, r) => s + (r.transferSize || 0), 0);
    let dlKbps = lastBytes > 0 && cur >= lastBytes ? (cur - lastBytes) / 1024 : 0;
    lastBytes = cur;
    const simDl = Math.max(0, dlKbps + Math.random() * 80 * Math.pow(Math.random(), 2));
    const simUl = Math.max(0, Math.random() * 25 * Math.pow(Math.random(), 3));
    DL_HISTORY.push(simDl);
    if (DL_HISTORY.length > 20) DL_HISTORY.shift();
    if (simDl > peakDl) peakDl = simDl;
    const dlPct = Math.min((simDl / 1024) * 100, 100);
    const ulPct = Math.min((simUl / 256) * 100, 100);
    const dlBar = document.getElementById('p-dl-bar');
    const ulBar = document.getElementById('p-ul-bar');
    if (dlBar) dlBar.style.width = dlPct + '%';
    if (ulBar) ulBar.style.width = ulPct + '%';
    const dlVal = document.getElementById('p-dl-val');
    const ulVal = document.getElementById('p-ul-val');
    if (dlVal) dlVal.innerHTML = fmtSpeed(simDl);
    if (ulVal) ulVal.innerHTML = fmtSpeed(simUl);
    const peakEl = document.getElementById('p-spark-peak');
    if (peakEl) peakEl.textContent = 'peak: ' + (peakDl >= 1024 ? (peakDl/1024).toFixed(1)+' MB/s' : Math.round(peakDl)+' KB/s');
    applyPing(calcPing(resources), 'p-ping-dot', 'p-ping-val');
    drawSparkline();
  } catch(e) {}
}

function calcPing(entries) {
  const f = (entries||[]).filter(e => e.initiatorType==='fetch'||e.initiatorType==='xmlhttprequest');
  if (!f.length) return pageStats?.apiLatencyMs || null;
  return Math.round(f.slice(-5).reduce((s,e) => s + Math.max(0, e.responseStart - e.requestStart), 0) / Math.min(f.length,5));
}

function applyPing(ms, dotId, valId) {
  if (ms !== null) { pingHistory.push(ms); if (pingHistory.length > 10) pingHistory.shift(); }
  const avg = pingHistory.length ? Math.round(pingHistory.reduce((a,b)=>a+b,0)/pingHistory.length) : null;
  const dot = document.getElementById(dotId), val = document.getElementById(valId);
  if (!dot || !val) return;
  if (avg === null) { val.textContent = '—'; val.className = 'ping-val'; return; }
  const cls = avg < 60 ? 'good' : avg < 150 ? 'warn' : 'bad';
  val.textContent = avg; val.className = 'ping-val ' + cls;
  dot.className = 'ping-dot' + (cls !== 'good' ? ' ' + cls : '');
}

// ── Permissions check ──
async function checkPermissions() {
  const perms = [
    { name: 'notifications', id: 'sp-notif' },
    { name: 'camera',        id: 'sp-camera' },
    { name: 'microphone',    id: 'sp-mic' },
    { name: 'geolocation',   id: 'sp-geo' },
  ];
  for (const p of perms) {
    try {
      const r = await navigator.permissions.query({ name: p.name });
      const el = document.getElementById(p.id);
      if (el) { el.textContent = permLabel(r.state); el.className = 'perm-val ' + permClass(r.state); }
    } catch(e) {
      const el = document.getElementById(p.id);
      if (el) { el.textContent = 'n/a'; el.className = 'perm-val'; }
    }
  }
}

// ── Render: Focus ──
function renderFocus(ss) {
  if (!ss) return;
  seedLive(ss); // live ticker owns f-today, f-idle
  drawFocusRing(ss.focusScore);
  setVal('f-streak', ss.streak !== undefined ? ss.streak : '—', 'good');
  setVal('f-hops',   ss.tabHops ?? '—', (ss.tabHops||0) > 150 ? 'warn' : '');
  if (ss.firstActiveHour !== null && ss.firstActiveHour !== undefined) {
    const h = ss.firstActiveHour, ampm = h >= 12 ? 'pm' : 'am';
    setVal('f-first', (h % 12 || 12) + ampm);
  } else {
    setVal('f-first', '—');
  }
  renderCategoryBars(ss.categoryMs);
  drawHeatmap(ss.history90 || {});
  renderAchievements(ss.unlockedAchievements || []);
  renderWeeklyRecap(ss.history90 || {});
  updatePomoDisplay();
}

// ── Render: Player ──
function renderPlayer(ps, ss) {
  if (ss) {
    seedLive(ss); // seed the live 1s counters

    setVal('p-streak',  ss.streak ?? '—', 'good');
    setVal('p-hops',    ss.tabHops ?? '—', (ss.tabHops||0) > 150 ? 'warn' : '');
    const doom = ss.scrollTotal || 0;
    setVal('p-doom', doom, doom > 200 ? 'bad' : doom > 80 ? 'warn' : 'good');
  }
  setVal('p-tabs', tabCount > 0 ? tabCount : '—');
  if (ps) {
    setVal('p-sound', ps.soundPlaying ? 'ON' : 'OFF', ps.soundPlaying ? 'bad' : 'good');
    const np = ps.notifPermission || 'unknown';
    setVal('p-notif', permLabel(np), permClass(np));
    const dlEl = document.getElementById('p-total-dl');
    const ulEl = document.getElementById('p-total-ul');
    if (dlEl) dlEl.textContent = fmtBytes(ps.totalBytes);
    if (ulEl) ulEl.textContent = '—';
  }
  renderTopSites(ss);
}

function renderTopSites(ss) {
  const c = document.getElementById('p-top-sites');
  if (!c) return;
  if (!ss?.topDomains?.length) { c.innerHTML = '<div class="empty-msg">No data yet — browse around!</div>'; return; }
  const maxMs = ss.topDomains[0].ms;
  c.innerHTML = ss.topDomains.map(({ domain, ms, cat }) => {
    const meta = CATEGORY_META[cat] || CATEGORY_META.other;
    const pct = Math.round((ms / maxMs) * 100);
    return `<div class="site-row">
      <div class="site-dot" style="background:${meta.color}"></div>
      <span class="site-name">${escHtml(domain)}</span>
      <div class="site-bar-wrap"><div class="site-bar" style="width:${pct}%;background:${meta.color}"></div></div>
      <span class="site-time">${fmtTime(ms)}</span>
    </div>`;
  }).join('');
}

// ── Render: Surfer ──
function renderSurfer(ps, ss) {
  if (ps) {
    setVal('s-https',   ps.isHttps ? 'HTTPS' : 'HTTP!', ps.isHttps ? 'good' : 'bad');
    setVal('s-cookies', ps.cookieCount ?? '—');
    setVal('s-trackers', ps.trackerCount ?? 0, (ps.trackerCount||0) > 0 ? 'bad' : 'good');
    setVal('s-3p',      ps.thirdPartyScripts ?? '—', (ps.thirdPartyScripts||0) > 10 ? 'warn' : '');
    setVal('s-ads',     ps.adsOnPage ?? '—', (ps.adsOnPage||0) > 0 ? 'warn' : 'good');
    setVal('s-login',   ps.hasLoginForm ? 'YES' : 'NO', ps.hasLoginForm ? 'warn' : 'good');
    setVal('s-read',    ps.readingTimeMin ? ps.readingTimeMin + ' min' : '—');

    // Scroll depth as bananas (1 banana ≈ 20cm ≈ 75px)
    const rawScroll = Math.min(ps.scrollDepthPct || 0, 100);
    const bananas = Math.round((rawScroll / 100) * (document.body?.scrollHeight || 800) / 75) || Math.round(rawScroll / 5);
    setVal('s-scroll', bananas > 0 ? bananas + ' 🍌' : '0 🍌');

    setVal('s-co2',     ps.co2g !== undefined ? ps.co2g + 'g' : '—', (ps.co2g||0) < 0.5 ? 'good' : (ps.co2g||0) < 2 ? 'warn' : 'bad');

    // Tracker list
    const tl = document.getElementById('s-tracker-list');
    if (tl) {
      if (ps.trackers?.length) {
        tl.innerHTML = ps.trackers.map(t => `<span class="tracker-tag">${t}</span>`).join('');
      } else {
        tl.innerHTML = '<span class="tracker-none">✓ No known trackers detected</span>';
      }
    }

    // Local storage
    const lsEl = document.getElementById('sp-ls');
    if (lsEl) lsEl.textContent = ps.localStorageKb ? ps.localStorageKb + 'KB' : '0KB';
  }
  if (ss) {
    seedLive(ss); // live ticker owns s-tabtime, s-today
    setVal('s-streak',  ss.streak ?? '—', 'good');

    // Lifetime stats
    const atMs   = ss.allTimeMs     || 0;
    const atIdle = ss.allTimeIdleMs || 0;
    const atDays = ss.allTimeDays   || 0;
    const atHops = ss.allTimeHops   || 0;

    setVal('s-alltime',      atMs   > 0 ? fmtTime(atMs)   : '—');
    setVal('s-alltime-idle', atIdle > 0 ? fmtTime(atIdle) : '—');
    setVal('s-alltime-days', atDays > 0 ? atDays + (atDays === 1 ? ' day' : ' days') : '—', 'good');
    setVal('s-alltime-hops', atHops > 0 ? atHops.toLocaleString() : '—');

    // avg active time per day
    const avgMs = atDays > 0 ? Math.round(atMs / atDays) : 0;
    setVal('s-alltime-avg', avgMs > 0 ? fmtTime(avgMs) : '—');

    // focus ratio = active (non-idle) / total browsing time, lifetime
    const activeMs = atMs - atIdle;
    const focusRatio = atMs > 0 ? Math.round((activeMs / atMs) * 100) : null;
    setVal('s-alltime-focus',
      focusRatio !== null ? focusRatio + '%' : '—',
      focusRatio === null ? '' : focusRatio >= 70 ? 'good' : focusRatio >= 40 ? 'warn' : 'bad'
    );
  }
}

// ── Render: Devs ──
function renderDevs(ps) {
  if (!ps) return;
  setVal('d-load',     fmtMs(ps.pageLoadMs), clsMs(ps.pageLoadMs, 1500, 4000));
  setVal('d-ttfb',     fmtMs(ps.ttfbMs),     clsMs(ps.ttfbMs, 200, 600));
  setVal('d-dns',      fmtMs(ps.dnsMs),       clsMs(ps.dnsMs, 50, 200));
  setVal('d-ssl',      fmtMs(ps.sslMs),       clsMs(ps.sslMs, 100, 300));
  setVal('d-reqs',     ps.totalRequests ?? '—');
  setVal('d-redirects',ps.redirectCount ?? 0, (ps.redirectCount||0)>0?'warn':'good');

  // Core Web Vitals
  setVal('d-lcp', ps.lcp ? fmtMs(ps.lcp) : '—', ps.lcp ? clsMs(ps.lcp, 2500, 4000) : '');
  setVal('d-cls', ps.cls !== null && ps.cls !== undefined ? ps.cls.toFixed(3) : '—',
    ps.cls !== null ? (ps.cls <= 0.1 ? 'good' : ps.cls <= 0.25 ? 'warn' : 'bad') : '');
  setVal('d-fcp', ps.fcp ? fmtMs(ps.fcp) : '—', ps.fcp ? clsMs(ps.fcp, 1800, 3000) : '');
  setVal('d-fid', ps.fid ? fmtMs(ps.fid) : '—', ps.fid ? clsMs(ps.fid, 100, 300) : '');
  setVal('d-render-block', ps.renderBlockingScripts ?? '—', (ps.renderBlockingScripts||0)>3?'warn':'good');
  setVal('d-cdn',  ps.cdnDetected ? 'YES' : 'NO', ps.cdnDetected ? 'good' : '');

  const proto = (ps.protocol||'').toLowerCase();
  setVal('d-proto', proto.includes('h3')?'HTTP/3':proto.includes('h2')?'HTTP/2':proto.includes('1.1')?'HTTP/1.1':proto||'—',
    proto.includes('h3')?'good':proto.includes('h2')?'':'warn');
  setVal('d-errors', ps.consoleErrors??0, (ps.consoleErrors||0)>0?'bad':'good');
  setVal('d-api',   ps.apiCallCount??0);
  setVal('d-ping',  ps.apiLatencyMs ? ps.apiLatencyMs+'ms' : '—', ps.apiLatencyMs?clsMs(ps.apiLatencyMs,60,150):'');
  // Tech stack: show detected frameworks or dash (not 'unknown' which is misleading)
  const stackStr = ps.techStack?.length ? ps.techStack.join(' · ') : '—';
  setVal('d-stack', stackStr);

  setVal('d-h1',       ps.h1Count??'—',        ps.h1Count===1?'good':ps.h1Count>1?'warn':'bad');
  setVal('d-alt',      ps.missingAlt??'—',      ps.missingAlt===0?'good':ps.missingAlt<5?'warn':'bad');
  setVal('d-imgs',     ps.totalImages??'—');
  setVal('d-oversized',ps.oversizedImages??'—', ps.oversizedImages===0?'good':'warn');
  if (ps.contrastRatio) {
    setVal('d-contrast', ps.contrastRatio+':1', ps.wcagAAA?'good':ps.wcagAA?'warn':'bad');
    setVal('d-wcag',     ps.wcagAAA?'AAA':ps.wcagAA?'AA ✓':'FAIL', ps.wcagAAA?'good':ps.wcagAA?'warn':'bad');
  }
}

// ── Render: Pixel ──
function renderPixel(ps) {
  if (!ps) return;
  const fontsEl = document.getElementById('px-fonts');
  if (fontsEl) fontsEl.innerHTML = ps.fonts?.length ? ps.fonts.map(f=>`<span class="tag">${f.slice(0,24)}</span>`).join('') : '—';
  renderColorPalette(ps.colorPalette);
  setVal('px-imgs',     ps.totalImages??'—');
  setVal('px-oversized',ps.oversizedImages??'—', ps.oversizedImages===0?'good':'warn');
  if (ps.seoScore !== undefined) setVal('px-seo', ps.seoScore+'/100', ps.seoScore>=80?'good':ps.seoScore>=50?'warn':'bad');
  if (ps.contrastRatio) {
    setVal('px-contrast', ps.contrastRatio+':1', ps.wcagAAA?'good':ps.wcagAA?'warn':'bad');
    setVal('px-wcag',     ps.wcagAAA?'AAA':ps.wcagAA?'AA ✓':'FAIL', ps.wcagAAA?'good':ps.wcagAA?'warn':'bad');
  }
  setVal('px-alt',    ps.missingAlt??'—',      ps.missingAlt===0?'good':ps.missingAlt<5?'warn':'bad');
  setVal('px-aria',   ps.ariaLandmarks??'—',   ps.ariaLandmarks>0?'good':'warn');
  setVal('px-focus',  ps.focusableElements??'—');
  setVal('px-darkmode', ps.darkModeSupport ? 'YES' : 'NO', ps.darkModeSupport ? 'good' : '');
  setVal('px-h1',     ps.h1Count??'—',         ps.h1Count===1?'good':ps.h1Count>1?'warn':'bad');
  setVal('px-desc',   ps.metaDescription?'YES':'NO', ps.metaDescription?'good':'bad');
  setVal('px-og',     ps.metaOgImage?'YES':'NO', ps.metaOgImage?'good':'warn');
  setVal('px-read',   ps.readingTimeMin ? ps.readingTimeMin+' min':'—');
  setVal('px-scroll', ps.scrollDepthPct ? ps.scrollDepthPct+'%':'—');
  setVal('px-speed',  fmtMs(ps.pageLoadMs), clsMs(ps.pageLoadMs,1500,4000));
}

function renderColorPalette(palette) {
  const el = document.getElementById('px-palette');
  if (!el) return;
  if (!palette?.length) { el.innerHTML = '—'; return; }
  el.innerHTML = palette.map(c => {
    const hex = rgbToHex(c);
    return `<div class="swatch" style="background:${c}" title="${hex||c}"><span class="swatch-tip">${hex||''}</span></div>`;
  }).join('');
}

function rgbToHex(rgb) {
  const m = rgb?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  return '#' + [m[1],m[2],m[3]].map(v=>parseInt(v).toString(16).padStart(2,'0')).join('');
}

function refreshPalette() {
  try {
    chrome.tabs.query({ active:true, currentWindow:true }, tabs => {
      if (!tabs?.length) return;
      chrome.tabs.sendMessage(tabs[0].id, { type:'GET_COLOR_PALETTE' }, resp => {
        if (chrome.runtime.lastError || !resp) return;
        renderColorPalette(resp.colorPalette);
        const btn = document.getElementById('px-palette-refresh');
        if (btn) { btn.classList.add('spinning'); setTimeout(()=>btn.classList.remove('spinning'),500); }
      });
    });
  } catch(e) {}
}

// ── Settings ──
function loadSettingsUI(s, limits) {
  settings = s || {};
  siteLimits = limits || {};

  const badgeEl = document.getElementById('cfg-badge');
  if (badgeEl) badgeEl.value = settings.badgeMode || 'none';

  const breakEl = document.getElementById('cfg-break');
  if (breakEl) breakEl.checked = !!settings.breakReminder;

  const breakThEl = document.getElementById('cfg-break-thresh');
  if (breakThEl) breakThEl.value = settings.breakThreshMin || 45;

  const limitsEl = document.getElementById('cfg-limits');
  if (limitsEl) limitsEl.checked = !!settings.siteLimitsEnabled;

  const pomoWork = document.getElementById('cfg-pomo-work');
  if (pomoWork) pomoWork.value = Math.round((settings.pomoDurationMs||25*60000)/60000);

  const pomoShort = document.getElementById('cfg-pomo-short');
  if (pomoShort) pomoShort.value = Math.round((settings.pomoShortMs||5*60000)/60000);

  const pomoLong = document.getElementById('cfg-pomo-long');
  if (pomoLong) pomoLong.value = Math.round((settings.pomoLongMs||15*60000)/60000);

  renderLimitsList();
}

function saveSettings() {
  const s = {
    badgeMode:        document.getElementById('cfg-badge')?.value || 'none',
    breakReminder:    document.getElementById('cfg-break')?.checked || false,
    breakThreshMin:   parseInt(document.getElementById('cfg-break-thresh')?.value) || 45,
    siteLimitsEnabled:document.getElementById('cfg-limits')?.checked || false,
    pomoDurationMs:   (parseInt(document.getElementById('cfg-pomo-work')?.value) || 25) * 60000,
    pomoShortMs:      (parseInt(document.getElementById('cfg-pomo-short')?.value) || 5) * 60000,
    pomoLongMs:       (parseInt(document.getElementById('cfg-pomo-long')?.value) || 15) * 60000,
  };
  settings = s;
  try { chrome.runtime.sendMessage({ type:'SAVE_SETTINGS', settings:s }); } catch(e) {}
}

function renderLimitsList() {
  const el = document.getElementById('limits-list');
  if (!el) return;
  const entries = Object.entries(siteLimits);
  if (!entries.length) { el.innerHTML = ''; return; }
  el.innerHTML = entries.map(([d, mins]) => `
    <div class="limit-item">
      <span class="limit-item-name">${escHtml(d)}</span>
      <span class="limit-item-mins">${escHtml(mins)} min</span>
      <button class="limit-item-del" data-domain="${escHtml(d)}">✕</button>
    </div>
  `).join('');
  el.querySelectorAll('.limit-item-del').forEach(btn => {
    btn.addEventListener('click', () => {
      delete siteLimits[btn.dataset.domain];
      renderLimitsList();
      try { chrome.runtime.sendMessage({ type:'SAVE_SITE_LIMITS', limits:siteLimits }); } catch(e) {}
    });
  });
}

// ── Render all ──
function renderAll() {
  renderFocus(sessionData);
  renderPlayer(pageStats, sessionData);
  renderSurfer(pageStats, sessionData);
  renderDevs(pageStats);
  renderPixel(pageStats);
}

// ── Fetch data ──
function fetchPageStats() {
  try {
    chrome.tabs.query({ active:true, currentWindow:true }, tabs => {
      if (chrome.runtime.lastError || !tabs?.length) return;
      const tab = tabs[0];
      const urlEl = document.getElementById('url-display');
      if (urlEl && tab.url) {
        try { urlEl.textContent = new URL(tab.url).hostname.replace(/^www\./,''); }
        catch { urlEl.textContent = '—'; }
      }
      chrome.tabs.sendMessage(tab.id, { type:'GET_PAGE_STATS' }, resp => {
        if (chrome.runtime.lastError || !resp) return;
        pageStats = resp;
        renderAll();
      });
    });
  } catch(e) {}
}

function fetchSession() {
  try {
    chrome.runtime.sendMessage({ type:'GET_SESSION' }, resp => {
      if (chrome.runtime.lastError || !resp) return;
      sessionData = resp;
      settings = resp.settings || {};
      siteLimits = resp.siteLimits || {};
      renderAll();
      if (currentProfile === 'settings') loadSettingsUI(settings, siteLimits);
    });
    chrome.runtime.sendMessage({ type:'GET_TAB_COUNT' }, resp => {
      if (chrome.runtime.lastError || !resp) return;
      tabCount = resp.count;
      setVal('p-tabs', tabCount);
    });
  } catch(e) {}
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {

  // Mark animated elements
  document.querySelectorAll('.stat-val.anim').forEach(el => el.dataset.anim = '1');

  // Onboarding
  initOnboarding();
  document.getElementById('ob-next')?.addEventListener('click', () => {
    if (onboardStep < 2) goObSlide(onboardStep + 1);
    else hideOnboarding();
  });
  document.getElementById('ob-back')?.addEventListener('click', () => goObSlide(onboardStep - 1));
  document.querySelectorAll('.ob-dot').forEach(d => d.addEventListener('click', () => goObSlide(parseInt(d.dataset.i))));

  // Profile buttons
  document.querySelectorAll('.profile-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchProfile(btn.dataset.profile);
      if (btn.dataset.profile === 'settings') loadSettingsUI(settings, siteLimits);
    });
  });

  // Theme swatches
  ['nixie','ghibli','hacker','midnight'].forEach(t => {
    document.getElementById('t-' + t)?.addEventListener('click', () => setTheme(t));
  });

  // Palette refresh
  document.getElementById('px-palette-refresh')?.addEventListener('click', refreshPalette);

  // Pomodoro
  document.getElementById('pomo-start')?.addEventListener('click', () => {
    try {
      const isLongBreak = document.getElementById('pomo-break-long')?.classList.contains('active');
      const shortMs = (parseInt(document.getElementById('cfg-pomo-short')?.value)||5)*60000;
      const longMs  = (parseInt(document.getElementById('cfg-pomo-long')?.value)||15)*60000;
      chrome.runtime.sendMessage({
        type:'POMO_START',
        durationMs:   (parseInt(document.getElementById('cfg-pomo-work')?.value)||25)*60000,
        shortBreakMs: shortMs,
        longBreakMs:  isLongBreak ? longMs : shortMs, // force long break if picker says long
      }, () => fetchSession());
    } catch(e) {}
  });
  document.getElementById('pomo-stop')?.addEventListener('click', () => {
    try { chrome.runtime.sendMessage({ type:'POMO_STOP' }, () => fetchSession()); } catch(e) {}
  });
  document.getElementById('pomo-skip')?.addEventListener('click', () => {
    try { chrome.runtime.sendMessage({ type:'POMO_SKIP' }, () => fetchSession()); } catch(e) {}
  });

  // Break-type picker — radio-style toggle, syncs cfg-pomo-short/long selects
  document.querySelectorAll('.pomo-break-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pomo-break-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Reflect the chosen break type in the settings selects for when Start fires
      const isLong = btn.dataset.type === 'long';
      const shortSel = document.getElementById('cfg-pomo-short');
      const longSel  = document.getElementById('cfg-pomo-long');
      if (isLong && longSel)  longSel.dispatchEvent(new Event('change'));
      if (!isLong && shortSel) shortSel.dispatchEvent(new Event('change'));
    });
  });

  // When work duration select changes while not running, refresh the displayed time
  document.getElementById('cfg-pomo-work')?.addEventListener('change', () => {
    if (!sessionData?.pomo?.running) updatePomoDisplay();
  });

  // Settings auto-save on any change
  ['cfg-badge','cfg-break','cfg-break-thresh','cfg-limits','cfg-pomo-work','cfg-pomo-short','cfg-pomo-long'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', saveSettings);
  });

  // Add site limit
  document.getElementById('limit-add')?.addEventListener('click', () => {
    const dom = document.getElementById('limit-domain')?.value.trim().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
    const mins = parseInt(document.getElementById('limit-mins')?.value);
    if (!dom || !mins || mins < 1) return;
    siteLimits[dom] = mins;
    renderLimitsList();
    try { chrome.runtime.sendMessage({ type:'SAVE_SITE_LIMITS', limits:siteLimits }); } catch(e) {}
    if (document.getElementById('limit-domain')) document.getElementById('limit-domain').value = '';
    if (document.getElementById('limit-mins'))   document.getElementById('limit-mins').value = '';
  });

  // Export
  document.getElementById('btn-export')?.addEventListener('click', () => {
    try {
      chrome.runtime.sendMessage({ type:'EXPORT_DATA' }, resp => {
        if (!resp?.data) return;
        const blob = new Blob([JSON.stringify(resp.data, null, 2)], { type:'application/json' });
        const url = URL.createObjectURL(blob);
        try {
          const a = document.createElement('a');
          a.href = url; a.download = 'stats-machine-export.json'; a.click();
        } finally {
          URL.revokeObjectURL(url);
        }
      });
    } catch(e) {}
  });

  // Clear data
  document.getElementById('btn-clear')?.addEventListener('click', () => {
    if (!confirm('Clear ALL Stats Machine data? This cannot be undone.')) return;
    try { chrome.runtime.sendMessage({ type:'CLEAR_DATA' }, () => { sessionData = null; pageStats = null; renderAll(); }); } catch(e) {}
  });

  // Ko-fi / GitHub links
  document.querySelectorAll('a[target="_blank"]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      try { chrome.tabs.create({ url: a.href }); } catch(err) {}
    });
  });

  // Restore prefs
  try {
    chrome.storage.local.get(['smTheme','smProfile'], s => {
      if (s.smTheme) setTheme(s.smTheme);
      if (s.smProfile) switchProfile(s.smProfile);
    });
  } catch(e) {}

  // Clock + Pomodoro display
  tick();
  setInterval(tick, 1000);

  // Fetch data
  fetchPageStats();
  fetchSession();
  setInterval(fetchPageStats, 5000);
  setInterval(fetchSession, 5000);

  // Speed meter
  updateSpeedMeter();
  setInterval(updateSpeedMeter, 1000);

});
