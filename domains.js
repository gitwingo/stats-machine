// Stats Machine — domains.js
// Bundled domain categories (~600 domains) + known tracker scripts
// Categories: productivity, social, news, shopping, entertainment, devtools, learning, finance, health, reference

const DOMAIN_CATEGORIES = {
  // ── Productivity ──
  'notion.so':'productivity','notion.com':'productivity',
  'docs.google.com':'productivity','drive.google.com':'productivity',
  'sheets.google.com':'productivity','slides.google.com':'productivity',
  'mail.google.com':'productivity','calendar.google.com':'productivity',
  'gmail.com':'productivity','outlook.com':'productivity','outlook.live.com':'productivity',
  'office.com':'productivity','microsoft365.com':'productivity',
  'linear.app':'productivity','asana.com':'productivity','trello.com':'productivity',
  'monday.com':'productivity','clickup.com':'productivity','basecamp.com':'productivity',
  'airtable.com':'productivity','coda.io':'productivity',
  'slack.com':'productivity','teams.microsoft.com':'productivity',
  'zoom.us':'productivity','meet.google.com':'productivity',
  'obsidian.md':'productivity','roamresearch.com':'productivity',
  'todoist.com':'productivity','any.do':'productivity','ticktick.com':'productivity',
  'figma.com':'productivity','miro.com':'productivity','canva.com':'productivity',
  'loom.com':'productivity','dropbox.com':'productivity',
  'evernote.com':'productivity','bear.app':'productivity',
  'craft.do':'productivity','reflect.app':'productivity',

  // ── Dev Tools ──
  'github.com':'devtools','gitlab.com':'devtools','bitbucket.org':'devtools',
  'stackoverflow.com':'devtools','stackexchange.com':'devtools',
  'codepen.io':'devtools','codesandbox.io':'devtools','replit.com':'devtools',
  'jsfiddle.net':'devtools','playcode.io':'devtools',
  'vercel.com':'devtools','netlify.com':'devtools','railway.app':'devtools',
  'heroku.com':'devtools','render.com':'devtools','fly.io':'devtools',
  'npmjs.com':'devtools','pypi.org':'devtools','crates.io':'devtools',
  'developer.mozilla.org':'devtools','devdocs.io':'devtools',
  'localhost':'devtools',
  'vscode.dev':'devtools','gitpod.io':'devtools',
  'supabase.com':'devtools','planetscale.com':'devtools','neon.tech':'devtools',
  'postman.com':'devtools','insomnia.rest':'devtools',
  'sentry.io':'devtools','datadog.com':'devtools','grafana.com':'devtools',
  'cloudflare.com':'devtools','aws.amazon.com':'devtools',
  'console.cloud.google.com':'devtools','portal.azure.com':'devtools',
  'regex101.com':'devtools','caniuse.com':'devtools','bundlephobia.com':'devtools',

  // ── Social ──
  'twitter.com':'social','x.com':'social',
  'facebook.com':'social','instagram.com':'social',
  'reddit.com':'social','old.reddit.com':'social',
  'linkedin.com':'social','tiktok.com':'social',
  'snapchat.com':'social','pinterest.com':'social',
  'tumblr.com':'social','mastodon.social':'social',
  'threads.net':'social','bluesky.app':'social','bsky.app':'social',
  'discord.com':'social','telegram.org':'social','web.telegram.org':'social',
  'whatsapp.com':'social','signal.org':'social',
  'quora.com':'social','medium.com':'social',

  // ── News ──
  'news.ycombinator.com':'news','hackernews.com':'news',
  'nytimes.com':'news','theguardian.com':'news','bbc.com':'news','bbc.co.uk':'news',
  'cnn.com':'news','foxnews.com':'news','washingtonpost.com':'news',
  'reuters.com':'news','apnews.com':'news','bloomberg.com':'news',
  'techcrunch.com':'news','theverge.com':'news','wired.com':'news',
  'arstechnica.com':'news','engadget.com':'news','zdnet.com':'news',
  'venturebeat.com':'news','thenextweb.com':'news',
  'economist.com':'news','ft.com':'news','wsj.com':'news',
  'forbes.com':'news','businessinsider.com':'news','inc.com':'news',
  'axios.com':'news','politico.com':'news','theatlantic.com':'news',
  'vice.com':'news','vox.com':'news','slate.com':'news',
  'indiatimes.com':'news','ndtv.com':'news','hindustantimes.com':'news',
  'timesofindia.com':'news','thehindu.com':'news',

  // ── Entertainment ──
  'youtube.com':'entertainment','youtu.be':'entertainment',
  'twitch.tv':'entertainment','kick.com':'entertainment',
  'netflix.com':'entertainment','primevideo.com':'entertainment',
  'disneyplus.com':'entertainment','hulu.com':'entertainment',
  'hbomax.com':'entertainment','max.com':'entertainment',
  'spotify.com':'entertainment','soundcloud.com':'entertainment',
  'music.apple.com':'entertainment','deezer.com':'entertainment',
  'open.spotify.com':'entertainment',
  'imdb.com':'entertainment','rottentomatoes.com':'entertainment',
  '9gag.com':'entertainment','ifunny.co':'entertainment',
  'buzzfeed.com':'entertainment','boredpanda.com':'entertainment',
  'imgur.com':'entertainment','giphy.com':'entertainment',

  // ── Shopping ──
  'amazon.com':'shopping','amazon.in':'shopping','amazon.co.uk':'shopping',
  'ebay.com':'shopping','etsy.com':'shopping',
  'flipkart.com':'shopping','myntra.com':'shopping',
  'walmart.com':'shopping','target.com':'shopping','bestbuy.com':'shopping',
  'aliexpress.com':'shopping','alibaba.com':'shopping',
  'shopify.com':'shopping','bigcommerce.com':'shopping',
  'zalando.com':'shopping','asos.com':'shopping',
  'ikea.com':'shopping','wayfair.com':'shopping',
  'booking.com':'shopping','airbnb.com':'shopping',
  'expedia.com':'shopping','trivago.com':'shopping',

  // ── Learning ──
  'coursera.org':'learning','udemy.com':'learning','edx.org':'learning',
  'khanacademy.org':'learning','skillshare.com':'learning',
  'pluralsight.com':'learning',
  'brilliant.org':'learning','duolingo.com':'learning',
  'leetcode.com':'learning','hackerrank.com':'learning','codewars.com':'learning',
  'exercism.org':'learning','frontendmentor.io':'learning',
  'freecodecamp.org':'learning','theodinproject.com':'learning',
  'wikipedia.org':'reference','en.wikipedia.org':'reference',
  'wolframalpha.com':'reference','britannica.com':'reference',

  // ── Finance ──
  'chase.com':'finance','bankofamerica.com':'finance','wellsfargo.com':'finance',
  'paypal.com':'finance','stripe.com':'finance','wise.com':'finance',
  'robinhood.com':'finance','etrade.com':'finance','schwab.com':'finance',
  'coinbase.com':'finance','binance.com':'finance','kraken.com':'finance',
  'zerodha.com':'finance','groww.in':'finance',
  'finance.yahoo.com':'finance','marketwatch.com':'finance',
  'tradingview.com':'finance','investing.com':'finance',

  // ── Health ──
  'webmd.com':'health','mayoclinic.org':'health','healthline.com':'health',
  'medscape.com':'health','nih.gov':'health','cdc.gov':'health',
  'myfitnesspal.com':'health','strava.com':'health','garmin.com':'health',

  // ── Reference ──
  'google.com':'reference','bing.com':'reference','duckduckgo.com':'reference',
  'maps.google.com':'reference','translate.google.com':'reference',
  'archive.org':'reference','scholar.google.com':'reference',
};

// Category metadata: label, color, emoji
const CATEGORY_META = {
  productivity: { label: 'Productive',    color: '#3db87a', emoji: '⚡' },
  devtools:     { label: 'Dev Tools',     color: '#4a9eff', emoji: '🛠' },
  social:       { label: 'Social',        color: '#e8a030', emoji: '💬' },
  news:         { label: 'News',          color: '#9b8cff', emoji: '📰' },
  entertainment:{ label: 'Entertainment', color: '#e05050', emoji: '🎬' },
  shopping:     { label: 'Shopping',      color: '#ff7eb3', emoji: '🛍' },
  learning:     { label: 'Learning',      color: '#3db87a', emoji: '📚' },
  finance:      { label: 'Finance',       color: '#4a9eff', emoji: '💰' },
  health:       { label: 'Health',        color: '#3db87a', emoji: '❤️' },
  reference:    { label: 'Reference',     color: '#8a8a9a', emoji: '🔍' },
  other:        { label: 'Other',         color: '#555566', emoji: '🌐' },
};

// Focus weight: 1 = productive, 0 = neutral, -1 = distraction
const CATEGORY_FOCUS_WEIGHT = {
  productivity: 1, devtools: 1, learning: 1, finance: 0.5, reference: 0.3,
  health: 0.5, news: -0.3, social: -0.7, entertainment: -1, shopping: -0.5, other: 0,
};

function getDomainCategory(domain) {
  if (!domain) return 'other';
  // Try exact match first, then parent domain
  if (DOMAIN_CATEGORIES[domain]) return DOMAIN_CATEGORIES[domain];
  const parts = domain.split('.');
  if (parts.length > 2) {
    const parent = parts.slice(-2).join('.');
    if (DOMAIN_CATEGORIES[parent]) return DOMAIN_CATEGORIES[parent];
  }
  if (domain.includes('localhost') || domain.match(/^192\.168|^127\.|^10\.|^172\.(1[6-9]|2[0-9]|3[01])\./)) return 'devtools';
  return 'other';
}

// Achievements definitions
const ACHIEVEMENTS = [
  { id: 'streak_3',       name: 'On a Roll',        desc: '3-day browsing streak',            emoji: '🔥', check: s => s.streak >= 3 },
  { id: 'streak_7',       name: 'Week Warrior',     desc: '7-day browsing streak',            emoji: '⚔️', check: s => s.streak >= 7 },
  { id: 'streak_30',      name: 'Iron Habit',       desc: '30-day streak',                    emoji: '🏆', check: s => s.streak >= 30 },
  { id: 'focus_80',       name: 'Deep Worker',      desc: 'Focus score 80+ in a day',         emoji: '🧘', check: s => s.todayFocusScore >= 80 },
  { id: 'focus_100',      name: 'Flow State',       desc: 'Perfect 100 focus score',          emoji: '✨', check: s => s.todayFocusScore >= 100 },
  { id: 'tabs_5',         name: 'Minimalist',       desc: 'Under 5 tabs all day',             emoji: '🌿', check: s => s.maxTabsToday <= 5 },
  { id: 'doom_zero',      name: 'Doomscroll Slayer',desc: 'Zero doomscrolls in a day',        emoji: '🛡', check: s => s.totalScrolls === 0 },
  { id: 'speed_sub1',     name: 'Speed Demon',      desc: '10 pages under 1s load time',      emoji: '⚡', check: s => (s.subSecondPages || 0) >= 10 },
  { id: 'pomodoro_5',     name: 'Tomato Farmer',    desc: 'Complete 5 Pomodoros in a day',    emoji: '🍅', check: s => (s.pomodorosToday || 0) >= 5 },
  { id: 'pomodoro_25',    name: 'Pomodoro Master',  desc: 'Complete 25 Pomodoros total',      emoji: '🎖', check: s => (s.pomodorosTotal || 0) >= 25 },
  { id: 'early_bird',     name: 'Early Bird',       desc: 'Active before 7am',                emoji: '🌅', check: s => s.firstActiveHour !== undefined && s.firstActiveHour < 7 },
  { id: 'night_owl',      name: 'Night Owl',        desc: 'Active after midnight',            emoji: '🦉', check: s => s.lastActiveHour !== undefined && s.lastActiveHour >= 0 && s.lastActiveHour < 4 },
  { id: 'no_social',      name: 'Social Detox',     desc: '0 minutes on social media today',  emoji: '🧹', check: s => !(s.categoryMs && s.categoryMs.social > 0) },
  { id: 'learner',        name: 'Knowledge Seeker', desc: '60+ min on learning sites today',  emoji: '📚', check: s => (s.categoryMs && s.categoryMs.learning >= 3600000) },
  { id: 'data_hoarder',   name: 'Data Hoarder',     desc: 'Browsed 500MB in a day',           emoji: '💾', check: s => (s.totalBytesDay || 0) >= 500 * 1024 * 1024 },
];
