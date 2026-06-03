# 🤖 Stats Machine

> **Browser intelligence — Focus Score, Pomodoro, Heatmap, Core Web Vitals, Achievements & more.**

Stats Machine is a Manifest V3 Chrome extension that turns your browser into a personal intelligence dashboard. Everything runs **100% locally** — no servers, no accounts, no data leaving your device.

---
<div align="center">
  <a href="https://chromewebstore.google.com/detail/stats-machine/nnmpfkghcbgoongpgfmnaonhhcleefde">
    <img src="https://shields.io" alt="Chrome Web Store">
  </a>
</div>

## ✨ Features

Stats Machine is organized into five profiles, each surfacing a different lens on your browsing:

### 🎮 Player
Real-time session & activity overview.
- Tab time, today's total browsing time, and day streak 🔥
- Open tab count, idle time, tab hops, and doom-scroll counter
- Live download / upload speed bars with a 20-second sparkline
- Ping indicator and cumulative data transfer totals
- Top sites visited today

### 👨‍💻 Devs
Per-page performance diagnostics for developers.
- Page load time, TTFB, DNS, SSL handshake timing
- Request count and redirect hops
- **Core Web Vitals**: LCP, CLS, FCP, FID, render-blocking resources
- Network protocol, JS error count, API call count, average latency
- Detected tech stack, CDN detection
- SEO audit: H1 tags, missing alt text, oversized images, contrast issues, WCAG status

### 🎨 Pixel
Visual design & accessibility inspector.
- Live colour palette extraction with refresh button
- Fonts in use
- Image count & oversized asset detection
- Accessibility: contrast ratio, WCAG level, missing alt attributes, ARIA marks, focusable element count, dark-mode support
- SEO & publishing: meta description, OG image, estimated read time, scroll depth, page speed score

### 🌍 Surfer
Privacy & safety dashboard for the current page.
- HTTPS/HTTP connection status
- Cookie count, tracker count, third-party scripts, ad count, login-form detection
- Named tracker list with categories
- Site permission status: Notifications, Camera, Microphone, Geolocation, Local Storage
- Time & habits: tab time, today total, streak, read time, scroll depth, estimated CO₂
- Lifetime stats: all-time active/idle time, active days, lifetime tab hops, daily average, focus ratio

### 🎯 Focus
Your daily focus score, Pomodoro timer, and habit tracking.
- **Focus Score** — a 0–100 score with animated ring, based on your browsing habits
- Streak, total active time, idle time, first active timestamp, tab hops
- **Time breakdown** — category bars showing how your time is distributed
- **90-day heatmap** — a GitHub-style activity calendar for your browsing
- **Pomodoro timer** — configurable work/short break/long break durations, with daily and total session counters
- **Achievements** — unlock badges for browsing milestones
- Weekly recap summary

---

## ⚙️ Settings

Fully customizable from the **Settings** tab:

| Setting | Options |
|---|---|
| Theme | Nixie (dark amber), Ghibli (cozy pink), Hacker (matrix green), Midnight (deep blue) |
| Icon badge | None, Tab count, Focus color |
| Break reminder | Toggle + threshold (30 / 45 / 60 / 90 min) |
| Soft site limits | Per-domain time nudges (fully dismissable) |
| Pomodoro durations | Work: 15–120 min · Short break: 3–10 min · Long break: 10–30 min |
| Data export | Export all data as JSON |
| Data reset | Clear all stored data |

---

## 🚀 Installation (Developer Mode)

1. Clone or download this repository:
   ```bash
   git clone https://github.com/gitwingo/stats-machine.git
   ```
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select the `stats-machine` folder
5. The Stats Machine icon will appear in your toolbar — click it to open the dashboard

---

## 🗂️ Project Structure

```
stats-machine/
├── manifest.json      # Manifest V3 extension config
├── background.js      # Service worker — alarms, idle detection, storage
├── content.js         # Injected into every page — collects DOM & perf data
├── domains.js         # Domain category mappings (social, productivity, etc.)
├── popup.html         # Extension popup UI
├── popup.js           # Popup logic — rendering, timers, charts
├── popup.css          # Styles & themes
└── icons/             # Extension icons (16×16, 48×48, 128×128)
```

---

## 🔒 Privacy

Stats Machine stores everything in Chrome's local `storage` API. **No data is ever sent to any external server.** You can export or permanently delete your data at any time from the Settings tab.

**Permissions used:**

| Permission | Purpose |
|---|---|
| `tabs` | Read tab URLs and count open tabs |
| `storage` | Persist your stats and settings locally |
| `alarms` | Drive the Pomodoro timer and break reminders |
| `idle` | Detect idle time for accurate focus scoring |
| `notifications` | Pomodoro phase-change and break reminder alerts |

---

## 🛠️ Tech Stack

- Vanilla JavaScript (ES2020+)
- HTML5 Canvas (focus ring, heatmap, sparkline)
- Chrome Extensions Manifest V3
- Chrome APIs: `tabs`, `storage`, `alarms`, `idle`, `notifications`, `webRequest`

---

## ☕ Support

If you find Stats Machine useful, you can support development on [Ko-fi](https://ko-fi.com/gitwingo).

---

## 👤 Author

Made by **[gitwingo](https://github.com/gitwingo)**

---

## 📄 License

This project does not currently include a license. All rights reserved by the author unless otherwise stated.
