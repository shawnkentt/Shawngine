'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const SAMPLE_BYTES = 524288;
  const INTERVAL = 15000;
  const TIMEOUT = 12000;
  const SCALES = [10, 50, 100, 500, 1000, 2500, 10000];
  const svgNS = 'http://www.w3.org/2000/svg';
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  let enabled = false;
  let paused = false;
  let allowDataSaving = false;
  let controller = null;
  let timer = 0;
  let timeout = 0;
  let generation = 0;
  let lastValue = null;
  let lastAt = 0;
  let scale = 100;
  let busy = false;

  function svgNode(tag, attributes) {
    const node = document.createElementNS(svgNS, tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
    return node;
  }
  function drawTicks() {
    const ticks = document.createDocumentFragment();
    for (let index = 0; index <= 40; index++) {
      const angle = (150 + index * 6) * Math.PI / 180;
      const major = index % 10 === 0;
      const radius = major ? 88 : index % 5 === 0 ? 94 : 98;
      ticks.append(svgNode('line', {
        x1: 160 + Math.cos(angle) * radius, y1: 160 + Math.sin(angle) * radius,
        x2: 160 + Math.cos(angle) * 102, y2: 160 + Math.sin(angle) * 102,
        class: major ? 'gauge-tick gauge-tick-major' : 'gauge-tick'
      }));
      if (major) {
        const labelRadius = index === 0 || index === 40 ? 122 : 74;
        const text = svgNode('text', { x: 160 + Math.cos(angle) * labelRadius, y: 160 + Math.sin(angle) * labelRadius + 4, 'text-anchor': 'middle', class: 'gauge-tick-label' });
        text.textContent = String(scale * index / 40);
        ticks.append(text);
      }
    }
    $('networkTicks').replaceChildren(ticks);
    $('networkScale').textContent = '量程 ' + scale + ' Mbps';
  }
  function reading(value, adjust = true) {
    if (value !== null && adjust) {
      const nextScale = SCALES.find(limit => value <= limit * 0.95) || SCALES.at(-1);
      if (nextScale !== scale) { scale = nextScale; drawTicks(); }
    }
    const fraction = value === null ? 0 : Math.max(0, Math.min(1, value / scale));
    $('networkNeedle').setAttribute('transform', 'rotate(' + (-120 + fraction * 240) + ' 160 160)');
    $('networkArc').setAttribute('stroke-dasharray', fraction * 100 + ' 100');
    $('networkValue').textContent = value === null ? '—' : value.toFixed(value >= 100 ? 0 : 1);
    $('networkByteRate').textContent = value === null ? '— MB/s' : (value / 8).toFixed(2) + ' MB/s';
  }
  function status(kind, message) {
    $('networkGauge').dataset.state = kind;
    $('networkStatus').textContent = message;
    $('networkLive').textContent = ({ waiting: '待测', measuring: '采样中', ready: '已采样', paused: '已暂停', offline: '离线', error: '未完成' })[kind] || '待测';
  }
  function stamp() {
    if (!lastAt) { $('networkUpdated').textContent = '尚未采样'; return; }
    const seconds = Math.max(0, Math.floor((Date.now() - lastAt) / 1000));
    $('networkUpdated').textContent = seconds < 60 ? seconds + ' 秒前' : Math.floor(seconds / 60) + ' 分钟前';
  }
  function canUseNetwork() {
    return enabled && !document.hidden && navigator.onLine !== false && /^https?:$/.test(location.protocol);
  }
  function canAutoRun() {
    return canUseNetwork() && !paused && (!connection?.saveData || allowDataSaving);
  }
  function buttons() {
    $('networkToggle').textContent = paused || (connection?.saveData && !allowDataSaving) ? '开始采样' : '暂停采样';
    $('networkToggle').setAttribute('aria-pressed', String(canAutoRun()));
    $('networkRefresh').disabled = busy || !canUseNetwork();
  }
  function stop() {
    generation++;
    clearTimeout(timer);
    clearTimeout(timeout);
    if (controller) controller.abort();
    controller = null;
    busy = false;
    reading(lastValue);
    buttons();
  }
  function idleStatus() {
    stamp();
    if (navigator.onLine === false) status('offline', '已离线，恢复连接后可继续');
    else if (!/^https?:$/.test(location.protocol)) status('paused', '请打开在线网站使用下载测速');
    else if (connection?.saveData && !allowDataSaving) status('paused', '节省流量模式：点击后开始采样');
    else if (document.hidden || !enabled) status('paused', '仪表隐藏，采样已暂停');
    else if (paused) status('paused', '已暂停 · 数字为上次采样');
    else if (lastValue !== null) status('ready', '上次下载平均 · 等待下次采样');
    else status('waiting', '等待开始下载采样');
    buttons();
  }
  function schedule() {
    clearTimeout(timer);
    if (canAutoRun()) timer = setTimeout(() => sample(), INTERVAL);
  }
  async function sample(manual = false) {
    if (busy || !(manual ? canUseNetwork() : canAutoRun())) { idleStatus(); return; }
    const run = ++generation;
    const requestController = new AbortController();
    controller = requestController;
    busy = true;
    const url = new URL('./speed-sample.bin', location.href);
    url.searchParams.set('sample', Date.now() + '-' + Math.random().toString(36).slice(2));
    let timedOut = false;
    timeout = setTimeout(() => { timedOut = true; requestController.abort(); }, TIMEOUT);
    const start = performance.now();
    let lastPaint = start;
    status('measuring', '正在测量本次下载平均速度…');
    buttons();
    try {
      const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', signal: requestController.signal });
      if (!response.ok || response.redirected || new URL(response.url).pathname !== url.pathname) throw new Error('测速资源暂不可用');
      const type = (response.headers.get('content-type') || '').toLowerCase();
      // GitHub Pages automatically applies gzip to static assets. The browser
      // transparently decodes it, so validate the received byte count instead
      // of rejecting the response based on its Content-Encoding header.
      if (!type.includes('application/octet-stream') || !response.body) throw new Error('测速响应无效，请稍后重试');
      const reader = response.body.getReader();
      let received = 0;
      while (true) {
        const chunk = await reader.read();
        if (run !== generation) { await reader.cancel(); return; }
        if (chunk.done) break;
        received += chunk.value.byteLength;
        if (received > SAMPLE_BYTES) throw new Error('测速样本长度异常');
        const now = performance.now();
        if (now - lastPaint >= 100) {
          reading(received * 8 / ((now - start) * 1000));
          lastPaint = now;
        }
      }
      if (received !== SAMPLE_BYTES) throw new Error('测速样本不完整，请重试');
      const elapsed = performance.now() - start;
      const resource = performance.getEntriesByName(url.href, 'resource').at(-1);
      // A static host may compress or cache the asset. The unique query string
      // requests a fresh sample; the exact decoded byte count above is the
      // authoritative integrity check for this browser-side measurement.
      if (run !== generation) return;
      lastValue = received * 8 / (Math.max(elapsed, 1) * 1000);
      lastAt = Date.now();
      reading(lastValue);
      stamp();
      status(paused ? 'paused' : 'ready', paused ? '本次采样完成 · 自动采样已暂停' : '本次下载平均 · 等待下次采样');
    } catch (error) {
      if (run !== generation) return;
      requestController.abort();
      reading(lastValue);
      status('error', timedOut ? '本次采样超时，稍后重试' : error.name === 'AbortError' ? '采样已取消' : error.message || '采样失败，请重试');
      stamp();
    } finally {
      if (run === generation) {
        clearTimeout(timeout);
        controller = null;
        busy = false;
        buttons();
        schedule();
      }
    }
  }
  function reconcile() {
    stop();
    idleStatus();
    if (canAutoRun()) sample();
  }
  $('networkToggle').addEventListener('click', () => {
    if (connection?.saveData && !allowDataSaving) { allowDataSaving = true; paused = false; }
    else paused = !paused;
    reconcile();
  });
  $('networkRefresh').addEventListener('click', () => { if (!busy) { clearTimeout(timer); sample(true); } });
  document.addEventListener('visibilitychange', reconcile);
  window.addEventListener('offline', reconcile);
  window.addEventListener('online', reconcile);
  window.addEventListener('pagehide', stop);
  // Bandwidth/rtt estimates can change because of the sample itself.
  // Only a change in the user's data-saving preference should cancel it.
  let savingData = connection?.saveData === true;
  connection?.addEventListener?.('change', () => {
    const next = connection.saveData === true;
    if (next === savingData) return;
    savingData = next;
    if (next) allowDataSaving = false;
    reconcile();
  });
  setInterval(() => { if (enabled && !document.hidden) stamp(); }, 1000);
  drawTicks();
  reading(null);
  window.ShawngineNetwork = Object.freeze({
    configure(options) {
      const next = options.enabled === true;
      $('networkGauge').hidden = !next;
      if (next === enabled) return;
      enabled = next;
      reconcile();
    }
  });
})();
