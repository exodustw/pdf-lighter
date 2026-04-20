/**
 * options.js — PDF Lighter 設定頁邏輯
 * 管理兩組資料：
 *   urlPatterns  [{ id, pattern, enabled }]   — URL 白名單
 *   patterns     [{ id, pattern, flags, color, enabled }] — 螢光標記
 */

// ── DOM ───────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const ui = {
  // URL whitelist
  urlInput:   $('url-pat-input'),
  urlAddBtn:  $('url-add-btn'),
  urlErr:     $('url-err'),
  urlList:    $('url-list'),
  urlCount:   $('url-count'),
  urlWarning: $('url-warning'),
  // Highlight patterns
  hlInput:         $('hl-pat-input'),
  hlFlags:         $('hl-flags-input'),
  hlColorPresets:  $('hl-color-presets'),
  hlAddBtn:        $('hl-add-btn'),
  hlErr:      $('hl-err'),
  hlList:     $('hl-list'),
  hlCount:    $('hl-count'),
  // Toast
  toast:      $('save-toast'),
};

let urlPatterns = [];   // { id, pattern, enabled }
let hlPatterns  = [];   // { id, pattern, flags, color, enabled }

// ── 初始化 ────────────────────────────────────────────────────────
chrome.storage.sync.get(['urlPatterns', 'patterns'], (result) => {
  urlPatterns = Array.isArray(result.urlPatterns) ? result.urlPatterns : [];
  hlPatterns  = Array.isArray(result.patterns)    ? result.patterns    : [];
  renderUrlList();
  renderHlList();
});

// ── URL Whitelist ─────────────────────────────────────────────────
function addUrlPattern() {
  const pat = ui.urlInput.value.trim();
  ui.urlErr.textContent = '';
  if (!pat) { ui.urlErr.textContent = '請輸入 URL regex'; return; }
  try { new RegExp(pat, 'i'); }
  catch (e) { ui.urlErr.textContent = `無效 Regex：${e.message}`; return; }

  urlPatterns.push({ id: Date.now().toString(), pattern: pat, enabled: true });
  save('url');
  ui.urlInput.value = '';
}

function removeUrlPattern(id) {
  urlPatterns = urlPatterns.filter(p => p.id !== id);
  save('url');
}

function toggleUrlPattern(id) {
  const p = urlPatterns.find(p => p.id === id);
  if (p) { p.enabled = !p.enabled; save('url'); }
}

function renderUrlList() {
  const active = urlPatterns.filter(p => p.enabled).length;
  ui.urlCount.textContent = `${urlPatterns.length} 個`;
  ui.urlWarning.classList.toggle('hidden', active > 0);

  if (urlPatterns.length === 0) {
    ui.urlList.innerHTML = '<div class="empty">尚未新增任何白名單 pattern</div>';
    return;
  }

  ui.urlList.innerHTML = '';
  for (const p of urlPatterns) {
    const item = document.createElement('div');
    item.className = 'item' + (p.enabled ? '' : ' disabled');

    const icon = document.createElement('span');
    icon.className = 'item-icon';
    icon.textContent = '&#127760;';

    const text = document.createElement('span');
    text.className = 'item-text';
    text.textContent = p.pattern;
    text.title = p.pattern;

    const type = document.createElement('span');
    type.className = 'item-type';
    type.textContent = 'URL';

    const tog = document.createElement('button');
    tog.className = 'item-toggle';
    tog.innerHTML = p.enabled ? '&#128065;' : '&#128584;';
    tog.title = p.enabled ? '停用' : '啟用';
    tog.onclick = () => toggleUrlPattern(p.id);

    const del = document.createElement('button');
    del.className = 'item-del';
    del.textContent = '✕';
    del.title = '刪除';
    del.onclick = () => removeUrlPattern(p.id);

    item.append(icon, text, type, tog, del);
    ui.urlList.appendChild(item);
  }
}

// ── Highlight Patterns ────────────────────────────────────────────
function addHlPattern() {
  const pat   = ui.hlInput.value.trim();
  const flags = ui.hlFlags.value.trim() || 'gi';
  const active = ui.hlColorPresets.querySelector('.color-preset.active');
  const color = active ? active.dataset.color : '#ffff00';
  ui.hlErr.textContent = '';
  if (!pat) { ui.hlErr.textContent = '請輸入 regex pattern'; return; }
  try { new RegExp(pat, flags); }
  catch (e) { ui.hlErr.textContent = `無效 Regex：${e.message}`; return; }

  hlPatterns.push({ id: Date.now().toString(), pattern: pat, flags, color, enabled: true });
  save('hl');
  ui.hlInput.value = '';
}

function removeHlPattern(id) {
  hlPatterns = hlPatterns.filter(p => p.id !== id);
  save('hl');
}

function toggleHlPattern(id) {
  const p = hlPatterns.find(p => p.id === id);
  if (p) { p.enabled = !p.enabled; save('hl'); }
}

function renderHlList() {
  ui.hlCount.textContent = `${hlPatterns.length} 個`;

  if (hlPatterns.length === 0) {
    ui.hlList.innerHTML = '<div class="empty">尚未新增任何螢光標記 pattern</div>';
    return;
  }

  ui.hlList.innerHTML = '';
  for (const p of hlPatterns) {
    const item = document.createElement('div');
    item.className = 'item' + (p.enabled ? '' : ' disabled');

    const swatch = document.createElement('div');
    swatch.className = 'swatch';
    swatch.style.background = p.color;

    const text = document.createElement('span');
    text.className = 'item-text';
    text.textContent = p.pattern;
    text.title = p.pattern;

    const flags = document.createElement('span');
    flags.className = 'item-type';
    flags.textContent = p.flags;

    const tog = document.createElement('button');
    tog.className = 'item-toggle';
    tog.innerHTML = p.enabled ? '&#128065;' : '&#128584;';
    tog.title = p.enabled ? '停用' : '啟用';
    tog.onclick = () => toggleHlPattern(p.id);

    const del = document.createElement('button');
    del.className = 'item-del';
    del.textContent = '✕';
    del.title = '刪除';
    del.onclick = () => removeHlPattern(p.id);

    item.append(swatch, text, flags, tog, del);
    ui.hlList.appendChild(item);
  }
}

// ── Storage ───────────────────────────────────────────────────────
function save(which) {
  const data = {};
  if (which === 'url' || which === 'all') data.urlPatterns = urlPatterns;
  if (which === 'hl'  || which === 'all') data.patterns    = hlPatterns;
  chrome.storage.sync.set(data, () => {
    if (which === 'url') renderUrlList();
    if (which === 'hl')  renderHlList();
    showToast();
  });
}

function showToast() {
  ui.toast.classList.add('show');
  setTimeout(() => ui.toast.classList.remove('show'), 1600);
}

// ── 事件 ──────────────────────────────────────────────────────────
ui.urlAddBtn.addEventListener('click', addUrlPattern);
ui.urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') addUrlPattern(); });

const hlCustomBtn   = document.getElementById('hl-color-custom-btn');
const hlCustomInput = document.getElementById('hl-color-custom-input');

ui.hlColorPresets.addEventListener('click', e => {
  const btn = e.target.closest('.color-preset');
  if (!btn) return;
  if (btn === hlCustomBtn) { hlCustomInput.click(); return; }
  ui.hlColorPresets.querySelectorAll('.color-preset').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
});

hlCustomInput.addEventListener('input', e => {
  const color = e.target.value;
  hlCustomBtn.style.background = color;
  hlCustomBtn.dataset.color = color;
  ui.hlColorPresets.querySelectorAll('.color-preset').forEach(b => b.classList.remove('active'));
  hlCustomBtn.classList.add('active');
});

ui.hlAddBtn.addEventListener('click', addHlPattern);
ui.hlInput.addEventListener('keydown', e => { if (e.key === 'Enter') addHlPattern(); });
