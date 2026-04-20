/**
 * popup.js — PDF Lighter popup 邏輯
 */

const patInput     = document.getElementById('pat');
const flagsInput   = document.getElementById('flags');
const colorPresets = document.getElementById('color-presets');
const addBtn       = document.getElementById('add-btn');
let selectedColor  = '#ffff00';
const errEl       = document.getElementById('err');
const listEl      = document.getElementById('pattern-list');
const countEl     = document.getElementById('count');
const settingsBtn = document.getElementById('settings-btn');
const urlStatus   = document.getElementById('url-status');
const urlStatusTx = document.getElementById('url-status-text');
const urlStatusIc = document.getElementById('url-status-icon');

let patterns    = [];
let urlPatterns = [];

// ── 初始化 ────────────────────────────────────────────────────────
chrome.storage.sync.get(['patterns', 'urlPatterns'], (result) => {
  patterns    = Array.isArray(result.patterns)    ? result.patterns    : [];
  urlPatterns = Array.isArray(result.urlPatterns) ? result.urlPatterns : [];
  renderPatterns();
  renderUrlStatus();
});

// ── URL 白名單狀態橫幅 ────────────────────────────────────────────
function renderUrlStatus() {
  const active = urlPatterns.filter(p => p.enabled);
  if (active.length === 0) {
    urlStatus.className = 'warn';
    urlStatusIc.textContent = '\u26A0';
    urlStatusTx.textContent = '尚未設定 URL 白名單，點此前往設定';
  } else {
    urlStatus.className = 'ok';
    urlStatusIc.textContent = '\u2713';
    urlStatusTx.textContent =
      `已啟用 ${active.length} 條白名單，符合網址的 PDF 將自動套用`;
  }
}

// 點橫幅或點設定按鈕 → 開啟設定頁
function openOptions() {
  chrome.runtime.openOptionsPage();
}
settingsBtn.addEventListener('click', openOptions);
urlStatus.addEventListener('click', openOptions);

// ── 新增 highlight pattern ────────────────────────────────────────
function addPattern() {
  const pat   = patInput.value.trim();
  const flags = flagsInput.value.trim() || 'gi';
  const color = selectedColor;
  errEl.textContent = '';

  if (!pat) { errEl.textContent = '請輸入 regex pattern'; return; }
  try { new RegExp(pat, flags); }
  catch (e) { errEl.textContent = `無效 Regex：${e.message}`; return; }

  patterns.push({ id: Date.now().toString(), pattern: pat, flags, color, enabled: true });
  save();
  patInput.value = '';
}

function removePattern(id) {
  patterns = patterns.filter(p => p.id !== id);
  save();
}

function togglePattern(id) {
  const p = patterns.find(p => p.id === id);
  if (p) { p.enabled = !p.enabled; save(); }
}

function save() {
  chrome.storage.sync.set({ patterns }, renderPatterns);
}

// ── 渲染 highlight 清單 ───────────────────────────────────────────
function renderPatterns() {
  countEl.textContent = `${patterns.length} 個 highlight pattern`;

  if (patterns.length === 0) {
    listEl.innerHTML = '<div class="empty-hint">尚未新增任何 pattern</div>';
    return;
  }

  listEl.innerHTML = '';
  for (const p of patterns) {
    const item = document.createElement('div');
    item.className = 'pattern-item' + (p.enabled ? '' : ' disabled');

    const swatch = document.createElement('div');
    swatch.className = 'swatch';
    swatch.style.background = p.color;

    const text = document.createElement('span');
    text.className = 'pat-text';
    text.textContent = p.pattern;
    text.title = p.pattern;

    const flags = document.createElement('span');
    flags.className = 'pat-flags';
    flags.textContent = p.flags;

    const tog = document.createElement('button');
    tog.className = 'pat-toggle';
    tog.textContent = p.enabled ? '\uD83D\uDC41' : '\uD83D\uDE48';
    tog.title = p.enabled ? '停用' : '啟用';
    tog.onclick = () => togglePattern(p.id);

    const del = document.createElement('button');
    del.className = 'pat-del';
    del.textContent = '\u2715';
    del.title = '刪除';
    del.onclick = () => removePattern(p.id);

    item.append(swatch, text, flags, tog, del);
    listEl.appendChild(item);
  }
}

// ── 事件 ──────────────────────────────────────────────────────────
const customBtn   = document.getElementById('color-custom-btn');
const customInput = document.getElementById('color-custom-input');

colorPresets.addEventListener('click', e => {
  const btn = e.target.closest('.color-preset');
  if (!btn) return;
  if (btn === customBtn) { customInput.click(); return; }
  colorPresets.querySelectorAll('.color-preset').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedColor = btn.dataset.color;
});

customInput.addEventListener('input', e => {
  const color = e.target.value;
  customBtn.style.background = color;
  customBtn.dataset.color = color;
  colorPresets.querySelectorAll('.color-preset').forEach(b => b.classList.remove('active'));
  customBtn.classList.add('active');
  selectedColor = color;
});

addBtn.addEventListener('click', addPattern);
patInput.addEventListener('keydown', e => { if (e.key === 'Enter') addPattern(); });
