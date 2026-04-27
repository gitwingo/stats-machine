// Stats Machine — content.js v3
// Core Web Vitals, tracker detection, scroll tracking, soft limit overlay, intent prompt

(function () {
  if (window.__statsMachineInjected) return;
  window.__statsMachineInjected = true;

  // ── Console error intercept ──
  window.__smConsoleErrors = 0;
  const origError = console.error.bind(console);
  console.error = (...args) => { window.__smConsoleErrors++; origError(...args); };

  // ── Core Web Vitals via PerformanceObserver ──
  const vitals = { lcp: null, cls: 0, fid: null, inp: null, fcp: null };

  try {
    new PerformanceObserver(list => {
      const entries = list.getEntries();
      vitals.lcp = Math.round(entries[entries.length - 1].startTime);
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch(e) {}

  try {
    let clsVal = 0, clsSession = 0, clsLastTime = 0, clsSessionStart = 0;
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          const now = entry.startTime;
          // W3C spec: new session window if gap > 1s OR current session > 5s
          if (now - clsLastTime > 1000 || now - clsSessionStart > 5000) {
            clsVal = Math.max(clsVal, clsSession);
            clsSession = 0;
            clsSessionStart = now;
          }
          clsSession += entry.value;
          clsLastTime = now;
          vitals.cls = Math.round(Math.max(clsVal, clsSession) * 1000) / 1000;
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch(e) {}

  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') vitals.fcp = Math.round(entry.startTime);
      }
    }).observe({ type: 'paint', buffered: true });
  } catch(e) {}

  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        vitals.fid = Math.round(entry.processingStart - entry.startTime);
      }
    }).observe({ type: 'first-input', buffered: true });
  } catch(e) {}

  // ── Tracker detection ──
  const TRACKER_PATTERNS = [
    { name: 'Google Analytics', pattern: 'google-analytics.com' },
    { name: 'GA4',              pattern: 'googletagmanager.com' },
    { name: 'Meta Pixel',       pattern: 'connect.facebook.net' },
    { name: 'Hotjar',           pattern: 'hotjar.com' },
    { name: 'Mixpanel',         pattern: 'mixpanel.com' },
    { name: 'Amplitude',        pattern: 'amplitude.com' },
    { name: 'Segment',          pattern: 'cdn.segment.com' },
    { name: 'Intercom',         pattern: 'intercom.io' },
    { name: 'Hubspot',          pattern: 'hs-scripts.com' },
    { name: 'Crisp',            pattern: 'crisp.chat' },
    { name: 'Fullstory',        pattern: 'fullstory.com' },
    { name: 'Clarity',          pattern: 'clarity.ms' },
    { name: 'Twitter Pixel',    pattern: 'static.ads-twitter.com' },
    { name: 'LinkedIn Insight', pattern: 'snap.licdn.com' },
    { name: 'TikTok Pixel',     pattern: 'analytics.tiktok.com' },
    { name: 'Heap',             pattern: 'heapanalytics.com' },
    { name: 'Optimizely',       pattern: 'optimizely.com' },
    { name: 'New Relic',        pattern: 'nr-data.net' },
    { name: 'Quantcast',        pattern: 'quantserve.com' },
    { name: 'Comscore',         pattern: 'scorecardresearch.com' },
  ];

  // ── Tracker detection — use resource timing URLs (catches dynamic injection) ──
  function detectTrackers() {
    const resources = performance.getEntriesByType('resource');
    const resourceUrls = resources.map(r => r.name.toLowerCase());
    // Also check static script tags as fallback
    const scriptSrcs = [...document.querySelectorAll('script[src]')].map(s => s.src.toLowerCase());
    const allUrls = [...new Set([...resourceUrls, ...scriptSrcs])];

    const found = [];
    for (const t of TRACKER_PATTERNS) {
      if (allUrls.some(u => u.includes(t.pattern))) found.push(t.name);
    }
    return found;
  }

  // Third-party scripts (resource timing based)
  function countThirdParty() {
    const host = location.hostname.replace(/^www\./, '');
    const resources = performance.getEntriesByType('resource');
    return resources.filter(r => {
      try {
        const rHost = new URL(r.name).hostname.replace(/^www\./, '');
        return rHost !== host && rHost !== '';
      } catch { return false; }
    }).length;
  }

  // ── SEO score ──
  function calcSeoScore(stats) {
    let score = 0, max = 0;
    const c = (v, pts) => { max += pts; if (v) score += pts; };
    c(stats.metaTitle?.length >= 10 && stats.metaTitle?.length <= 60, 15);
    c(stats.metaDescription?.length >= 50 && stats.metaDescription?.length <= 160, 15);
    c(stats.h1Count === 1, 10);
    c(stats.metaViewport, 10);
    c(stats.isHttps, 10);
    c(stats.canonicalUrl, 8);
    c(stats.metaOgTitle, 6);
    c(stats.metaOgImage, 6);
    c(stats.metaOgDesc, 6);
    c(stats.missingAlt === 0, 8);
    c(stats.pageLoadMs && stats.pageLoadMs < 3000, 6);
    return Math.round((score / max) * 100);
  }

  // ── Scroll tracking ──
  let scrollTimer = null;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      try { chrome.runtime.sendMessage({ type: 'SCROLL_EVENT', url: location.href }); } catch(e) {}
    }, 500);
  }, { passive: true });

  // ── Notification permission ──
  try {
    chrome.runtime.sendMessage({ type: 'REPORT_NOTIF_PERMISSION', permission: Notification.permission });
  } catch(e) {}

  // ── Report page load ──
  window.addEventListener('load', () => {
    setTimeout(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      if (nav) {
        const resources = performance.getEntriesByType('resource');
        const bytes = resources.reduce((s, r) => s + (r.transferSize || 0), 0);
        try {
          chrome.runtime.sendMessage({
            type: 'REPORT_PAGE_LOAD',
            loadMs: Math.round(nav.loadEventEnd - nav.startTime),
            bytes
          });
        } catch(e) {}
      }
    }, 500);
  });

  // ── Collect all stats ──
  function collectStats() {
    const stats = {};

    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) {
      stats.pageLoadMs   = Math.round(nav.loadEventEnd - nav.startTime);
      stats.dnsMs        = Math.round(nav.domainLookupEnd - nav.domainLookupStart);
      stats.sslMs        = (nav.secureConnectionStart > 0)
        ? Math.round(nav.connectEnd - nav.secureConnectionStart)
        : 0;
      stats.ttfbMs       = Math.round(nav.responseStart - nav.requestStart);
      stats.redirectCount= nav.redirectCount;
      stats.protocol     = nav.nextHopProtocol || 'unknown';
    }

    const resources = performance.getEntriesByType('resource');
    stats.totalRequests = resources.length;
    stats.totalBytes    = Math.round(resources.reduce((s, r) => s + (r.transferSize || 0), 0));

    const apiEntries = resources.filter(r => r.initiatorType === 'fetch' || r.initiatorType === 'xmlhttprequest');
    if (apiEntries.length > 0) {
      const recent = apiEntries.slice(-10);
      stats.apiLatencyMs = Math.round(recent.reduce((s, e) => s + Math.max(0, e.responseStart - e.requestStart), 0) / recent.length);
      stats.apiCallCount = apiEntries.length;
    } else {
      stats.apiLatencyMs = null; stats.apiCallCount = 0;
    }

    stats.isHttps = location.protocol === 'https:';

    try {
      const c = document.cookie;
      stats.cookieCount = c ? c.split(';').filter(x => x.trim()).length : 0;
    } catch { stats.cookieCount = 0; }

    try {
      stats.fonts = [...new Set([...document.fonts].map(f => f.family.replace(/['"]/g, '').trim()))].slice(0, 8);
    } catch { stats.fonts = []; }

    // Color palette
    try {
      const els = [...document.querySelectorAll('*')].slice(0, 400);
      const colorMap = new Map();
      els.forEach(el => {
        const s = getComputedStyle(el);
        ['backgroundColor','color'].forEach(p => {
          const c = s[p];
          if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent' && c.startsWith('rgb')) {
            colorMap.set(c, (colorMap.get(c) || 0) + 1);
          }
        });
      });
      stats.colorPalette = [...colorMap.entries()].sort((a,b) => b[1]-a[1]).slice(0, 12).map(([c]) => c);
    } catch { stats.colorPalette = []; }

    const imgs = [...document.querySelectorAll('img')];
    stats.totalImages    = imgs.length;
    stats.missingAlt     = imgs.filter(i => !i.alt || !i.alt.trim()).length;
    stats.oversizedImages= imgs.filter(img => img.naturalWidth && img.width && img.naturalWidth > img.width * 2 && img.naturalWidth > 400).length;

    stats.metaTitle       = document.title || '';
    stats.metaDescription = document.querySelector('meta[name="description"]')?.content || '';
    stats.metaViewport    = !!document.querySelector('meta[name="viewport"]');
    stats.metaOgTitle     = document.querySelector('meta[property="og:title"]')?.content || '';
    stats.metaOgImage     = document.querySelector('meta[property="og:image"]')?.content || '';
    stats.metaOgDesc      = document.querySelector('meta[property="og:description"]')?.content || '';
    stats.canonicalUrl    = document.querySelector('link[rel="canonical"]')?.href || '';
    stats.h1Count         = document.querySelectorAll('h1').length;
    stats.h2Count         = document.querySelectorAll('h2').length;
    stats.headingCount    = document.querySelectorAll('h1,h2,h3,h4,h5,h6').length;

    const links = [...document.querySelectorAll('a[href]')];
    stats.totalLinks = links.length;
    stats.emptyLinks = links.filter(a => !a.href || a.href.endsWith('#')).length;

    try {
      const s = getComputedStyle(document.body);
      stats.bodyBg = s.backgroundColor; stats.bodyColor = s.color;
      function parsRgb(str) { const m = str?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); return m ? [+m[1],+m[2],+m[3]] : null; }
      function lum([r,g,b]) { return [r,g,b].map(v => { v/=255; return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4); }).reduce((s,v,i)=>s+v*[0.2126,0.7152,0.0722][i],0); }
      const fg = parsRgb(stats.bodyColor), bg = parsRgb(stats.bodyBg);
      if (fg && bg) {
        const ratio = (Math.max(lum(fg),lum(bg))+0.05)/(Math.min(lum(fg),lum(bg))+0.05);
        stats.contrastRatio = Math.round(ratio*100)/100;
        stats.wcagAA = ratio >= 4.5; stats.wcagAAA = ratio >= 7;
      }
    } catch {}

    stats.ariaLandmarks     = document.querySelectorAll('[role="main"],[role="navigation"],[role="banner"],[role="contentinfo"]').length;
    stats.focusableElements = document.querySelectorAll('a,button,input,select,textarea,[tabindex]').length;

    // Ads — broader selector set covering more ad networks
    const adSel = [
      'iframe[src*="doubleclick"]','iframe[src*="googlesyndication"]',
      'iframe[src*="amazon-adsystem"]','iframe[src*="ads."]',
      'ins.adsbygoogle','div[id*="google_ads"]','div[id*="adsbygoogle"]',
      '.advertisement','.ad-container','.ad-wrapper','[data-ad-slot]',
      '[data-ad-unit]','[class*="ad-banner"]','[id*="ad-banner"]',
      '[class*="sponsored"]','[data-google-query-id]'
    ];
    stats.adsOnPage = document.querySelectorAll(adSel.join(',')).length;

    // Tech stack — resource-timing based (works on bundled/SSR apps)
    const stack = [];
    const resUrls = performance.getEntriesByType('resource').map(r => r.name);
    const hasRes = (pat) => resUrls.some(u => u.includes(pat));
    // Framework detection via globals + DOM + resource hints
    if (window.React || window.__REACT_DEVTOOLS_GLOBAL_HOOK__ ||
        document.querySelector('[data-reactroot],[data-reactid]') || hasRes('/react')) stack.push('React');
    if (window.angular || document.querySelector('[ng-version],[ng-app]')) stack.push('Angular');
    if (window.__vue_app__ || window.Vue || document.querySelector('[data-v-]')) stack.push('Vue');
    if (window.__NEXT_DATA__ || document.querySelector('#__NEXT_DATA__') ||
        hasRes('/_next/') || document.querySelector('[data-nextjs-scroll-focus-boundary]')) stack.push('Next.js');
    if (window.__nuxt || window.__NUXT__ || hasRes('/_nuxt/')) stack.push('Nuxt');
    if (window.Shopify || hasRes('cdn.shopify.com') || document.querySelector('[data-shopify]')) stack.push('Shopify');
    if (window.wp || document.querySelector('link[href*="/wp-content/"]') || hasRes('/wp-content/')) stack.push('WordPress');
    if (window.Webflow || document.querySelector('[data-wf-page]')) stack.push('Webflow');
    if (window.Framer || hasRes('framerusercontent.com')) stack.push('Framer');
    if (window.gtag || hasRes('googletagmanager.com')) stack.push('GTM');
    if (window.Stripe || hasRes('js.stripe.com')) stack.push('Stripe');
    stats.techStack = [...new Set(stack)];

    stats.consoleErrors = window.__smConsoleErrors || 0;
    stats.pageLanguage  = document.documentElement.lang || navigator.language || 'unknown';

    const wc = (document.body?.innerText || '').trim().split(/\s+/).filter(w => w.length > 0).length;
    stats.wordCount      = wc;
    stats.readingTimeMin = wc >= 50 ? Math.max(1, Math.round(wc / 200)) : null;

    // Scroll depth — cap at 100, handle short pages correctly
    const scrollPct = window.scrollY + window.innerHeight;
    const pageH = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 1);
    stats.scrollDepthPct = Math.min(100, Math.round((scrollPct / pageH) * 100));

    const audios = [...document.querySelectorAll('audio,video')];
    stats.soundPlaying = audios.some(a => !a.paused && !a.muted && a.volume > 0);

    const cdnHints = ['cloudflare','fastly','akamai','cloudfront','cdn','jsdelivr','unpkg'];
    stats.cdnDetected = resources.some(r => cdnHints.some(h => r.name.toLowerCase().includes(h)));

    try { stats.notifPermission = Notification.permission; } catch { stats.notifPermission = 'unknown'; }

    stats.seoScore       = calcSeoScore(stats);
    stats.hasLoginForm   = !!document.querySelector('input[type="password"]');
    stats.hasSearchForm  = !!document.querySelector('input[type="search"], input[placeholder*="search" i]');

    // Dark mode — comprehensive check
    stats.darkModeSupport = (function() {
      // 1. OS-level dark mode preference
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return true;
      // 2. color-scheme meta tag
      const csMeta = document.querySelector('meta[name="color-scheme"]');
      if (csMeta && csMeta.content && csMeta.content.includes('dark')) return true;
      // 3. Common dark-mode class patterns on html/body
      const rootCls = (document.documentElement.className + ' ' + document.body.className).toLowerCase();
      if (/\bdark\b|\bdark-mode\b|\bdark-theme\b/.test(rootCls)) return true;
      // 4. data-theme attribute
      const theme = document.documentElement.getAttribute('data-theme') || document.body.getAttribute('data-theme') || '';
      if (theme.toLowerCase().includes('dark')) return true;
      // 5. color-scheme CSS property on root
      try {
        const cs = getComputedStyle(document.documentElement).colorScheme || '';
        if (cs.includes('dark')) return true;
      } catch(e) {}
      // 6. Stylesheet with prefers-color-scheme media
      const sheets = [...document.querySelectorAll('link[rel="stylesheet"][media],style[media]')];
      if (sheets.some(s => (s.getAttribute('media')||'').includes('prefers-color-scheme'))) return true;
      return false;
    })();

    // Core Web Vitals
    stats.lcp = vitals.lcp;
    stats.cls = vitals.cls;
    stats.fcp = vitals.fcp;
    stats.fid = vitals.fid;

    // Trackers
    stats.trackers      = detectTrackers();
    stats.trackerCount  = stats.trackers.length;
    stats.thirdPartyScripts = countThirdParty();

    // Local storage size estimate
    try {
      let lsSize = 0;
      for (const k in localStorage) {
        if (localStorage.hasOwnProperty(k)) lsSize += (localStorage[k]?.length || 0) * 2;
      }
      stats.localStorageKb = Math.round(lsSize / 1024);
    } catch { stats.localStorageKb = 0; }

    // Render-blocking scripts
    stats.renderBlockingScripts = document.querySelectorAll('head script:not([async]):not([defer]):not([type="module"])').length;

    // CO2
    stats.co2g = Math.round((stats.totalBytes / (1024*1024)) * 0.6 * 100) / 100;

    return stats;
  }

  // ── Soft limit overlay ──
  let limitOverlayShown = false;
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'SHOW_SOFT_LIMIT' && !limitOverlayShown) {
      limitOverlayShown = true;
      showSoftLimitOverlay(msg.domain, msg.spentMs, msg.limitMs);
    }
    if (msg.type === 'GET_PAGE_STATS') {
      sendResponse(collectStats());
      return true;
    }
    if (msg.type === 'GET_COLOR_PALETTE') {
      try {
        const els = [...document.querySelectorAll('*')].slice(0, 400);
        const colorMap = new Map();
        els.forEach(el => {
          const s = getComputedStyle(el);
          ['backgroundColor','color'].forEach(p => {
            const c = s[p];
            if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent' && c.startsWith('rgb')) {
              colorMap.set(c, (colorMap.get(c)||0)+1);
            }
          });
        });
        const palette = [...colorMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([c])=>c);
        sendResponse({ colorPalette: palette });
      } catch(e) { sendResponse({ colorPalette: [] }); }
      return true;
    }
    if (msg.type === 'GET_SCROLL_DEPTH') {
      sendResponse({ scrollDepthPct: Math.round((window.scrollY+window.innerHeight)/Math.max(document.body.scrollHeight,1)*100) });
      return true;
    }
  });

  function fmtTime(ms) {
    const m = Math.floor(ms/60000), h = Math.floor(m/60);
    if (h > 0) return h + 'h ' + (m%60) + 'm';
    return m + ' min';
  }

  function showSoftLimitOverlay(domain, spentMs, limitMs) {
    if (document.getElementById('__sm-overlay')) return;
    const over = document.createElement('div');
    over.id = '__sm-overlay';
    over.style.cssText = `
      position:fixed;top:0;left:0;right:0;z-index:2147483647;
      background:rgba(10,10,12,0.92);color:#f0d090;
      font-family:'Rajdhani',system-ui,sans-serif;
      padding:18px 24px 14px;
      border-bottom:2px solid rgba(232,134,10,0.5);
      display:flex;align-items:center;justify-content:space-between;gap:16px;
      backdrop-filter:blur(8px);
      animation:__smslide 0.3s ease;
    `;
    const style = document.createElement('style');
    style.textContent = `@keyframes __smslide{from{transform:translateY(-100%)}to{transform:translateY(0)}}`;
    document.head.appendChild(style);

    over.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px">
        <span style="font-size:22px">⏰</span>
        <div>
          <div style="font-size:14px;font-weight:700;letter-spacing:.06em;color:#e8860a">TIME LIMIT REACHED — ${domain}</div>
          <div style="font-size:11px;color:#8a7050;margin-top:2px">You've spent <strong style="color:#e8a030">${fmtTime(spentMs)}</strong> here today (limit: ${fmtTime(limitMs)})</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0">
        <button id="__sm-dismiss" style="background:rgba(232,134,10,0.15);border:1px solid rgba(232,134,10,0.4);color:#e8860a;padding:5px 14px;border-radius:4px;font-family:inherit;font-size:11px;cursor:pointer;letter-spacing:.05em">STAY ANYWAY</button>
        <button id="__sm-close" style="background:none;border:none;color:#4a3a28;font-size:18px;cursor:pointer;padding:2px 6px">✕</button>
      </div>
    `;
    document.body.appendChild(over);
    document.getElementById('__sm-dismiss').onclick = () => over.style.display = 'none';
    document.getElementById('__sm-close').onclick = () => over.remove();
    setTimeout(() => { if (over.parentNode) over.remove(); }, 15000);
  }

})();
