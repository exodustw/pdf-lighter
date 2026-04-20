/**
 * viewer.js — PDF 渲染 + Regex 螢光標記
 * 使用 PDF.js 3.x (CDN 版本)
 */

// ── PDF.js worker 設定 ────────────────────────────────────────────
pdfjsLib.GlobalWorkerOptions.workerSrc =
  chrome.runtime.getURL('lib/pdf.worker.min.js');

// ── 全域狀態 ──────────────────────────────────────────────────────
const PRESET_COLORS = ['#ffff00', '#b3ff6e', '#6effff', '#ff6eb4', '#ffaa00'];

const state = {
  pdfDoc: null,
  currentPage: 1,
  totalPages: 0,
  scale: 1.5,
  selectedColor: PRESET_COLORS[0],   // 目前選取的螢光色
  patterns: [],          // { id, pattern, flags, color, enabled }
  pageTextData: {},      // { pageNum: [{ text, x, y, w, h }] }
  panelOpen: true,
};

// ── DOM 參考 ──────────────────────────────────────────────────────
const els = {
  container:    document.getElementById('pdf-container'),
  loading:      document.getElementById('loading-overlay'),
  loadingText:  document.getElementById('loading-text'),
  errorMsg:     document.getElementById('error-msg'),
  prevBtn:      document.getElementById('prev-btn'),
  nextBtn:      document.getElementById('next-btn'),
  pageInfo:     document.getElementById('page-info'),
  zoomIn:       document.getElementById('zoom-in-btn'),
  zoomOut:      document.getElementById('zoom-out-btn'),
  zoomDisplay:  document.getElementById('zoom-display'),
  zoomFitW:     document.getElementById('zoom-fit-width-btn'),
  zoomFitH:     document.getElementById('zoom-fit-height-btn'),
  filename:     document.getElementById('filename'),
  togglePanel:   document.getElementById('toggle-panel-btn'),
  panel:         document.getElementById('panel'),
  patternInput:  document.getElementById('pattern-input'),
  flagsInput:    document.getElementById('flags-input'),
  colorPresets:  document.getElementById('color-presets'),
  addBtn:        document.getElementById('add-pattern-btn'),
  patternError: document.getElementById('pattern-error'),
  patternList:  document.getElementById('pattern-list'),
  matchCount:   document.getElementById('match-count'),
};

// ── 初始化 ────────────────────────────────────────────────────────
async function init() {
  const params = new URLSearchParams(location.search);
  const pdfUrl = params.get('url');

  if (!pdfUrl) {
    showError('未指定 PDF URL。請從 Chrome 開啟一個 .pdf 連結。');
    return;
  }

  // 顯示檔名
  try {
    const urlObj = new URL(pdfUrl);
    const parts = urlObj.pathname.split('/');
    els.filename.textContent = decodeURIComponent(parts[parts.length - 1] || pdfUrl);
  } catch {
    els.filename.textContent = pdfUrl;
  }

  // 從 storage 載入已儲存的 patterns
  await loadPatternsFromStorage();

  // 載入 PDF
  try {
    els.loadingText.textContent = '載入 PDF 中…';
    const loadingTask = pdfjsLib.getDocument({
      url: pdfUrl,
      cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
      cMapPacked: true,
    });
    state.pdfDoc = await loadingTask.promise;
    state.totalPages = state.pdfDoc.numPages;
    state.currentPage = 1;

    // 開啟時預設「符合寬度」：在第一次渲染前就算好 scale，避免渲染兩次
    const firstPage   = await state.pdfDoc.getPage(1);
    const baseViewport = firstPage.getViewport({ scale: 1 });
    const { w } = availableSize();
    state.scale = Math.max(0.5, Math.min(4.0, w / baseViewport.width));
    els.zoomDisplay.textContent = `${Math.round(state.scale * 100)}%`;

    hideLoading();
    await renderAllPages();
  } catch (err) {
    showError(`無法載入 PDF：${err.message}`);
  }
}

// ── 渲染所有頁面 ──────────────────────────────────────────────────
async function renderAllPages() {
  els.container.innerHTML = '';
  state.pageTextData = {};
  updatePageInfo();

  for (let pageNum = 1; pageNum <= state.totalPages; pageNum++) {
    await renderPage(pageNum);
  }

  applyAllHighlights();
}

// ── 渲染單頁 ──────────────────────────────────────────────────────
async function renderPage(pageNum) {
  const page = await state.pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: state.scale });

  // 建立包裝 div
  const wrapper = document.createElement('div');
  wrapper.className = 'page-wrapper';
  wrapper.id = `page-${pageNum}`;
  wrapper.style.width  = `${viewport.width}px`;
  wrapper.style.height = `${viewport.height}px`;

  // Canvas
  const canvas = document.createElement('canvas');
  canvas.width  = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');

  wrapper.appendChild(canvas);
  els.container.appendChild(wrapper);

  // 渲染 PDF 頁面到 canvas
  await page.render({ canvasContext: ctx, viewport }).promise;

  // 取得文字內容並建立 text layer
  const textContent = await page.getTextContent();
  await buildTextLayer(wrapper, textContent, viewport, pageNum);
}

// ── 建立 Text Layer ───────────────────────────────────────────────
// 使用 PDF.js 內建 renderTextLayer，確保文字選取與複製正確
async function buildTextLayer(wrapper, textContent, viewport, pageNum) {
  const layer = document.createElement('div');
  layer.className = 'textLayer';
  wrapper.appendChild(layer);

  // PDF.js renderTextLayer：正確處理字元間距、複製貼上
  try {
    await pdfjsLib.renderTextLayer({
      textContent,
      container: layer,
      viewport,
      textDivs: [],
    }).promise;
  } catch (err) {
    console.warn('[PDF Lighter] renderTextLayer error:', err);
  }

  // 另外計算各 text item 的位置，供 highlight overlay 使用
  // （與 text layer DOM 渲染獨立，不受 renderTextLayer 影響）
  const pageData = [];
  for (const item of textContent.items) {
    if (!item.str || item.str.trim() === '') continue;
    const tx         = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.hypot(tx[1], tx[3]);
    const fontWidth  = item.width * viewport.scale;
    pageData.push({
      text: item.str,
      x:    tx[4],
      y:    tx[5] - fontHeight,
      w:    fontWidth,
      h:    fontHeight,
    });
  }
  state.pageTextData[pageNum] = pageData;
}

// ── Highlight 邏輯 ────────────────────────────────────────────────

/** 清除某頁所有 highlight mark */
function clearHighlights(pageNum) {
  const wrapper = document.getElementById(`page-${pageNum}`);
  if (!wrapper) return;
  wrapper.querySelectorAll('.pdf-highlight').forEach(el => el.remove());
}

/** 清除所有頁面的 highlight */
function clearAllHighlights() {
  for (let p = 1; p <= state.totalPages; p++) {
    clearHighlights(p);
  }
}

/** 對所有頁面套用所有 patterns */
function applyAllHighlights() {
  clearAllHighlights();
  let total = 0;

  for (let pageNum = 1; pageNum <= state.totalPages; pageNum++) {
    total += applyHighlightsToPage(pageNum);
  }

  els.matchCount.textContent = `共找到 ${total} 個符合項目`;
}

/** 對單頁套用所有 patterns，回傳該頁 match 總數 */
function applyHighlightsToPage(pageNum) {
  const wrapper = document.getElementById(`page-${pageNum}`);
  const pageData = state.pageTextData[pageNum];
  if (!wrapper || !pageData) return 0;

  let count = 0;

  // 重建頁面完整文字（保留每個 item 的位置資訊）
  // pageData: [{ text, x, y, w, h }]
  const activePatterns = state.patterns.filter(p => p.enabled);

  for (const pat of activePatterns) {
    let regex;
    try {
      // 確保有 g flag 才能用 matchAll / lastIndex
      const flags = pat.flags.includes('g') ? pat.flags : pat.flags + 'g';
      regex = new RegExp(pat.pattern, flags);
    } catch {
      continue;
    }

    // 以 item 為單位搜尋（不跨 item）以保持位置準確
    for (const item of pageData) {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(item.text)) !== null) {
        const charStart = match.index;
        const charEnd   = match.index + match[0].length;
        const totalChars = item.text.length;
        if (totalChars === 0) continue;

        // 依字元比例計算 highlight 位置
        const xFrac  = charStart / totalChars;
        const wFrac  = (charEnd - charStart) / totalChars;
        const hx     = item.x + item.w * xFrac;
        const hw     = item.w * wFrac;

        const mark = document.createElement('div');
        mark.className = 'pdf-highlight';
        mark.style.left       = `${hx}px`;
        mark.style.top        = `${item.y}px`;
        mark.style.width      = `${hw}px`;
        mark.style.height     = `${item.h}px`;
        mark.style.background = pat.color;
        mark.title = match[0];

        wrapper.appendChild(mark);
        count++;

        // 防止零寬度 match 造成無限迴圈
        if (match[0].length === 0) regex.lastIndex++;
      }
    }
  }

  return count;
}

// ── Pattern 管理 ──────────────────────────────────────────────────

function addPattern() {
  const patStr = els.patternInput.value.trim();
  const flags  = els.flagsInput.value.trim() || 'gi';
  const color  = state.selectedColor;
  els.patternError.textContent = '';

  if (!patStr) {
    els.patternError.textContent = '請輸入 regex pattern。';
    return;
  }

  try {
    new RegExp(patStr, flags);
  } catch (err) {
    els.patternError.textContent = `Regex 無效：${err.message}`;
    return;
  }

  const id = Date.now().toString();
  state.patterns.push({ id, pattern: patStr, flags, color, enabled: true });
  savePatternsToStorage();
  renderPatternList();
  applyAllHighlights();

  els.patternInput.value = '';
}

function removePattern(id) {
  state.patterns = state.patterns.filter(p => p.id !== id);
  savePatternsToStorage();
  renderPatternList();
  applyAllHighlights();
}

function togglePattern(id) {
  const pat = state.patterns.find(p => p.id === id);
  if (pat) {
    pat.enabled = !pat.enabled;
    savePatternsToStorage();
    renderPatternList();
    applyAllHighlights();
  }
}

function renderPatternList() {
  els.patternList.innerHTML = '';
  if (state.patterns.length === 0) {
    els.patternList.innerHTML =
      '<div style="color:#585b70;font-size:12px;padding:8px">尚未新增任何 pattern</div>';
    return;
  }

  for (const pat of state.patterns) {
    const item = document.createElement('div');
    item.className = 'pattern-item' + (pat.enabled ? '' : ' disabled');

    const swatch = document.createElement('div');
    swatch.className = 'pattern-swatch';
    swatch.style.background = pat.color;

    const text = document.createElement('span');
    text.className = 'pattern-text';
    text.textContent = pat.pattern;
    text.title = pat.pattern;

    const flagsSpan = document.createElement('span');
    flagsSpan.className = 'pattern-flags';
    flagsSpan.textContent = pat.flags;

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'pattern-toggle';
    toggleBtn.textContent = pat.enabled ? '👁' : '🙈';
    toggleBtn.title = pat.enabled ? '停用' : '啟用';
    toggleBtn.onclick = () => togglePattern(pat.id);

    const delBtn = document.createElement('button');
    delBtn.className = 'pattern-delete';
    delBtn.textContent = '✕';
    delBtn.title = '刪除';
    delBtn.onclick = () => removePattern(pat.id);

    item.appendChild(swatch);
    item.appendChild(text);
    item.appendChild(flagsSpan);
    item.appendChild(toggleBtn);
    item.appendChild(delBtn);
    els.patternList.appendChild(item);
  }
}

// ── Storage ───────────────────────────────────────────────────────

async function savePatternsToStorage() {
  try {
    await chrome.storage.sync.set({ patterns: state.patterns });
  } catch {
    // storage 可能在測試環境不可用
  }
}

async function loadPatternsFromStorage() {
  try {
    const result = await chrome.storage.sync.get('patterns');
    if (result.patterns && Array.isArray(result.patterns)) {
      state.patterns = result.patterns;
    }
  } catch {
    // 使用預設空陣列
  }
  renderPatternList();
}

// ── 縮放控制 ──────────────────────────────────────────────────────

async function setScale(newScale) {
  state.scale = Math.max(0.5, Math.min(4.0, newScale));
  els.zoomDisplay.textContent = `${Math.round(state.scale * 100)}%`;
  if (!state.pdfDoc) return;
  showLoading('重新渲染中…');
  await renderAllPages();
  hideLoading();
}

/**
 * 取得目前可用的視區大小（已扣除 padding 20px × 2）
 * clientWidth / clientHeight 由 CSS 負責扣除右側面板（right: 320px）
 * 與工具列（top: 48px），不需在 JS 中再手動計算。
 */
function availableSize() {
  const PADDING = 40; // 20px × 2（container padding）
  return {
    w: els.container.clientWidth  - PADDING,
    h: els.container.clientHeight - PADDING,
  };
}

/** 符合寬度：縮放使頁面寬度填滿可用區域（已扣除右側面板） */
async function fitToWidth() {
  if (!state.pdfDoc) return;
  const page = await state.pdfDoc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const { w } = availableSize();
  await setScale(w / viewport.width);
}

/** 符合高度：縮放使頁面高度填滿可用區域（已扣除工具列） */
async function fitToHeight() {
  if (!state.pdfDoc) return;
  const page = await state.pdfDoc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const { h } = availableSize();
  await setScale(h / viewport.height);
}

// ── 頁面導航 ──────────────────────────────────────────────────────

function updatePageInfo() {
  els.pageInfo.textContent = `${state.currentPage} / ${state.totalPages}`;
  els.prevBtn.disabled = state.currentPage <= 1;
  els.nextBtn.disabled = state.currentPage >= state.totalPages;
}

function goToPage(num) {
  const target = document.getElementById(`page-${num}`);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    state.currentPage = num;
    updatePageInfo();
  }
}

// 監聽滾動，更新目前頁碼
function setupScrollTracking() {
  els.container.addEventListener('scroll', () => {
    for (let p = 1; p <= state.totalPages; p++) {
      const el = document.getElementById(`page-${p}`);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.top >= 0 && rect.top < window.innerHeight / 2) {
        state.currentPage = p;
        updatePageInfo();
        break;
      }
    }
  }, { passive: true });
}

// ── Panel toggle ──────────────────────────────────────────────────

function togglePanel() {
  state.panelOpen = !state.panelOpen;
  els.panel.classList.toggle('hidden', !state.panelOpen);
  els.container.classList.toggle('panel-open', state.panelOpen);
}

// ── 工具函式 ──────────────────────────────────────────────────────

function showLoading(msg = '處理中…') {
  els.loading.classList.remove('hidden');
  els.loadingText.textContent = msg;
}

function hideLoading() {
  els.loading.classList.add('hidden');
}

function showError(msg) {
  hideLoading();
  els.errorMsg.textContent = msg;
  els.errorMsg.style.display = 'block';
}

// ── 事件綁定 ──────────────────────────────────────────────────────

els.prevBtn.addEventListener('click', () => goToPage(state.currentPage - 1));
els.nextBtn.addEventListener('click', () => goToPage(state.currentPage + 1));
els.zoomIn.addEventListener('click',   () => setScale(state.scale + 0.25));
els.zoomOut.addEventListener('click',  () => setScale(state.scale - 0.25));
els.zoomFitW.addEventListener('click', fitToWidth);
els.zoomFitH.addEventListener('click', fitToHeight);
els.togglePanel.addEventListener('click', togglePanel);

// 顏色預設按鈕 + 自訂色
const customBtn   = document.getElementById('color-custom-btn');
const customInput = document.getElementById('color-custom-input');

els.colorPresets.addEventListener('click', e => {
  const btn = e.target.closest('.color-preset');
  if (!btn) return;
  if (btn === customBtn) {
    customInput.click(); // 開啟系統顏色選取器
    return;
  }
  els.colorPresets.querySelectorAll('.color-preset').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.selectedColor = btn.dataset.color;
});

customInput.addEventListener('input', e => {
  const color = e.target.value;
  // 將自訂按鈕改為選取的顏色，並標為 active
  customBtn.style.background = color;
  customBtn.classList.add('picked');
  customBtn.dataset.color = color;
  els.colorPresets.querySelectorAll('.color-preset').forEach(b => b.classList.remove('active'));
  customBtn.classList.add('active');
  state.selectedColor = color;
});

els.addBtn.addEventListener('click', addPattern);
els.patternInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') addPattern();
});

// 鍵盤快捷鍵
document.addEventListener('keydown', e => {
  if (document.activeElement === els.patternInput ||
      document.activeElement === els.flagsInput) return;
  if (e.key === 'ArrowLeft'  || e.key === 'PageUp')   goToPage(state.currentPage - 1);
  if (e.key === 'ArrowRight' || e.key === 'PageDown')  goToPage(state.currentPage + 1);
  if (e.key === '+' || e.key === '=')  setScale(state.scale + 0.25);
  if (e.key === '-')                   setScale(state.scale - 0.25);
  if (e.key === 'w' || e.key === 'W')  fitToWidth();
  if (e.key === 'h' || e.key === 'H')  fitToHeight();
  if (e.key === 'p' || e.key === 'P')  togglePanel();
});

// ── 啟動 ──────────────────────────────────────────────────────────
setupScrollTracking();
init();
