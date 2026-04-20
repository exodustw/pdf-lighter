/**
 * background.js — Service Worker (PDF Lighter v1.1.0)
 * 攔截符合 URL whitelist 的 PDF 請求，重導向至自訂 viewer
 */

console.log('[PDF Lighter] Service Worker v1.1.0 loaded');

const VIEWER_URL = chrome.runtime.getURL('viewer.html');

/** 判斷 URL 是否指向尚未被處理的 PDF 檔案 */
function looksLikePdf(url) {
  if (!url) return false;
  if (url.startsWith(VIEWER_URL)) return false; // 已是 viewer，跳過
  if (url.startsWith('chrome')) return false;   // chrome:// / chrome-extension://
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return false;
  }
}

/**
 * 讀取 urlPatterns 白名單並比對 URL
 * - 未設定任何 pattern → 回傳 false（不攔截）
 * - 有 pattern → 只要其中一條 enabled 且符合即回傳 true
 */
async function matchesUrlWhitelist(url) {
  let urlPatterns = [];
  try {
    const result = await chrome.storage.sync.get('urlPatterns');
    urlPatterns = Array.isArray(result.urlPatterns) ? result.urlPatterns : [];
  } catch (err) {
    console.error('[PDF Lighter] storage read error:', err);
    return false;
  }

  const active = urlPatterns.filter(p => p.enabled);
  console.log(`[PDF Lighter] whitelist check — active=${active.length} url=${url}`);

  if (active.length === 0) return false;

  return active.some(p => {
    try {
      const matched = new RegExp(p.pattern, 'i').test(url);
      if (matched) console.log(`[PDF Lighter] matched pattern: ${p.pattern}`);
      return matched;
    } catch {
      return false;
    }
  });
}

/** 重導向到自訂 viewer */
function redirectToViewer(tabId, url) {
  console.log('[PDF Lighter] redirecting ->', url);
  chrome.tabs.update(tabId, {
    url: `${VIEWER_URL}?url=${encodeURIComponent(url)}`
  });
}

// ── 監聽 Tab 載入（主要攔截點）────────────────────────────────────
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'loading') return;
  const url = changeInfo.url || tab.url;
  if (!looksLikePdf(url)) return;

  const should = await matchesUrlWhitelist(url);
  if (should) redirectToViewer(tabId, url);
});

// ── 監聽 onBeforeNavigate（補捉網址列直接輸入的情況）────────────────
// 用 optional chaining 防止 API 尚未就緒時崩潰
if (chrome.webNavigation?.onBeforeNavigate) {
  chrome.webNavigation.onBeforeNavigate.addListener(
    async (details) => {
      if (details.frameId !== 0) return;
      const url = details.url;
      if (!looksLikePdf(url)) return;

      const should = await matchesUrlWhitelist(url);
      if (should) redirectToViewer(details.tabId, url);
    },
    { url: [{ urlSuffix: '.pdf' }] }
  );
} else {
  console.warn('[PDF Lighter] webNavigation API unavailable, skipping onBeforeNavigate');
}
