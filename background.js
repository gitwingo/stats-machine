// Stats Machine — background.js v3
// All tracking: session, idle, domains, categories, focus score, pomodoro, tab hopping, achievements, badge

importScripts('domains.js');

const DAY_MS = 86400000;
const WEEK_DAYS = 90; // keep 90 days of history

// ── In-memory state ──
let activeTabId   = null;
let activeStart   = null;
let todayMs       = 0;
let idleMs        = 0;
let domainMs      = {};
let categoryMs    = {};
let scrollEvents  = {};
let isIdle        = false;
let idleStart     = null;
let tabSessionMs  = {};
let tabHops       = 0;        // tab switches today
let lastHopTime   = null;
let maxTabsToday  = 0;
let firstActiveHour = null;
let lastActiveHour  = null;
let subSecondPages  = 0;
let totalBytesDay   = 0;
let notifPermission = 'unknown';

// Lifetime accumulators
let allTimeMs     = 0;
let allTimeIdleMs = 0;
let allTimeDays   = 0;        // total days with any activity
let allTimeHops   = 0;        // total tab switches ever

// Pomodoro state
let pomo = {
  running: false,
  mode: 'work',        // 'work' | 'break'
  startMs: null,
  durationMs: 25 * 60 * 1000,
  shortBreakMs: 5 * 60 * 1000,
  longBreakMs: 15 * 60 * 1000,
  completedToday: 0,
  completedTotal: 0,
  round: 0,            // 0-3, every 4 work rounds = long break
};

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

// ── Day init ──
async function loadDayData() {
  const stored = await chrome.storage.local.get([
    'dayKey','todayMs','domainMs','categoryMs','streak','lastActiveDay',
    'idleMs','scrollEvents','tabHops','maxTabsToday','firstActiveHour',
    'lastActiveHour','subSecondPages','totalBytesDay',
    'pomo','unlockedAchievements','history90',
    'allTimeMs','allTimeIdleMs','allTimeDays','allTimeHops'
  ]);
  const today = getToday();

  // Restore lifetime accumulators
  allTimeMs     = stored.allTimeMs     || 0;
  allTimeIdleMs = stored.allTimeIdleMs || 0;
  allTimeDays   = stored.allTimeDays   || 0;
  allTimeHops   = stored.allTimeHops   || 0;

  if (stored.dayKey !== today) {
    // Archive yesterday into history90
    if (stored.dayKey && stored.todayMs > 0) {
      const hist = stored.history90 || {};
      hist[stored.dayKey] = {
        ms: stored.todayMs || 0,
        categoryMs: stored.categoryMs || {},
        domainMs: stored.domainMs || {},
        focusScore: computeFocusScore(stored.categoryMs || {}, stored.domainMs || {}, stored.scrollEvents || {}, stored.tabHops || 0),
      };
      // Prune to 90 days
      const keys = Object.keys(hist).sort();
      while (keys.length > WEEK_DAYS) { delete hist[keys.shift()]; }
      await chrome.storage.local.set({ history90: hist });

      // Accumulate yesterday into lifetime totals
      allTimeMs     += stored.todayMs  || 0;
      allTimeIdleMs += stored.idleMs   || 0;
      allTimeHops   += stored.tabHops  || 0;
      if ((stored.todayMs || 0) > 0) allTimeDays += 1;
      await chrome.storage.local.set({ allTimeMs, allTimeIdleMs, allTimeDays, allTimeHops });
    }

    const yesterday = stored.lastActiveDay;
    // Use stored.dayKey (the day being rolled over) as the reference for "was yesterday".
    // This is correct regardless of what time the service worker restarts, unlike
    // computing Date.now() - DAY_MS which can give "day before yesterday" near midnight.
    const rolledDay = stored.dayKey; // the day that just ended
    let streak = stored.streak || 0;
    if (yesterday && yesterday === rolledDay) streak += 1;
    else if (yesterday) streak = 1;
    // If yesterday is undefined/null (brand new install), leave streak at 0; it will
    // be set to 1 on the first real save via lastActiveDay update.

    todayMs = 0; idleMs = 0; domainMs = {}; categoryMs = {};
    scrollEvents = {}; tabHops = 0; maxTabsToday = 0;
    firstActiveHour = null; lastActiveHour = null;
    subSecondPages = 0; totalBytesDay = 0;
    tabSessionMs = {};

    // NOTE: lastActiveDay is intentionally NOT set to today here.
    // It must stay as yesterday's date so the next midnight rollover can
    // correctly detect a consecutive day and increment the streak.
    // saveDayData() will write today's date only after real activity occurs.
    await chrome.storage.local.set({
      dayKey: today, todayMs: 0, domainMs: {}, categoryMs: {},
      idleMs: 0, streak, scrollEvents: {},
      tabHops: 0, maxTabsToday: 0, subSecondPages: 0, totalBytesDay: 0,
    });
  } else {
    todayMs       = stored.todayMs       || 0;
    domainMs      = stored.domainMs      || {};
    categoryMs    = stored.categoryMs    || {};
    idleMs        = stored.idleMs        || 0;
    scrollEvents  = stored.scrollEvents  || {};
    tabHops       = stored.tabHops       || 0;
    maxTabsToday  = stored.maxTabsToday  || 0;
    firstActiveHour = stored.firstActiveHour ?? null;
    lastActiveHour  = stored.lastActiveHour  ?? null;
    subSecondPages  = stored.subSecondPages  || 0;
    totalBytesDay   = stored.totalBytesDay   || 0;
  }

  // Restore pomodoro — always carry over settings; reset daily count on new day
  if (stored.pomo) {
    const isNewDay = stored.dayKey !== getToday();
    pomo.completedToday = isNewDay ? 0 : (stored.pomo.completedToday || 0);
    pomo.completedTotal = stored.pomo.completedTotal || 0;
    pomo.round          = stored.pomo.round || 0;
    pomo.durationMs     = stored.pomo.durationMs     || 25 * 60 * 1000;
    pomo.shortBreakMs   = stored.pomo.shortBreakMs   || 5 * 60 * 1000;
    pomo.longBreakMs    = stored.pomo.longBreakMs    || 15 * 60 * 1000;
  }

  // Recover active tab after a service-worker restart so tracking resumes immediately
  // without waiting for the next tab-activation event.
  try {
    const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (activeTabs.length && !isIdle) {
      activeTabId = activeTabs[0].id;
      activeStart = Date.now();
    }
  } catch(e) {}
}

async function saveDayData() {
  await chrome.storage.local.set({
    dayKey: getToday(), todayMs, domainMs, categoryMs,
    idleMs, scrollEvents, tabHops, maxTabsToday,
    firstActiveHour, lastActiveHour, subSecondPages, totalBytesDay,
    lastActiveDay: getToday(),
  });
}

// ── Focus score ──
function computeFocusScore(catMs, domMs, scrollEvts, hops) {
  const total = Object.values(catMs).reduce((s, v) => s + v, 0);
  if (total < 60000) return null; // not enough data

  let weighted = 0;
  for (const [cat, ms] of Object.entries(catMs)) {
    const w = CATEGORY_FOCUS_WEIGHT[cat] ?? 0;
    weighted += w * ms;
  }
  let score = 50 + (weighted / total) * 50;

  // Penalise heavy doomscrolling
  const scrollTotal = Object.values(scrollEvts).reduce((s, v) => s + v, 0);
  if (scrollTotal > 300) score -= 10;
  else if (scrollTotal > 100) score -= 5;

  // Penalise tab hopping
  if (hops > 200) score -= 10;
  else if (hops > 80) score -= 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return null; }
}

function recordHour() {
  const h = new Date().getHours();
  if (firstActiveHour === null) firstActiveHour = h;
  lastActiveHour = h;
}

function tickActiveTab() {
  if (activeTabId === null || activeStart === null || isIdle) return;
  const now = Date.now();
  const elapsed = now - activeStart;
  activeStart = now;
  todayMs = Math.min(todayMs + elapsed, DAY_MS);
  tabSessionMs[activeTabId] = (tabSessionMs[activeTabId] || 0) + elapsed;
  recordHour();

  chrome.tabs.get(activeTabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    const domain = getDomain(tab.url);
    if (domain) {
      domainMs[domain] = (domainMs[domain] || 0) + elapsed;
      const cat = getDomainCategory(domain);
      categoryMs[cat] = (categoryMs[cat] || 0) + elapsed;
    }
  });
}

function tickIdle() {
  if (!isIdle || idleStart === null) return;
  idleMs += Date.now() - idleStart;
  idleStart = Date.now();
}

// ── Pomodoro logic ──
function pomodoroTick() {
  if (!pomo.running || !pomo.startMs) return;
  const elapsed = Date.now() - pomo.startMs;
  const dur = pomo.mode === 'work' ? pomo.durationMs
    : pomo.round % 4 === 0 ? pomo.longBreakMs : pomo.shortBreakMs;

  if (elapsed >= dur) {
    if (pomo.mode === 'work') {
      pomo.completedToday++;
      pomo.completedTotal++;
      pomo.round = (pomo.round + 1) % 4;
      // Notify
      chrome.notifications.create({
        type: 'basic', iconUrl: 'icons/icon48.png',
        title: '🍅 Pomodoro done!',
        message: pomo.round % 4 === 0 ? 'Take a long break — 15 min!' : 'Take a short break — 5 min!',
      });
      pomo.mode = 'break';
    } else {
      chrome.notifications.create({
        type: 'basic', iconUrl: 'icons/icon48.png',
        title: '⏱ Break over!',
        message: 'Time to focus. New Pomodoro starting.',
      });
      pomo.mode = 'work';
    }
    pomo.startMs = Date.now();
    savePomo();
    updateBadge();
  }
}

function savePomo() {
  chrome.storage.local.set({ pomo: {
    completedToday: pomo.completedToday,
    completedTotal: pomo.completedTotal,
    round: pomo.round,
    durationMs: pomo.durationMs,
    shortBreakMs: pomo.shortBreakMs,
    longBreakMs: pomo.longBreakMs,
  }});
}

// ── Badge update ──
async function updateBadge() {
  try {
    const stored = await chrome.storage.local.get(['smSettings']);
    const settings = stored.smSettings || {};

    if (pomo.running) {
      const dur = pomo.mode === 'work' ? pomo.durationMs
        : pomo.round % 4 === 0 ? pomo.longBreakMs : pomo.shortBreakMs;
      const remaining = Math.max(0, dur - (Date.now() - pomo.startMs));
      const mins = Math.ceil(remaining / 60000);
      chrome.action.setBadgeText({ text: String(mins) });
      chrome.action.setBadgeBackgroundColor({ color: pomo.mode === 'work' ? '#e05050' : '#3db87a' });
    } else if (settings.badgeMode === 'tabs') {
      const tabs = await chrome.tabs.query({});
      chrome.action.setBadgeText({ text: String(tabs.length) });
      chrome.action.setBadgeBackgroundColor({ color: '#555566' });
    } else if (settings.badgeMode === 'focus') {
      const score = computeFocusScore(categoryMs, domainMs, scrollEvents, tabHops);
      if (score !== null) {
        const color = score >= 70 ? '#3db87a' : score >= 40 ? '#e8a030' : '#e05050';
        chrome.action.setBadgeText({ text: '' });
        chrome.action.setBadgeBackgroundColor({ color });
      } else {
        chrome.action.setBadgeText({ text: '' });
      }
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  } catch(e) {}
}

// ── Break reminder ──
let lastBreakCheck = Date.now();
async function checkBreakReminder() {
  const stored = await chrome.storage.local.get(['smSettings']);
  const settings = stored.smSettings || {};
  if (!settings.breakReminder) return;
  const threshMin = settings.breakThreshMin || 45;
  if (todayMs - idleMs > threshMin * 60 * 1000) {
    const now = Date.now();
    if (now - lastBreakCheck > threshMin * 60 * 1000) {
      lastBreakCheck = now;
      chrome.notifications.create({
        type: 'basic', iconUrl: 'icons/icon48.png',
        title: '👁 Time for a break!',
        message: `You've been browsing for ${threshMin}+ minutes straight. Rest your eyes!`,
      });
    }
  }
}

// ── Achievements check ──
async function checkAchievements() {
  const stored = await chrome.storage.local.get(['unlockedAchievements','pomo','streak']);
  const unlocked = new Set(stored.unlockedAchievements || []);
  const newlyUnlocked = [];

  const state = {
    streak: stored.streak || 0,
    todayFocusScore: computeFocusScore(categoryMs, domainMs, scrollEvents, tabHops),
    maxTabsToday,
    totalScrolls: Object.values(scrollEvents).reduce((s, v) => s + v, 0),
    subSecondPages,
    pomodorosToday: pomo.completedToday,
    pomodorosTotal: pomo.completedTotal,
    firstActiveHour,
    lastActiveHour,
    categoryMs,
    totalBytesDay,
  };

  for (const ach of ACHIEVEMENTS) {
    if (!unlocked.has(ach.id) && ach.check(state)) {
      unlocked.add(ach.id);
      newlyUnlocked.push(ach);
    }
  }

  if (newlyUnlocked.length > 0) {
    await chrome.storage.local.set({ unlockedAchievements: [...unlocked] });
    for (const ach of newlyUnlocked) {
      chrome.notifications.create({
        type: 'basic', iconUrl: 'icons/icon48.png',
        title: `${ach.emoji} Achievement Unlocked!`,
        message: `${ach.name} — ${ach.desc}`,
      });
    }
  }
}

// ── Soft site time limit warning ──
async function checkSiteLimits() {
  if (!activeTabId) return;
  const stored = await chrome.storage.local.get(['smSettings','smSiteLimits']);
  const settings = stored.smSettings || {};
  if (!settings.siteLimitsEnabled) return;
  const limits = stored.smSiteLimits || {};

  chrome.tabs.get(activeTabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    const domain = getDomain(tab.url);
    if (!domain || !limits[domain]) return;
    const limitMs = limits[domain] * 60 * 1000;
    const spentMs = domainMs[domain] || 0;
    if (spentMs >= limitMs) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_SOFT_LIMIT',
        domain,
        spentMs,
        limitMs,
      });
    }
  });
}

// ── Alarms ──
chrome.alarms.create('tick',    { periodInMinutes: 1/12 }); // 5s
chrome.alarms.create('minute',  { periodInMinutes: 1 });
chrome.alarms.create('badge',   { periodInMinutes: 1/6 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'tick') {
    tickActiveTab();
    tickIdle();
    pomodoroTick();
    saveDayData();
  }
  if (alarm.name === 'minute') {
    // Midnight rollover — catch the day change even without a service worker restart
    const today = getToday();
    const stored = await chrome.storage.local.get(['dayKey']);
    if (stored.dayKey && stored.dayKey !== today) await loadDayData();
    checkBreakReminder();
    checkAchievements();
    checkSiteLimits();
  }
  if (alarm.name === 'badge') {
    updateBadge();
  }
});

// ── Tab events ──
chrome.tabs.onActivated.addListener(({ tabId }) => {
  tickActiveTab();
  activeTabId = tabId;
  activeStart = Date.now();
  tabHops++;
  recordHour();

  chrome.tabs.query({}, (tabs) => {
    const count = tabs.length;
    if (count > maxTabsToday) maxTabsToday = count;
    updateBadge();
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) {
    tickActiveTab();
    activeTabId = null;
    activeStart = null;
  }
  delete tabSessionMs[tabId];
});

// ── Idle ──
chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener((state) => {
  if (state === 'idle' || state === 'locked') {
    if (!isIdle) { tickActiveTab(); activeStart = null; isIdle = true; idleStart = Date.now(); }
  } else if (state === 'active') {
    if (isIdle) { tickIdle(); isIdle = false; idleStart = null; if (activeTabId) activeStart = Date.now(); }
  }
});

// ── Messages ──
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === 'SCROLL_EVENT') {
    const domain = getDomain(msg.url || '');
    if (domain) scrollEvents[domain] = (scrollEvents[domain] || 0) + 1;
    return;
  }

  if (msg.type === 'REPORT_NOTIF_PERMISSION') {
    notifPermission = msg.permission || 'unknown';
    return;
  }

  if (msg.type === 'REPORT_PAGE_LOAD') {
    if (msg.loadMs && msg.loadMs < 1000) subSecondPages++;
    if (msg.bytes) totalBytesDay += msg.bytes;
    return;
  }

  if (msg.type === 'GET_SESSION') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      const stored = await chrome.storage.local.get([
        'streak','history90','unlockedAchievements','smSettings','smSiteLimits'
      ]);

      let tabMs = tabSessionMs[tab?.id] || 0;
      if (tab && activeTabId === tab.id && activeStart && !isIdle) tabMs += Date.now() - activeStart;

      const topDomains = Object.entries(domainMs)
        .sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([d, ms]) => ({ domain: d, ms, cat: getDomainCategory(d) }));

      const scrollTotal = Object.values(scrollEvents).reduce((s, v) => s + v, 0);
      const focusScore = computeFocusScore(categoryMs, domainMs, scrollEvents, tabHops);

      // Build pomo response
      let pomoRemaining = null;
      if (pomo.running && pomo.startMs) {
        const dur = pomo.mode === 'work' ? pomo.durationMs
          : pomo.round % 4 === 0 ? pomo.longBreakMs : pomo.shortBreakMs;
        pomoRemaining = Math.max(0, dur - (Date.now() - pomo.startMs));
      }

      sendResponse({
        todayMs, idleMs, domainMs, categoryMs, topDomains,
        streak: stored.streak || 0,
        tabMs, tabHops, maxTabsToday,
        firstActiveHour, lastActiveHour,
        url: tab?.url || '',
        tabTitle: tab?.title || '',
        scrollTotal, scrollEvents,
        isIdle, notifPermission,
        focusScore,
        subSecondPages, totalBytesDay,
        history90: stored.history90 || {},
        unlockedAchievements: stored.unlockedAchievements || [],
        settings: stored.smSettings || {},
        siteLimits: stored.smSiteLimits || {},
        pomo: { ...pomo, remaining: pomoRemaining },
        // Lifetime stats — today's live values added on top of stored totals
        allTimeMs:     allTimeMs + todayMs,
        allTimeIdleMs: allTimeIdleMs + idleMs,
        allTimeDays:   allTimeDays + (todayMs > 0 ? 1 : 0),
        allTimeHops:   allTimeHops + tabHops,
      });
    });
    return true;
  }

  if (msg.type === 'GET_TAB_COUNT') {
    chrome.tabs.query({}, (tabs) => sendResponse({ count: tabs.length }));
    return true;
  }

  if (msg.type === 'POMO_START') {
    pomo.running = true;
    pomo.mode = 'work';
    pomo.startMs = Date.now();
    if (msg.durationMs) pomo.durationMs = msg.durationMs;
    if (msg.shortBreakMs) pomo.shortBreakMs = msg.shortBreakMs;
    if (msg.longBreakMs) pomo.longBreakMs = msg.longBreakMs;
    savePomo(); updateBadge();
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'POMO_STOP') {
    pomo.running = false; pomo.startMs = null; pomo.mode = 'work';
    savePomo(); updateBadge();
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'POMO_SKIP') {
    pomo.mode = pomo.mode === 'work' ? 'break' : 'work';
    if (pomo.mode === 'work') pomo.round = (pomo.round + 1) % 4;
    pomo.startMs = Date.now();
    savePomo(); updateBadge();
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'SAVE_SETTINGS') {
    chrome.storage.local.set({ smSettings: msg.settings });
    updateBadge();
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'SAVE_SITE_LIMITS') {
    chrome.storage.local.set({ smSiteLimits: msg.limits });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'SAVE_DOMAIN_CATEGORY') {
    // User overrides a domain's category
    chrome.storage.local.get(['userCategories'], (s) => {
      const uc = s.userCategories || {};
      uc[msg.domain] = msg.category;
      chrome.storage.local.set({ userCategories: uc });
    });
    return;
  }

  if (msg.type === 'EXPORT_DATA') {
    chrome.storage.local.get(null, (all) => {
      sendResponse({ data: all });
    });
    return true;
  }

  if (msg.type === 'CLEAR_DATA') {
    chrome.storage.local.clear(() => {
      todayMs = 0; idleMs = 0; domainMs = {}; categoryMs = {};
      scrollEvents = {}; tabHops = 0; maxTabsToday = 0;
      subSecondPages = 0; totalBytesDay = 0;
      allTimeMs = 0; allTimeIdleMs = 0; allTimeDays = 0; allTimeHops = 0;
      pomo = { running:false, mode:'work', startMs:null, durationMs:25*60000, shortBreakMs:5*60000, longBreakMs:15*60000, completedToday:0, completedTotal:0, round:0 };
      loadDayData();
      sendResponse({ ok: true });
    });
    return true;
  }
});

loadDayData();
updateBadge();
