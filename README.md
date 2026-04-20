# PDF Lighter

A Chrome extension that intercepts PDF navigation on whitelisted URLs and renders them in a custom viewer with regex-based fluorescent highlighting.

## Features

- **URL Whitelist** — only intercepts PDFs on domains/URLs you explicitly allow; everything else opens normally
- **Regex Highlight** — mark matching text with fluorescent colors across all pages simultaneously
- **5 Preset Colors** — yellow · green · cyan · pink · orange, plus a custom color picker
- **Fit Width / Fit Height** — one-click zoom that accounts for the side panel width
- **Persistent Patterns** — highlight rules are saved to `chrome.storage.sync` and applied automatically on every matching PDF
- **Settings Page** — manage URL whitelist and highlight patterns in a dedicated options page
- **Local PDF.js** — fully offline; no external CDN dependencies at runtime

## Installation

> Requires Chrome (or any Chromium-based browser) with Developer Mode enabled.

1. Clone or download this repository
2. Open `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the project folder
5. The 🔆 PDF Lighter icon will appear in your toolbar

## Usage

### 1 — Whitelist a site

Open the extension options (click the toolbar icon → ⚙ Settings) and add a URL regex under **URL Patterns**, e.g.:

| Pattern | Effect |
|---------|--------|
| `example\.com` | Only PDFs on example.com |
| `.*` | All PDFs everywhere |

No patterns configured = no PDFs are intercepted.

### 2 — Add highlight rules

Either in the **popup** or inside the **viewer sidebar**:

1. Type a regex, e.g. `\d{4}-\d{2}-\d{2}`
2. Select a color
3. Press **+ Add** or hit Enter

Matches are highlighted in real-time across all pages. Rules sync across devices via your Chrome account.

### Keyboard shortcuts (inside viewer)

| Key | Action |
|-----|--------|
| `←` / `→` | Previous / next page |
| `+` / `-` | Zoom in / out |
| `W` | Fit width |
| `H` | Fit height |
| `P` | Toggle regex panel |

## Project Structure

```
PDF Lighter/
├── manifest.json        # Chrome Extension Manifest v3
├── background.js        # Service worker — intercepts PDF navigations
├── viewer.html/js       # Custom PDF viewer (PDF.js + regex highlight overlay)
├── popup.html/js        # Toolbar popup
├── options.html/js      # Full settings page
├── styles.css           # Shared base styles
├── lib/
│   ├── pdf.min.js       # PDF.js 3.11.174 (local)
│   └── pdf.worker.min.js
└── icons/
```

## Credits

Built by **[exodustw](https://github.com/exodustw)** with **[Claude](https://claude.ai)** (Anthropic).
