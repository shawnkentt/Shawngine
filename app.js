'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const ENGINES = {
    google: { name: 'Google', url: 'https://www.google.com/search?q=' },
    bing: { name: '必应', url: 'https://cn.bing.com/search?q=' },
    baidu: { name: '百度', url: 'https://www.baidu.com/s?wd=' },
    bilibili: { name: 'Bilibili', url: 'https://search.bilibili.com/all?keyword=' }
  };
  const THEMES = { dark: '深色模式', light: '浅色模式', colorful: '涂鸦模式', f1: 'F1 模式' };
  const STATE_KEY = 'shawngine.preferences.v1';
  const DRAWING_KEY = 'savedDoodle';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  let toastTimer;
  function toast(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3600);
  }
  function read(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch { toast('浏览器未能保存数据，请导出备份；本次修改仍可在当前页面使用。'); return false; }
  }
  function parse(value, fallback) {
    try { return value === null ? fallback : JSON.parse(value); } catch { return fallback; }
  }
  function normalizeUrl(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 2048) throw new Error('请输入有效的网站地址。');
    let raw = value.trim();
    if (!/^https?:\/\//i.test(raw)) {
      if (/^[a-z][a-z\d+.-]*:/i.test(raw) || raw.startsWith('//')) throw new Error('仅支持 http:// 或 https:// 网站地址。');
      raw = 'https://' + raw;
    }
    let url;
    try { url = new URL(raw); } catch { throw new Error('网站地址格式不正确，请检查后再保存。'); }
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error('请输入不含账号密码的 HTTP 或 HTTPS 地址。');
    return url.href;
  }
  function validateLinks(links, strict = false) {
    if (!Array.isArray(links) || links.length > 300) {
      if (strict) throw new Error('备份中的链接格式不正确，最多支持 300 个链接。');
      return [];
    }
    const result = [];
    for (const link of links) {
      try {
        if (!link || typeof link.name !== 'string' || !link.name.trim() || link.name.trim().length > 60) throw new Error('链接名称需为 1–60 个字符。');
        result.push({ name: link.name.trim(), url: normalizeUrl(link.url) });
      } catch (error) { if (strict) throw error; }
    }
    return result;
  }
  const rawState = parse(read(STATE_KEY), null);
  const saved = rawState && typeof rawState === 'object' && !Array.isArray(rawState) ? rawState : {};
  const legacyTheme = read('appTheme');
  const legacyBlur = read('engineBlurAmount');
  const initialBlur = Number(saved.blur ?? legacyBlur ?? 6);
  let state = {
    theme: Object.hasOwn(THEMES, saved.theme) ? saved.theme : Object.hasOwn(THEMES, legacyTheme) ? legacyTheme : 'dark',
    engine: Object.hasOwn(ENGINES, saved.engine) ? saved.engine : 'bing',
    blur: Number.isFinite(initialBlur) ? Math.max(0, Math.min(12, initialBlur)) : 6,
    motion: saved.motion !== false,
    showNetwork: saved.showNetwork === true,
    showQuotes: saved.showQuotes !== false,
    quoteMode: ['local', 'lyrics'].includes(saved.quoteMode) ? saved.quoteMode : 'online',
    language: saved.language === 'en' ? 'en' : 'zh',
    links: validateLinks(saved.links ?? parse(read('customLinks'), []))
  };
  const persist = () => write(STATE_KEY, JSON.stringify(state));
  const canvas = $('doodleCanvas');
  const ctx = canvas.getContext('2d');
  let doodleEnabled = false;
  let activePointer = null;
  let lastPoint;
  let drawing = read(DRAWING_KEY) || '';
  let drawingRevision = 0;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let drawingDirty = false;
  let drawingReady = false;
  let drawingLoad = Promise.resolve();
  let saveTimer;
  const glassTrackers = [];

  function applyState() {
    window.ShawngineI18n.setLanguage(state.language);
    $('languageSelect').value = state.language;
    document.documentElement.dataset.theme = state.theme;
    document.documentElement.dataset.motion = state.motion && !reducedMotion.matches ? 'on' : 'off';
    document.documentElement.style.setProperty('--engine-blur', state.blur + 'px');
    document.querySelector('meta[name="theme-color"]').content = state.theme === 'light' ? '#f5f5f7' : '#15151f';
    $('themeToggle').textContent = THEMES[state.theme];
    $('themeToggle').setAttribute('aria-label', '当前' + THEMES[state.theme] + '，点击切换主题');
    $('themeSelect').value = state.theme;
    $('motionToggle').checked = state.motion;
    $('showNetworkToggle').checked = state.showNetwork;
    $('showQuotesToggle').checked = state.showQuotes;
    $('quoteModeSelect').value = state.quoteMode;
    $('quoteModeSelect').disabled = !state.showQuotes;
    $('quoteCard').hidden = !state.showQuotes;
    syncQuotes();
    window.ShawngineNetwork?.configure({ enabled: state.theme === 'f1' || state.showNetwork });
    $('blurAmount').value = state.blur;
    $('blurValue').textContent = state.blur + ' px';
    document.querySelectorAll('[data-engine]').forEach(button => {
      const active = button.dataset.engine === state.engine;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $('query').placeholder = '用' + ENGINES[state.engine].name + '搜索…';
    canvas.style.pointerEvents = state.theme === 'colorful' && doodleEnabled ? 'auto' : 'none';
    canvas.style.touchAction = state.theme === 'colorful' && doodleEnabled ? 'none' : 'auto';
    updateFollower();
    glassTrackers.forEach(tracker => tracker.refresh());
  }
  function setTheme(theme) {
    finishStroke();
    state.theme = theme;
    applyState();
    persist();
  }
  $('themeToggle').addEventListener('click', () => {
    const keys = Object.keys(THEMES);
    setTheme(keys[(keys.indexOf(state.theme) + 1) % keys.length]);
  });
  $('themeSelect').addEventListener('change', event => setTheme(event.target.value));
  $('motionToggle').addEventListener('change', event => {
    state.motion = event.target.checked;
    applyState();
    persist();
  });
  $('showNetworkToggle').addEventListener('change', event => {
    state.showNetwork = event.target.checked;
    applyState();
    persist();
  });
  $('showQuotesToggle').addEventListener('change', event => {
    state.showQuotes = event.target.checked;
    applyState();
    persist();
  });
  $('quoteModeSelect').addEventListener('change', event => {
    state.quoteMode = event.target.value;
    applyState();
    persist();
  });
  $('languageSelect').addEventListener('change', event => {
    state.language = event.target.value;
    applyState();
    persist();
  });
  reducedMotion.addEventListener('change', applyState);
  finePointer.addEventListener('change', applyState);
  $('enginesContainer').addEventListener('click', event => {
    const button = event.target.closest('[data-engine]');
    if (!button) return;
    state.engine = button.dataset.engine;
    applyState();
    persist();
  });

  let composing = false;
  let inputAnimationTimer;
  let tireTimer;
  function animateInput(deleting = false) {
    clearTimeout(inputAnimationTimer);
    clearTimeout(tireTimer);
    const bar = $('searchContainer');
    bar.classList.remove('input-jump', 'input-back');
    $('query').classList.remove('typing');
    if (!state.motion || reducedMotion.matches) return;
    void bar.offsetWidth;
    bar.classList.add(deleting ? 'input-back' : 'input-jump');
    inputAnimationTimer = setTimeout(() => bar.classList.remove('input-jump', 'input-back'), deleting ? 140 : 170);
    if (state.theme === 'f1' && !deleting) {
      $('query').classList.add('typing');
      tireTimer = setTimeout(() => $('query').classList.remove('typing'), 600);
    }
  }
  $('query').addEventListener('compositionstart', () => { composing = true; });
  $('query').addEventListener('compositionend', () => { composing = false; });
  $('query').addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.isComposing || composing || event.keyCode === 229)) event.preventDefault();
    if (event.key === 'Backspace' && !event.isComposing && !composing) animateInput(true);
  });
  $('searchContainer').addEventListener('submit', event => {
    event.preventDefault();
    const query = $('query').value.trim();
    if (!query || composing) return;
    animateInput();
    window.open(ENGINES[state.engine].url + encodeURIComponent(query), '_blank', 'noopener,noreferrer');
  });
  $('query').addEventListener('input', event => {
    $('clearBtn').hidden = !$('query').value;
    $('clearBtn').classList.toggle('show', !!$('query').value);
    animateInput(event.inputType?.startsWith('delete') || false);
  });
  $('clearBtn').addEventListener('click', () => {
    $('query').value = '';
    $('query').dispatchEvent(new Event('input'));
    animateInput(true);
    $('query').focus();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || document.querySelector('dialog[open]')) return;
    if (event.target.closest('input, textarea, select, [contenteditable]')) return;
    event.preventDefault();
    $('query').focus();
  });

  // A single event path per bookmark avoids duplicate opening/deletion.
  function renderLinks() {
    const fragment = document.createDocumentFragment();
    state.links.forEach((link, index) => {
      const item = document.createElement('div');
      item.className = 'bookmark';
      const anchor = document.createElement('a');
      anchor.className = 'custom-link-btn';
      anchor.textContent = link.name;
      anchor.href = link.url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.title = link.url;
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'edit-link';
      edit.textContent = '✎';
      edit.setAttribute('aria-label', '编辑链接：' + link.name);
      edit.addEventListener('click', () => openLinkDialog(index));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'delete-link';
      remove.textContent = '×';
      remove.setAttribute('aria-label', '删除链接：' + link.name);
      remove.addEventListener('click', async () => {
        if (!await confirmAction('删除链接', '确定删除“' + link.name + '”吗？', '删除')) return;
        const position = state.links.indexOf(link);
        if (position === -1) return;
        state.links.splice(position, 1);
        const saved = persist();
        renderLinks();
        $('addLinkBtn').focus();
        if (saved) toast('链接已删除');
      });
      item.append(anchor, edit, remove);
      fragment.append(item);
    });
    $('customLinksContainer').replaceChildren($('linkBubble'), fragment);
    $('customLinksContainer').hidden = !state.links.length;
    glassTrackers.forEach(tracker => tracker.refresh());
  }
  let editingIndex = null;
  function openLinkDialog(index = null) {
    editingIndex = index;
    const link = index === null ? null : state.links[index];
    $('linkDialogTitle').textContent = link ? '编辑链接' : '添加自定义链接';
    $('linkName').value = link?.name || '';
    $('linkUrl').value = link?.url || '';
    $('linkError').textContent = '';
    $('linkModal').showModal();
    $('linkName').focus();
  }
  $('addLinkBtn').addEventListener('click', () => openLinkDialog());
  $('cancelLink').addEventListener('click', () => $('linkModal').close());
  $('linkForm').addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.isComposing || event.keyCode === 229)) event.preventDefault();
  });
  $('linkForm').addEventListener('submit', event => {
    event.preventDefault();
    if (event.isComposing) return;
    try {
      const name = $('linkName').value.trim();
      if (!name || name.length > 60) throw new Error('请填写链接名称，最多 60 个字符。');
      if (editingIndex === null && state.links.length >= 300) throw new Error('最多支持 300 个链接，请先删除不需要的链接。');
      const link = { name, url: normalizeUrl($('linkUrl').value) };
      if (editingIndex === null) state.links.push(link);
      else state.links[editingIndex] = link;
      const saved = persist();
      renderLinks();
      $('linkModal').close();
      $('addLinkBtn').focus();
      if (saved) toast('链接已保存');
    } catch (error) { $('linkError').textContent = error.message; }
  });
  let pendingConfirmation = false;
  function confirmAction(title, message, acceptLabel = '确认') {
    if (pendingConfirmation) return Promise.resolve(false);
    pendingConfirmation = true;
    $('confirmTitle').textContent = title;
    $('confirmMessage').textContent = message;
    $('confirmAccept').textContent = acceptLabel;
    $('confirmModal').returnValue = 'cancel';
    return new Promise(resolve => {
      $('confirmModal').addEventListener('close', () => {
        pendingConfirmation = false;
        resolve($('confirmModal').returnValue === 'accept');
      }, { once: true });
      $('confirmModal').showModal();
      $('confirmCancel').focus();
    });
  }
  $('confirmCancel').addEventListener('click', () => $('confirmModal').close('cancel'));
  $('confirmAccept').addEventListener('click', () => $('confirmModal').close('accept'));
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close('cancel');
    });
  });

  $('settingsBtn').addEventListener('click', () => $('settingsModal').showModal());
  $('closeSettings').addEventListener('click', () => $('settingsModal').close());
  $('exportSettings').addEventListener('click', async () => {
    await drawingLoad;
    saveDrawing();
    const backup = { format: 'shawngine-backup', version: 1, exportedAt: new Date().toISOString(), preferences: state, drawing };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'shawngine-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('importSettings').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('备份文件过大，请选择 8 MB 以内的 JSON 文件。');
      const backup = JSON.parse(await file.text());
      const linksOnly = Array.isArray(backup);
      if (!linksOnly && (backup?.format !== 'shawngine-backup' || backup.version !== 1 || !backup.preferences)) throw new Error('不是可识别的 Shawngine 备份文件。');
      const inputState = linksOnly ? { ...state, links: backup } : backup.preferences;
      const next = {
        theme: inputState.theme, engine: inputState.engine, motion: inputState.motion,
        showNetwork: Object.hasOwn(inputState, 'showNetwork') ? inputState.showNetwork : false,
        showQuotes: Object.hasOwn(inputState, 'showQuotes') ? inputState.showQuotes : true,
        quoteMode: Object.hasOwn(inputState, 'quoteMode') ? inputState.quoteMode : 'online',
        language: Object.hasOwn(inputState, 'language') ? inputState.language : 'zh',
        blur: inputState.blur, links: validateLinks(inputState.links, true)
      };
      if (!Object.hasOwn(THEMES, next.theme) || !Object.hasOwn(ENGINES, next.engine) || typeof next.motion !== 'boolean' || typeof next.showNetwork !== 'boolean' || !Number.isFinite(next.blur) || next.blur < 0 || next.blur > 12) throw new Error('备份中的设置格式不正确。');
      if (typeof next.showQuotes !== 'boolean' || !['local', 'online', 'lyrics'].includes(next.quoteMode) || !['zh', 'en'].includes(next.language)) throw new Error('备份中的摘句设置格式不正确。');
      const nextDrawing = linksOnly ? drawing : (backup.drawing ?? '');
      if (typeof nextDrawing !== 'string' || (nextDrawing && !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(nextDrawing))) throw new Error('备份中的涂鸦格式不正确。');
      if (nextDrawing && !linksOnly) await loadImage(nextDrawing);
      const message = '将导入 ' + next.links.length + ' 个链接，并替换当前' + (linksOnly ? '链接' : '设置、链接和涂鸦') + '。建议先导出当前备份。';
      if (!await confirmAction('导入备份', message, '导入并替换')) return;
      finishStroke();
      state = next;
      let saved = persist();
      if (!linksOnly) {
        drawing = nextDrawing;
        drawingDirty = false;
        if (!write(DRAWING_KEY, drawing)) saved = false;
        await (drawingLoad = restoreDrawing());
      }
      applyState();
      renderLinks();
      if (saved) toast('备份已导入');
    } catch (error) { toast(error instanceof SyntaxError ? 'JSON 文件格式不正确，请选择有效备份。' : error.message); }
  });

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => image.naturalWidth * image.naturalHeight <= 24000000 ? resolve(image) : reject(new Error('涂鸦图片尺寸过大。'));
      image.onerror = () => reject(new Error('无法读取备份中的涂鸦图片。'));
      image.src = source;
    });
  }
  function resizeCanvas() {
    if (!ctx) return;
    const snapshot = document.createElement('canvas');
    snapshot.width = canvas.width;
    snapshot.height = canvas.height;
    snapshot.getContext('2d').drawImage(canvas, 0, 0);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const previousWidth = canvasWidth;
    const previousHeight = canvasHeight;
    canvasWidth = window.innerWidth;
    canvasHeight = window.innerHeight;
    canvas.width = Math.round(canvasWidth * ratio);
    canvas.height = Math.round(canvasHeight * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (previousWidth && previousHeight) ctx.drawImage(snapshot, 0, 0, snapshot.width, snapshot.height, 0, 0, canvasWidth, canvasHeight);
  }
  async function restoreDrawing() {
    if (!ctx) { drawingReady = true; return; }
    const revision = ++drawingRevision;
    drawingReady = false;
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    if (!drawing) { drawingReady = true; return; }
    try {
      const image = await loadImage(drawing);
      if (revision === drawingRevision) ctx.drawImage(image, 0, 0, canvasWidth, canvasHeight);
    } catch { toast('保存的涂鸦无法读取，其他功能仍可使用。'); }
    finally { if (revision === drawingRevision) drawingReady = true; }
  }
  function saveDrawing() {
    clearTimeout(saveTimer);
    if (!ctx || !drawingReady || !drawingDirty) return false;
    drawing = canvas.toDataURL('image/png');
    const saved = write(DRAWING_KEY, drawing);
    drawingDirty = !saved;
    return saved;
  }
  function finishStroke() {
    if (activePointer === null) return;
    const previousPointer = activePointer;
    activePointer = null;
    if (canvas.hasPointerCapture(previousPointer)) canvas.releasePointerCapture(previousPointer);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDrawing, 200);
  }
  function strokePoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function drawSegment(from, to) {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = $('doodleColor').value;
    ctx.lineWidth = Number($('doodleSize').value);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = $('doodleColor').value;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
    drawingDirty = true;
  }
  canvas.addEventListener('pointerdown', event => {
    if (!ctx || !drawingReady || !doodleEnabled || state.theme !== 'colorful' || activePointer !== null || event.button !== 0) return;
    drawingRevision++;
    activePointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    lastPoint = strokePoint(event);
    drawSegment(lastPoint, { x: lastPoint.x + 0.01, y: lastPoint.y });
  });
  canvas.addEventListener('pointermove', event => {
    if (activePointer !== event.pointerId) return;
    const point = strokePoint(event);
    drawSegment(lastPoint, point);
    lastPoint = point;
  });
  canvas.addEventListener('pointerup', finishStroke);
  canvas.addEventListener('pointercancel', finishStroke);
  canvas.addEventListener('lostpointercapture', finishStroke);
  $('toggleDoodle').addEventListener('click', () => {
    finishStroke();
    doodleEnabled = !doodleEnabled;
    $('toggleDoodle').classList.toggle('active', doodleEnabled);
    $('toggleDoodle').setAttribute('aria-pressed', String(doodleEnabled));
    $('toggleDoodle').setAttribute('aria-label', doodleEnabled ? '停用涂鸦' : '启用涂鸦');
    applyState();
    toast(doodleEnabled ? '画笔已启用，在空白区域开始涂鸦' : '画笔已停用');
  });
  $('clearDoodle').addEventListener('click', async () => {
    if (!ctx || !await confirmAction('清除涂鸦', '确定清除当前涂鸦吗？建议先导出备份。', '清除')) return;
    finishStroke();
    clearTimeout(saveTimer);
    drawingRevision++;
    drawingReady = true;
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    drawing = '';
    drawingDirty = false;
    if (write(DRAWING_KEY, '')) toast('涂鸦已清除');
  });
  $('saveDoodle').addEventListener('click', async () => {
    await drawingLoad;
    if (!ctx) return;
    drawingDirty = true;
    if (saveDrawing()) toast('涂鸦已保存到当前浏览器');
  });
  window.addEventListener('resize', () => { finishStroke(); resizeCanvas(); });
  window.addEventListener('pagehide', saveDrawing);

  $('blurBtn').addEventListener('click', () => {
    $('blurPanel').hidden = !$('blurPanel').hidden;
    $('blurBtn').setAttribute('aria-expanded', String(!$('blurPanel').hidden));
  });
  $('blurAmount').addEventListener('input', event => {
    state.blur = Number(event.target.value);
    document.documentElement.style.setProperty('--engine-blur', state.blur + 'px');
    $('blurValue').textContent = state.blur + ' px';
  });
  $('blurAmount').addEventListener('change', persist);
  document.addEventListener('click', event => {
    if (event.target.closest('#blurBtn, #blurPanel')) return;
    $('blurPanel').hidden = true;
    $('blurBtn').setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !$('blurPanel').hidden) {
      $('blurPanel').hidden = true;
      $('blurBtn').setAttribute('aria-expanded', 'false');
      $('blurBtn').focus();
    }
  });

  const quotes = ['Must be the water', "I'm stupid", 'Simply Lovely', 'Daaaaaaaad~', 'Pole Position? !', 'Hamilton or Verstappen ?', 'Change Your Fxxking Car', 'Maxieeee~', 'Smooth Operatorrrr~', 'Blimey~', 'Copy understood~', 'Zilly boys', 'Is there a leakage?', 'Oscar', "It's Friday then~"];
  function showQuote() {
    if (state.theme !== 'f1') return;
    const quote = document.createElement('div');
    quote.className = 'f1-toast';
    quote.textContent = quotes[Math.floor(Math.random() * quotes.length)];
    if ($('f1Modal').children.length >= 3) $('f1Modal').firstElementChild.remove();
    $('f1Modal').append(quote);
    requestAnimationFrame(() => quote.classList.add('show'));
    setTimeout(() => quote.remove(), 2400);
  }
  $('f1Title').addEventListener('click', showQuote);
  $('f1Title').addEventListener('keydown', event => {
    if (state.theme === 'f1' && ['Enter', ' '].includes(event.key)) { event.preventDefault(); showQuote(); }
  });
  let showReleaseDate = false;
  $('designerLine').addEventListener('click', () => {
    showReleaseDate = !showReleaseDate;
    $('designerLine').textContent = showReleaseDate ? 'Released on 2026.04.15' : 'Designed by Shawnkt at home';
  });

  const literaryQuotes = Array.isArray(window.SHAWNGINE_QUOTES) ? window.SHAWNGINE_QUOTES : [];
  let quoteIndex = -1;
  let quoteController = null;
  let quoteGeneration = 0;
  let quoteSignature = '';
  let lastOnlineId = null;
  let lyricCooldown = 0;
  let lastLyric = '';
  // lyrics.ovh exposes a Deezer-backed suggest endpoint. Use a random search
  // word, then choose a random result, so lyrics are not limited to a tiny
  // hand-picked song list.
  const lyricSearchTerms = ['love', 'night', 'home', 'dream', 'heart', 'blue', 'fire', 'time', 'world', 'rain', 'summer', 'light', 'beautiful', 'run', 'feel', 'one', 'free', 'music', 'gold', 'hope', 'fall', 'forever', 'dance', 'road', 'star'];
  let lastSongKey = '';
  async function lyricQuote(signal, run) {
    if (Date.now() < lyricCooldown) throw new Error('Lyrics rate limit');
    const term = lyricSearchTerms[Math.floor(Math.random() * lyricSearchTerms.length)];
    const suggestUrl = new URL('https://api.lyrics.ovh/suggest/' + encodeURIComponent(term));
    const suggestResponse = await fetch(suggestUrl, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal });
    if (!suggestResponse.ok || !(suggestResponse.headers.get('content-type') || '').includes('json')) throw new Error('Song search unavailable');
    const suggestions = await suggestResponse.json();
    const songs = Array.isArray(suggestions.data) ? suggestions.data.filter(item => item?.readable !== false && item?.title && item?.artist?.name) : [];
    if (!songs.length) throw new Error('No random song');
    const candidates = songs.filter(item => item.artist.name + ' · ' + item.title !== lastSongKey);
    const selected = (candidates.length ? candidates : songs)[Math.floor(Math.random() * (candidates.length || songs.length))];
    const artist = String(selected.artist.name).trim();
    const track = String(selected.title).trim();
    lastSongKey = artist + ' · ' + track;
    const url = new URL('https://api.lyrics.ovh/v1/' + encodeURIComponent(artist) + '/' + encodeURIComponent(track));
    const response = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (response.status === 429 || response.status === 503) {
      const raw = response.headers.get('retry-after');
      const seconds = Number(raw);
      const delay = raw && !Number.isFinite(seconds) ? Math.max(0, Date.parse(raw) - Date.now()) : Math.max(1000, (seconds || 60) * 1000);
      lyricCooldown = Date.now() + (Number.isFinite(delay) ? delay : 60000) + 1000;
    }
    if (!response.ok || !(response.headers.get('content-type') || '').includes('json')) throw new Error('Lyrics unavailable');
    const item = await response.json();
    if (run !== quoteGeneration) return;
    if (typeof item.lyrics !== 'string' || item.lyrics.length > 100000) throw new Error('Invalid lyrics');
    const lines = [...new Set(item.lyrics.split(/\r?\n/).map(line => line.trim()).filter(line => line.length >= 12 && line.length <= 80 && line.split(/\s+/).length <= 10 && /^[A-Za-z]/.test(line) && /^[\x20-\x7E\u2018\u2019\u201c\u201d\u2013\u2014]+$/.test(line) && !/^(paroles|lyrics|verse|chorus|bridge|intro|outro|repeat|instrumental)\b/i.test(line) && line !== lastLyric))];
    if (!lines.length) throw new Error('No short English lyric');
    lastLyric = lines[Math.floor(Math.random() * lines.length)];
    $('dailyQuote').textContent = lastLyric;
    $('quoteSource').textContent = track + ' · ' + artist;
    $('quoteSource').href = url.href;
    $('quoteNotice').textContent = '';
  }
  function localQuote() {
    if (!literaryQuotes.length) return;
    const remembered = read('shawngine.lastQuote');
    const previous = quoteIndex >= 0 ? quoteIndex : remembered === null ? -1 : Number(remembered);
    let next = Math.floor(Math.random() * literaryQuotes.length);
    if (literaryQuotes.length > 1 && next === previous) next = (next + 1 + Math.floor(Math.random() * (literaryQuotes.length - 1))) % literaryQuotes.length;
    quoteIndex = next;
    const quote = literaryQuotes[next];
    $('dailyQuote').textContent = quote.text;
    $('quoteSource').textContent = quote.author + ' · ' + quote.work;
    $('quoteSource').href = quote.source;
    try { localStorage.setItem('shawngine.lastQuote', String(next)); } catch {}
  }
  function cancelQuote() {
    quoteGeneration++;
    quoteController?.abort();
    quoteController = null;
    $('nextQuote').removeAttribute('aria-busy');
  }
  function syncQuotes() {
    const signature = state.showQuotes + ':' + state.quoteMode;
    if (signature === quoteSignature) return;
    quoteSignature = signature;
    cancelQuote();
    if (state.showQuotes) nextQuote();
  }
  async function nextQuote() {
    cancelQuote();
    if (!state.showQuotes) return;
    if (state.quoteMode === 'local') {
      localQuote();
      $('quoteNotice').textContent = '';
      return;
    }
    const run = quoteGeneration;
    const controller = new AbortController();
    quoteController = controller;
    const timeout = setTimeout(() => controller.abort(), 6000);
    $('nextQuote').setAttribute('aria-busy', 'true');
    $('quoteNotice').textContent = '正在寻找一句话…';
    try {
      if (state.quoteMode === 'lyrics') { await lyricQuote(controller.signal, run); return; }
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await fetch('https://dummyjson.com/quotes/random?fresh=' + Date.now() + '-' + Math.random().toString(36).slice(2), { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal });
        if (!response.ok) throw new Error('Quote service unavailable');
        const item = await response.json();
        if (run !== quoteGeneration) return;
        if (!Number.isSafeInteger(item.id) || item.id < 1 || typeof item.quote !== 'string' || typeof item.author !== 'string' || !item.quote.trim() || item.author.length > 120) throw new Error('Invalid quote');
        // Keep the opening page readable and quote only short excerpts.
        if (item.quote.length > 220 || item.quote.trim().split(/\s+/).length > 25 || item.id === lastOnlineId) continue;
        $('dailyQuote').textContent = item.quote.trim();
        $('quoteSource').textContent = item.author;
        $('quoteSource').href = 'https://dummyjson.com/quotes/' + item.id;
        $('quoteNotice').textContent = '';
        lastOnlineId = item.id;
        return;
      }
      throw new Error('No suitable short quote');
    } catch {
      if (run !== quoteGeneration) return;
      localQuote();
      $('quoteNotice').textContent = '在线暂不可用 · 本地精选';
    } finally {
      clearTimeout(timeout);
      if (run === quoteGeneration) {
        quoteController = null;
        $('nextQuote').removeAttribute('aria-busy');
      }
    }
  }
  $('nextQuote').addEventListener('click', nextQuote);

  // One shared glass plate follows the hovered control, including wrapped rows.
  // Delegation keeps newly rendered bookmarks on the same single event path.
  function trackGlass(container, selector, bubble) {
    let hovered = null;
    let focused = null;
    let target = null;
    let visible = false;
    let entryFrame = 0;
    let refreshFrame = 0;
    let pointer = null;

    const controlFor = node => {
      const control = node instanceof Element ? node.closest(selector) : null;
      return control && container.contains(control) ? control : null;
    };
    const valid = control => control?.isConnected && container.contains(control) && !container.hidden;
    const keyboardFocused = () => valid(focused) && (focused.matches(':focus-visible') || focused.querySelector(':focus-visible'));
    function illuminate(control) {
      const rect = control.getBoundingClientRect();
      const x = pointer ? (pointer.x - rect.left) / rect.width * 100 : 50;
      const y = pointer ? (pointer.y - rect.top) / rect.height * 100 : 35;
      bubble.style.setProperty('--glass-x', Math.max(0, Math.min(100, x)) + '%');
      bubble.style.setProperty('--glass-y', Math.max(0, Math.min(100, y)) + '%');
    }
    function place() {
      if (!finePointer.matches) hovered = null;
      const next = valid(hovered) ? hovered : keyboardFocused() ? focused : null;
      if (!next) {
        visible = false;
        target = null;
        bubble.dataset.active = 'false';
        bubble.style.opacity = '0';
        cancelAnimationFrame(entryFrame);
        return;
      }
      const rect = next.getBoundingClientRect();
      const parent = container.getBoundingClientRect();
      if (!visible) bubble.dataset.tracking = 'false';
      bubble.style.left = rect.left - parent.left + container.scrollLeft - container.clientLeft + 'px';
      bubble.style.top = rect.top - parent.top + container.scrollTop - container.clientTop + 'px';
      bubble.style.width = rect.width + 'px';
      bubble.style.height = rect.height + 'px';
      illuminate(next);
      bubble.dataset.active = 'true';
      bubble.style.opacity = '1';
      target = next;
      if (!visible) {
        // Flush the first position without a slide from the container origin.
        bubble.getBoundingClientRect();
        cancelAnimationFrame(entryFrame);
        entryFrame = requestAnimationFrame(() => { if (visible) bubble.dataset.tracking = 'true'; });
      }
      visible = true;
    }
    function refresh() {
      cancelAnimationFrame(refreshFrame);
      refreshFrame = requestAnimationFrame(place);
    }
    container.addEventListener('pointerover', event => {
      if (event.pointerType === 'touch' || !finePointer.matches) return;
      const next = controlFor(event.target);
      if (!next) return;
      pointer = { x: event.clientX, y: event.clientY };
      hovered = next;
      place();
    });
    container.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch' || !finePointer.matches) return;
      pointer = { x: event.clientX, y: event.clientY };
      if (target) illuminate(target);
    }, { passive: true });
    container.addEventListener('pointerleave', () => { hovered = null; pointer = null; place(); });
    container.addEventListener('focusin', event => {
      focused = controlFor(event.target);
      if (keyboardFocused()) { hovered = null; pointer = null; }
      place();
    });
    container.addEventListener('focusout', () => {
      queueMicrotask(() => { focused = controlFor(document.activeElement); place(); });
    });
    container.addEventListener('pointercancel', () => { hovered = null; pointer = null; place(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { hovered = null; pointer = null; place(); }
    });
    window.addEventListener('resize', refresh);
    const observer = new ResizeObserver(refresh);
    observer.observe(container);
    return { refresh };
  }

  let followerFrame = 0;
  let followerX = innerWidth / 2;
  let followerY = innerHeight / 2;
  let mouseX = followerX;
  let mouseY = followerY;
  let lastMove = 0;
  const follower = document.querySelector('.mouse-follower');
  const trails = [...document.querySelectorAll('.trail')];
  const points = trails.map(() => ({ x: mouseX, y: mouseY }));
  function shouldFollow() { return state.motion && !reducedMotion.matches && finePointer.matches && !document.hidden; }
  function updateFollower() {
    if (!shouldFollow()) {
      cancelAnimationFrame(followerFrame);
      followerFrame = 0;
      follower.hidden = true;
      trails.forEach(trail => { trail.hidden = true; });
    }
  }
  function animateFollower(timestamp) {
    followerFrame = 0;
    if (!shouldFollow()) { updateFollower(); return; }
    follower.hidden = false;
    followerX += (mouseX - followerX) * 0.2;
    followerY += (mouseY - followerY) * 0.2;
    follower.style.left = followerX + 'px';
    follower.style.top = followerY + 'px';
    points.forEach((point, index) => {
      const target = index === 0 ? { x: followerX, y: followerY } : points[index - 1];
      point.x += (target.x - point.x) * 0.25;
      point.y += (target.y - point.y) * 0.25;
      trails[index].hidden = false;
      trails[index].style.left = point.x + 'px';
      trails[index].style.top = point.y + 'px';
    });
    if (timestamp - lastMove < 800) followerFrame = requestAnimationFrame(animateFollower);
    else { follower.hidden = true; trails.forEach(trail => { trail.hidden = true; }); }
  }
  document.addEventListener('pointermove', event => {
    if (!shouldFollow() || event.pointerType === 'touch') return;
    mouseX = event.clientX;
    mouseY = event.clientY;
    lastMove = performance.now();
    if (!followerFrame) followerFrame = requestAnimationFrame(animateFollower);
  }, { passive: true });
  document.addEventListener('visibilitychange', () => { updateFollower(); if (document.hidden) saveDrawing(); });

  glassTrackers.push(trackGlass($('enginesContainer'), '.engine', $('engineBubble')));
  glassTrackers.push(trackGlass($('customLinksContainer'), '.bookmark', $('linkBubble')));
  resizeCanvas();
  applyState();
  renderLinks();
  drawingLoad = restoreDrawing();
})();
