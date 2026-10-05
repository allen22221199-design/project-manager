/* 紀錄櫃 APP 前端。純瀏覽器程式，透過 /api/jilugui 讀寫（後端在 app/api/jilugui，共用程式在 lib/jilugui.ts）。
   2026-10 從 Cloudflare Workers 搬到 Vercel；登入改成只輸入登入碼；檔案改傳到 Vercel Blob。 */
(function () {
  'use strict';

  const API = '/api/jilugui';
  const LABEL = { projects: '專案', records: '紀錄', files: '檔案' };   // 專案就是首頁
  const STATUS = ['進行中', '已完成', '待追蹤', '取消'];
  const PROJECT_STATUS = ['進行中', '暫停', '已完成'];
  const STATUS_CLASS = { '進行中': 'blue', '已完成': 'green', '待追蹤': 'yellow', '取消': 'gray' };
  const CATEGORY = ['工程', '業務', '會議', '採購', '行政', '系統開發', '其他'];
  const FILE_CATEGORY = ['文件', '照片', '圖面', '影片', '其他'];
  const PAGE = 30;

  const ICONS = {
    logo: '<svg viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="96" fill="#B4271F"/><rect x="112" y="120" width="288" height="272" rx="20" fill="#F4F5F8"/><rect x="112" y="120" width="288" height="40" rx="20" fill="#1B2230"/><rect x="112" y="140" width="288" height="20" fill="#1B2230"/><rect x="148" y="196" width="216" height="24" rx="12" fill="#1B2230"/><rect x="148" y="250" width="216" height="24" rx="12" fill="#1B2230" opacity=".55"/><rect x="148" y="304" width="150" height="24" rx="12" fill="#B4271F"/><circle cx="256" cy="140" r="12" fill="#F4F5F8"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M10 20v-5h4v5"/></svg>',
    records: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 9h6M9 13h6M9 17h3"/></svg>',
    files: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    projects: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="8" height="7" rx="1.5"/><rect x="13" y="4" width="8" height="7" rx="1.5"/><rect x="3" y="13" width="8" height="7" rx="1.5"/><rect x="13" y="13" width="8" height="7" rx="1.5"/></svg>',
    ask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  };

  const state = {
    user: null, mode: 'notion', ai: false, appName: '紀錄櫃', view: 'projects', painter: null,
    edit: false,   // 編輯模式：卡片上直接出現「改」「刪除」，檔案可以勾選多個一起刪
    records: freshList(), files: freshList(), active: freshList(), projects: freshList(), covers: {},
    chat: { messages: [], busy: false, open: false }, chatPainter: null,
  };
  function freshList() { return { items: [], cursor: null, loaded: false, loading: false, q: '', filter: '', seq: 0 }; }

  const $app = document.getElementById('app');
  let $main = null;

  // ---------- DOM 小工具 ----------
  function h(tag, props) {
    const el = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'value') el.value = v;
        else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (let i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, kid) {
    if (kid === null || kid === undefined || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach((k) => add(el, k)); return; }
    el.appendChild(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  function debounce(fn, ms) { let t; return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); }; }

  // ---------- 格式 ----------
  const WEEK = '日一二三四五六';
  function pad(n) { return String(n).padStart(2, '0'); }
  function today() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fmtDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    if (!m) return '未填日期';
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return (+m[2]) + '/' + (+m[3]) + '（' + WEEK.charAt(d.getDay()) + '）';
  }
  function fmtMonth(s) { const m = /^(\d{4})-(\d{2})/.exec(s || ''); return m ? m[1] + ' 年 ' + (+m[2]) + ' 月' : '未填日期'; }
  function fmtTime(iso) {
    const d = new Date(iso); if (isNaN(d)) return '';
    return d.toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function fmtBytes(n) {
    if (!(n >= 0)) return '';
    const u = ['B', 'KB', 'MB', 'GB']; let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return (i ? n.toFixed(n < 10 ? 1 : 0) : n) + ' ' + u[i];
  }
  function todayLabel() { const d = new Date(); return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 星期' + WEEK.charAt(d.getDay()); }
  function greeting() { const hr = new Date().getHours(); const g = hr < 11 ? '早安' : hr < 18 ? '午安' : '晚安'; return g + '，' + state.user.name; }
  function extOf(name) { const i = (name || '').lastIndexOf('.'); return i > 0 ? name.slice(i + 1).toUpperCase().slice(0, 6) : ''; }
  function kindOf(name, type) {
    const t = (type || '').toLowerCase(); const e = extOf(name).toLowerCase();
    if (t.indexOf('image/') === 0 || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'svg', 'bmp'].indexOf(e) >= 0) return 'image';
    if (t.indexOf('video/') === 0 || ['mp4', 'mov', 'webm', 'm4v'].indexOf(e) >= 0) return 'video';
    if (t === 'application/pdf' || e === 'pdf') return 'pdf';
    return 'other';
  }
  function guessCategory(file) {
    const k = kindOf(file.name, file.type);
    if (k === 'image') return '照片';
    if (k === 'video') return '影片';
    if (k === 'pdf') return '文件';
    const e = extOf(file.name).toLowerCase();
    if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'odt'].indexOf(e) >= 0) return '文件';
    if (['dwg', 'dxf', 'ai', 'psd', 'skp', 'rvt', 'cdr', 'eps'].indexOf(e) >= 0) return '圖面';
    return '其他';
  }
  const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', svg: 'image/svg+xml', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', txt: 'text/plain', csv: 'text/csv', md: 'text/markdown', json: 'application/json', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', zip: 'application/zip', dwg: 'image/vnd.dwg', ai: 'application/postscript', psd: 'image/vnd.adobe.photoshop' };
  function guessType(name) { return MIME[extOf(name).toLowerCase()] || ''; }
  // 沒有副檔名就無法判斷格式；其他格式交給伺服器決定存 Notion 還是備援空間。
  function unsupportedReason(file) {
    const e = extOf(file.name).toLowerCase();
    if (!e) return '檔名沒有副檔名，無法判斷檔案類型，請先改檔名';
    return '';
  }
  function parseTags(s) { return (s || '').split(/[,，、\s#]+/).map((t) => t.trim()).filter((t, i, a) => t && a.indexOf(t) === i).slice(0, 20); }
  function clip(s, n) { s = s || ''; return s.length > n ? s.slice(0, n) + '…' : s; }
  // 把文字裡的網址變成可點的連結
  function linkified(text, cls, tag) {
    const el = h(tag || 'p', { class: cls });
    const s = String(text || '');
    const re = /(https?:\/\/[^\s<>"'，。）)]+)/g;
    let last = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > last) el.appendChild(document.createTextNode(s.slice(last, m.index)));
      el.appendChild(h('a', { href: m[1], target: '_blank', rel: 'noopener', text: m[1] }));
      last = m.index + m[1].length;
    }
    if (last < s.length) el.appendChild(document.createTextNode(s.slice(last)));
    return el;
  }
  // 說明／細節支援很簡單的標記，讓長文字不要擠成一團：
  //   | 欄 | 欄 |   表格（第一列是表頭，|---| 分隔列可有可無）
  //   - 項目        條列；1. 項目  編號
  //   【小標】或 ## 小標   小標題（【小標】後面同一行接著寫的字會當成內文）
  //   **粗體**、網址自動變連結；其他文字照原樣換行
  function inlineRuns(el, s) {
    const re = /\*\*([^*]+)\*\*|(https?:\/\/[^\s<>"'，。）)]+)/g;
    let last = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > last) el.appendChild(document.createTextNode(s.slice(last, m.index)));
      if (m[1] !== undefined) el.appendChild(h('strong', { text: m[1] }));
      else el.appendChild(h('a', { href: m[2], target: '_blank', rel: 'noopener', text: m[2] }));
      last = m.index + m[0].length;
    }
    if (last < s.length) el.appendChild(document.createTextNode(s.slice(last)));
    return el;
  }
  const RT_SEP = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;
  const RT_BLOCK = /^(?:#{1,3}\s|【[^】]+】|[-•]\s|\d+[.、]\s*)/;
  function richText(text, cls) {
    const root = h('div', { class: 'rich' + (cls ? ' ' + cls : '') });
    const lines = String(text || '').split(/\r?\n/).map((x) => x.trim());
    let i = 0, m;
    while (i < lines.length) {
      const l = lines[i];
      if (!l) { i++; continue; }
      if (l.charAt(0) === '|') {
        const table = h('table'); let head = true;
        while (i < lines.length && lines[i].charAt(0) === '|') {
          const row = lines[i++];
          if (RT_SEP.test(row)) continue;
          const tr = h('tr');
          row.replace(/^\|/, '').replace(/\|$/, '').split('|').forEach((c) => tr.appendChild(inlineRuns(h(head ? 'th' : 'td'), c.trim())));
          table.appendChild(tr); head = false;
        }
        root.appendChild(h('div', { class: 'rich-table' }, table));
        continue;
      }
      if ((m = /^#{1,3}\s+(.+)$/.exec(l))) { root.appendChild(inlineRuns(h('h4'), m[1])); i++; continue; }
      if ((m = /^【([^】]+)】\s*(.*)$/.exec(l))) { root.appendChild(inlineRuns(h('h4'), m[1])); if (m[2]) lines[i] = m[2]; else i++; continue; }
      if (/^[-•]\s/.test(l)) {
        const ul = h('ul');
        while (i < lines.length && /^[-•]\s/.test(lines[i])) ul.appendChild(inlineRuns(h('li'), lines[i++].replace(/^[-•]\s+/, '')));
        root.appendChild(ul); continue;
      }
      if (/^\d+[.、]\s*/.test(l)) {
        const ol = h('ol');
        while (i < lines.length && /^\d+[.、]\s*/.test(lines[i])) ol.appendChild(inlineRuns(h('li'), lines[i++].replace(/^\d+[.、]\s*/, '')));
        root.appendChild(ol); continue;
      }
      const p = h('p'); let first = true;
      while (i < lines.length && lines[i] && lines[i].charAt(0) !== '|' && !RT_BLOCK.test(lines[i])) {
        if (!first) p.appendChild(document.createElement('br'));
        inlineRuns(p, lines[i]); first = false; i++;
      }
      root.appendChild(p);
    }
    return root;
  }
  // 卡片上的一行摘要：跳過表格、分隔列，去掉標記符號
  function plainSummary(s, n) {
    const lines = String(s || '').split(/\r?\n/).map((x) => x.trim()).filter((x) => x && x.charAt(0) !== '|' && !RT_SEP.test(x));
    const line = (lines[0] || '').replace(/^#{1,3}\s+/, '').replace(/^【([^】]+)】\s*/, '$1：').replace(/^[-•]\s+/, '').replace(/\*\*/g, '');
    return clip(line, n);
  }

  // ---------- 提示 ----------
  let toastTimer = null;
  function toast(msg, kind) {
    let t = document.getElementById('toast');
    if (!t) { t = h('div', { id: 'toast', class: 'toast', role: 'status' }); document.body.appendChild(t); }
    t.textContent = msg; t.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = 'toast'; }, 3200);
  }

  // ---------- API ----------
  async function api(method, path, body) {
    const opts = { method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    let res;
    try { res = await fetch(API + path, opts); } catch (e) { throw new Error('連不上伺服器，請檢查網路'); }
    let data = {};
    try { data = await res.json(); } catch (e) { data = {}; }
    if (res.status === 401 && path !== '/login' && path !== '/me') { state.user = null; render(); throw new Error(data.error || '請重新登入'); }
    if (!res.ok) throw new Error(data.error || ('發生錯誤（' + res.status + '）'));
    return data;
  }

  async function boot() {
    try { state.edit = localStorage.getItem('jilugui.edit') === '1'; } catch (e) { /* 無痕模式等 */ }
    try {
      const me = await api('GET', '/me');
      state.user = me.user; state.mode = me.mode; state.ai = !!me.ai; state.appName = me.app || state.appName;
    } catch (e) {
      state.user = null;
      try { const r = await fetch(API + '/health'); const j = await r.json(); state.mode = j.mode; state.ai = !!j.ai; state.appName = j.app || state.appName; } catch (e2) { /* 離線 */ }
    }
    document.title = state.appName;
    render();
  }
  async function logout() {
    try { await api('POST', '/logout'); } catch (e) { /* 忽略 */ }
    state.user = null; state.records = freshList(); state.files = freshList(); state.active = freshList(); state.projects = freshList(); state.covers = {}; state.chat = { messages: [], busy: false, open: false }; state.view = 'projects';
    render();
  }

  // ---------- 畫面 ----------
  function render() {
    if (state.user) { $app.replaceChildren(shell()); renderView(); }
    else $app.replaceChildren(loginView());
  }

  function loginView() {
    // 只輸入登入碼就能登入：每個人的登入碼不一樣，伺服器用登入碼認出是誰（記錄者照樣會填對）。
    const code = h('input', { id: 'login-code', type: 'password', autocomplete: 'current-password', placeholder: '登入碼', required: true, autofocus: true });
    const err = h('div', { class: 'form-error', id: 'login-error' });
    const btn = h('button', { class: 'btn primary block', type: 'submit', text: '登入' });
    const form = h('form', { class: 'login-form', onsubmit: async (e) => {
      e.preventDefault(); err.textContent = ''; btn.disabled = true;
      try {
        const r = await api('POST', '/login', { code: code.value });
        state.user = r.user; state.mode = r.mode; state.ai = !!r.ai; state.appName = r.app || state.appName;
        render();
      } catch (ex) { err.textContent = ex.message; } finally { btn.disabled = false; }
    } }, code, err, btn);
    return h('div', { class: 'login' }, h('div', { class: 'login-card' },
      h('div', { class: 'login-logo', html: ICONS.logo }),
      h('h1', { class: 'login-title', text: state.appName }),
      h('p', { class: 'login-sub', text: '存放檔案，也記下做過的事。' }),
      form,
      state.mode === 'demo'
        ? h('p', { class: 'hint', text: '示範模式：登入碼「123456」是王小明、「567890」是陳小美。資料只放在記憶體，不會真的存進 Notion。' })
        : h('p', { class: 'hint', text: '輸入自己的登入碼就會登入。登入碼由管理者在 Notion 的「成員」名單設定，每個人一組。' })));
  }

  function shell() {
    $main = h('main', { class: 'main' });
    const tabs = h('nav', { class: 'tabbar', 'aria-label': '主選單' }, Object.keys(LABEL).map((v) =>
      h('button', { class: 'tab' + (state.view === v ? ' active' : ''), 'data-view': v, type: 'button', onclick: () => setView(v) },
        h('span', { class: 'tab-icon', html: ICONS[v] }), h('span', { class: 'tab-label', text: LABEL[v] }))));
    return h('div', { class: 'shell' },
      h('header', { class: 'topbar' },
        h('div', { class: 'brand' }, h('span', { class: 'brand-mark', html: ICONS.logo }), h('span', { class: 'brand-name', text: state.appName }), state.mode === 'demo' ? h('span', { class: 'pill demo', text: '示範' }) : null),
        h('div', { class: 'topbar-right' },
          h('button', { class: 'editbtn' + (state.edit ? ' on' : ''), type: 'button', title: '開啟後，專案、紀錄、檔案的卡片上會直接出現「改」和「刪除」；檔案可以勾選多個一起刪', text: state.edit ? '✓ 編輯模式' : '編輯模式', onclick: toggleEdit }),
          h('button', { class: 'who', type: 'button', title: '帳號設定', text: state.user.name + (state.user.role === 'admin' ? '（管理者）' : ''), onclick: openAccount }),
          h('button', { class: 'linkbtn', type: 'button', text: '登出', onclick: logout }))),
      state.edit ? h('div', { class: 'editnote', text: '編輯模式：卡片上的「改」可以改文字、「刪除」直接刪；檔案勾選後可以一次刪掉多個。' }) : null,
      tabs, $main,
      h('button', { class: 'fab add', type: 'button', 'aria-label': '新增', title: '新增', html: ICONS.plus, onclick: openAddMenu }),
      h('button', { class: 'fab assistant', type: 'button', 'aria-label': '問紀錄櫃', title: '問紀錄櫃', html: ICONS.ask, onclick: toggleAssistant }),
      assistantPanel());
  }

  function toggleEdit() {
    state.edit = !state.edit;
    try { localStorage.setItem('jilugui.edit', state.edit ? '1' : '0'); } catch (e) { /* 存不了就只有這次有效 */ }
    render();
  }
  function setView(v) {
    state.view = v;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === v));
    if (v === 'projects') {
      for (const s of [state.records, state.files]) if (s.q || s.filter) { s.q = ''; s.filter = ''; s.loaded = false; }
    }
    renderView();
    window.scrollTo(0, 0);
  }
  function renderView() {
    $main.replaceChildren(state.view === 'records' ? recordsView() : state.view === 'files' ? filesView() : projectsView());
  }
  function repaint() { if (state.painter) state.painter(); }
  function ensureLoaded(s, loader) { if (!s.loaded && !s.loading) loader(true); }

  // ---------- 首頁＝專案（見下面的「專案」區）----------
  // 細節只取第一行、最多 80 字，當成「現在做到哪」的一句話
  function firstLine(s, n) { return plainSummary(s, n); }
  // 沒掛專案的進行中／待追蹤：有掛專案的在專案卡片上看，這裡只列沒歸專案的，照分類分組。
  // 一件都沒有就把整個區塊藏起來。
  function paintBoard(el, section) {
    const items = state.active.items.filter((r) => !r.projectId);
    section.hidden = !items.length;
    if (!items.length) { el.replaceChildren(); return; }
    const groups = new Map();
    for (const r of items) {
      const k = r.category || '未分類';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    const order = CATEGORY.concat(['未分類']).filter((k) => groups.has(k)).concat(Array.from(groups.keys()).filter((k) => CATEGORY.indexOf(k) < 0 && k !== '未分類'));
    el.replaceChildren.apply(el, order.map((k) => {
      const rows = groups.get(k);
      return h('div', { class: 'board-group' },
        h('div', { class: 'board-head' }, h('span', { text: k }), h('span', { class: 'n', text: String(rows.length) })),
        rows.map((r) => h('button', { class: 'brow', type: 'button', onclick: () => openRecord(r) },
          h('div', { class: 'brow-top' }, chip(r.status, STATUS_CLASS[r.status] || 'gray'), h('span', { class: 'brow-title', text: r.title || '（無標題）' })),
          r.note ? h('div', { class: 'brow-note', text: firstLine(r.note, 80) }) : null,
          h('div', { class: 'brow-meta', text: [fmtDate(r.date), r.by, r.fileIds.length ? '附件 ' + r.fileIds.length : '', r.link ? '有連結' : ''].filter(Boolean).join(' · ') }))));
    }));
  }

  // ---------- 紀錄 ----------
  function recordsView() {
    const s = state.records;
    const wrap = h('div', { class: 'view' });
    const search = h('input', { type: 'search', class: 'search', id: 'search-records', placeholder: '搜尋做了什麼、細節、記錄者', value: s.q, 'aria-label': '搜尋紀錄',
      oninput: debounce((e) => { s.q = e.target.value.trim(); loadRecords(true); }, 350) });
    const chips = h('div', { class: 'chips scroll' }, [''].concat(STATUS).map((st) => h('button', { type: 'button', class: 'chip' + (s.filter === st ? ' active' : ''), 'data-v': st, text: st || '全部',
      onclick: () => { s.filter = st; chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.v === st)); loadRecords(true); } })));
    const listEl = h('div', { class: 'list' });
    const more = h('button', { type: 'button', class: 'btn block more', text: '載入更多', onclick: () => loadRecords(false) });
    wrap.appendChild(h('h1', { class: 'page-title', text: '紀錄' }));
    wrap.appendChild(search); wrap.appendChild(chips); wrap.appendChild(listEl); wrap.appendChild(more);
    const paint = () => {
      if (state.view !== 'records') return;
      paintGroupedRecords(listEl, s);
      more.hidden = !s.cursor; more.disabled = s.loading; more.textContent = s.loading ? '載入中…' : '載入更多';
    };
    state.painter = paint; paint(); ensureLoaded(s, loadRecords);
    return wrap;
  }
  function paintGroupedRecords(el, s) {
    if (!s.loaded && s.loading) { el.replaceChildren(h('div', { class: 'muted', text: '載入中…' })); return; }
    if (!s.items.length) { el.replaceChildren(h('div', { class: 'empty', text: s.loaded ? (s.q || s.filter ? '沒有符合的紀錄。' : '還沒有紀錄。按右下角「＋」寫下第一件做過的事。') : '' })); return; }
    const out = []; let month = null;
    const hooks = { onChanged: (saved) => { replaceItem(s, saved); repaint(); }, onDeleted: () => repaint() };
    for (const r of s.items) {
      const mk = (r.date || '').slice(0, 7);
      if (mk !== month) { month = mk; out.push(h('h2', { class: 'month', text: fmtMonth(r.date) })); }
      out.push(recordCard(r, hooks));
    }
    el.replaceChildren.apply(el, out);
  }
  function chip(text, cls) { return h('span', { class: 'chip-s' + (cls ? ' ' + cls : ''), text }); }
  // hooks（編輯模式用）：onChanged(saved) 改完要更新哪份清單、onDeleted(id) 刪完要重畫什麼
  function recordCard(r, hooks) {
    return h('article', { class: 'card', tabindex: 0, role: 'button', onclick: () => openRecord(r), onkeydown: (e) => { if (e.key === 'Enter') openRecord(r); } },
      h('div', { class: 'card-date', text: fmtDate(r.date) }),
      h('div', { class: 'card-body' },
        h('div', { class: 'card-title', text: r.title || '（無標題）' }),
        r.note ? h('div', { class: 'card-note', text: plainSummary(r.note, 90) }) : null,
        h('div', { class: 'chips' }, r.projectId && projectName(r.projectId) ? chip('📁 ' + projectName(r.projectId), 'proj') : null, r.status ? chip(r.status, STATUS_CLASS[r.status] || 'gray') : null, r.category ? chip(r.category) : null, r.tags.map((t) => chip('#' + t, 'tag')), r.fileIds.length ? chip('附件 ' + r.fileIds.length) : null, r.link ? chip('連結') : null),
        h('div', { class: 'card-meta', text: [r.by, r.code].filter(Boolean).join(' · ') })),
      state.edit ? recordTools(r, hooks || {}) : null);
  }
  // 編輯模式：紀錄卡片上的「改」「刪除」。按鈕要擋住冒泡，不然會連卡片一起打開。
  function stopThen(fn) { return (e) => { e.stopPropagation(); e.preventDefault(); fn(e); }; }
  function recordTools(r, hooks) {
    return h('div', { class: 'tools' },
      h('button', { class: 'btn small', type: 'button', text: '改', title: '改標題、細節、狀態、標籤', onclick: stopThen(() => openRecordForm(r, null, { afterSave: (saved) => { if (hooks.onChanged) hooks.onChanged(saved); } })) }),
      canDelete(r.by) ? h('button', { class: 'btn small danger', type: 'button', text: '刪除', onclick: stopThen(async (e) => {
        if (!confirm('刪除「' + (r.title || '（無標題）') + '」這筆紀錄？相關檔案會留在檔案庫。')) return;
        e.target.disabled = true;
        try {
          await api('DELETE', '/records/' + r.id);
          state.records.items = state.records.items.filter((x) => x.id !== r.id);
          state.active.items = state.active.items.filter((x) => x.id !== r.id);
          toast('已刪除紀錄'); loadProjects();
          if (hooks.onDeleted) hooks.onDeleted(r.id); else repaint();
        } catch (ex) { toast(ex.message, 'err'); e.target.disabled = false; }
      }) }) : null);
  }

  async function openRecord(r) {
    const sh = openSheet(r.title || '（無標題）');
    const b = sh.body;
    b.appendChild(h('div', { class: 'meta', text: [fmtDate(r.date), r.code, r.by ? '記錄者 ' + r.by : ''].filter(Boolean).join(' · ') }));
    const proj = r.projectId ? state.projects.items.find((x) => x.id === r.projectId) : null;
    b.appendChild(h('div', { class: 'chips' }, proj ? chip('📁 ' + proj.name, 'proj') : null, r.status ? chip(r.status, STATUS_CLASS[r.status] || 'gray') : null, r.category ? chip(r.category) : null, r.tags.map((t) => chip('#' + t, 'tag'))));
    if (proj) b.appendChild(h('button', { class: 'linkbtn', type: 'button', text: '看這個專案的全部紀錄與檔案 →', onclick: () => { sh.close(); openProject(proj); } }));
    if (r.link) b.appendChild(h('div', { class: 'linkbox' }, h('a', { class: 'btn primary', href: r.link, target: '_blank', rel: 'noopener', text: '開啟連結' }), h('a', { class: 'link-url', href: r.link, target: '_blank', rel: 'noopener', text: r.link })));
    if (r.note) b.appendChild(richText(r.note, 'note'));
    const filesEl = h('div', { class: 'grid small' });
    b.appendChild(h('h3', { class: 'sub', text: '相關檔案' + (r.fileIds.length ? '（' + r.fileIds.length + '）' : '') }));
    b.appendChild(filesEl);
    if (r.attachments && r.attachments.length) {
      b.appendChild(h('h3', { class: 'sub', text: 'Notion 附件' }));
      b.appendChild(h('div', { class: 'linklist' }, r.attachments.map((a) => h('a', { class: 'filelink', href: fileUrl(r.id, a.index), target: '_blank', rel: 'noopener', text: a.name }))));
    }
    const actions = h('div', { class: 'actions' });
    actions.appendChild(h('button', { class: 'btn', type: 'button', text: '編輯', onclick: () => openRecordForm(r, sh) }));
    if (canDelete(r.by)) actions.appendChild(h('button', { class: 'btn danger', type: 'button', text: '刪除', onclick: () => confirmBox(actions, '刪除這筆紀錄？相關檔案會保留在檔案庫。', async () => {
      await api('DELETE', '/records/' + r.id);
      state.records.items = state.records.items.filter((x) => x.id !== r.id);
      state.active.items = state.active.items.filter((x) => x.id !== r.id);
      toast('已刪除紀錄'); sh.close(); repaint();
    }) }));
    if (r.notionUrl && state.user.role === 'admin') actions.appendChild(h('a', { class: 'btn', href: r.notionUrl, target: '_blank', rel: 'noopener', text: '在 Notion 開啟' }));
    b.appendChild(actions);
    b.appendChild(h('div', { class: 'meta small', text: ['建立 ' + fmtTime(r.createdAt), r.updatedAt ? '修改 ' + fmtTime(r.updatedAt) : ''].filter(Boolean).join(' · ') }));
    if (!r.fileIds.length) { filesEl.appendChild(h('div', { class: 'muted', text: '沒有相關檔案' })); return; }
    filesEl.appendChild(h('div', { class: 'muted', text: '載入中…' }));
    const files = await Promise.all(r.fileIds.map(cachedFile));
    const ok = files.filter(Boolean);
    filesEl.replaceChildren.apply(filesEl, ok.length ? ok.map(fileTile) : [h('div', { class: 'muted', text: '相關檔案已被刪除' })]);
  }

  // opts.projectId：從專案頁新增時預選專案；opts.afterSave：存完要做的事（例如重新整理專案頁）
  function openRecordForm(existing, parentSheet, opts) {
    opts = opts || {};
    const sh = openSheet(existing ? '編輯紀錄' : '新增紀錄', { wide: true });
    const f = {
      date: h('input', { type: 'date', id: 'f-date', value: existing ? (existing.date || '') : today(), required: true }),
      title: h('input', { type: 'text', id: 'f-title', maxlength: 200, placeholder: '例如：台中建設公司拜訪、三樓牆面安裝完成', value: existing ? existing.title : '', required: true }),
      note: h('textarea', { id: 'f-note', rows: 4, placeholder: '過程、結果、之後要接著做的事', value: existing ? existing.note : '' }),
      status: select('f-status', STATUS, existing ? existing.status : '進行中'),
      category: select('f-category', CATEGORY, existing ? existing.category : ''),
      project: projectSelect('f-project', existing ? existing.projectId : (opts.projectId || '')),
      tags: h('input', { type: 'text', id: 'f-tags', placeholder: '用逗號分開，例如：客戶, 重要', value: existing ? existing.tags.join(', ') : '' }),
      link: h('input', { type: 'url', id: 'f-link', placeholder: 'https://…（網站、APP 或相關頁面，選填）', value: existing ? (existing.link || '') : '' }),
    };
    const picker = filePicker();
    const err = h('div', { class: 'form-error' });
    const submit = h('button', { class: 'btn primary', type: 'submit', text: existing ? '儲存變更' : '儲存紀錄' });
    const form = h('form', { class: 'form' },
      h('div', { class: 'row' }, field('日期', f.date), field('狀態', f.status)),
      field('做了什麼', f.title),
      field('細節', f.note),
      h('div', { class: 'row' }, field('專案', f.project), field('分類', f.category)),
      h('div', { class: 'row' }, field('標籤', f.tags), field('連結', f.link)),
      field(existing ? '再附加檔案' : '附加檔案', picker.el),
      err,
      h('div', { class: 'actions' }, submit, h('button', { class: 'btn', type: 'button', text: '取消', onclick: () => sh.close() })));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = f.title.value.trim();
      if (!title) { err.textContent = '請填「做了什麼」'; f.title.focus(); return; }
      err.textContent = ''; submit.disabled = true; sh.lock(true);
      try {
        const newIds = await picker.uploadAll((file) => ({ category: guessCategory(file) }));
        const data = { title, date: f.date.value, note: f.note.value.trim(), status: f.status.value, category: f.category.value, tags: parseTags(f.tags.value), link: f.link.value.trim(), projectId: f.project.value };
        let saved;
        if (existing) {
          if (newIds.length) data.fileIds = existing.fileIds.concat(newIds);
          saved = await api('PATCH', '/records/' + existing.id, data);
          replaceItem(state.records, saved);
        } else {
          data.fileIds = newIds;
          saved = await api('POST', '/records', data);
          state.records.items.unshift(saved);
          state.records.loaded = true;
        }
        toast(existing ? '已儲存' : '已新增紀錄');
        sh.lock(false); sh.close(); if (parentSheet) parentSheet.close();
        repaint();
        loadActive();
        if (data.projectId || (existing && existing.projectId)) loadProjects();   // 專案的筆數變了
        if (newIds.length) loadFiles(true);
        if (opts.afterSave) opts.afterSave(saved);
      } catch (ex) { err.textContent = ex.message; submit.disabled = false; sh.lock(false); }
    });
    sh.body.appendChild(form);
    setTimeout(() => f.title.focus(), 60);
  }

  // ---------- 檔案 ----------
  function filesView() {
    const s = state.files;
    const wrap = h('div', { class: 'view' });
    const search = h('input', { type: 'search', class: 'search', id: 'search-files', placeholder: '搜尋檔名、說明、上傳者', value: s.q, 'aria-label': '搜尋檔案',
      oninput: debounce((e) => { s.q = e.target.value.trim(); loadFiles(true); }, 350) });
    const chips = h('div', { class: 'chips scroll' }, [''].concat(FILE_CATEGORY).map((c) => h('button', { type: 'button', class: 'chip' + (s.filter === c ? ' active' : ''), 'data-v': c, text: c || '全部',
      onclick: () => { s.filter = c; chips.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x.dataset.v === c)); loadFiles(true); } })));
    const gridEl = h('div', { class: 'grid' });
    const more = h('button', { type: 'button', class: 'btn block more', text: '載入更多', onclick: () => loadFiles(false) });
    // 管理者可以幫舊檔案（Cloudflare 版時期上傳、沒有縮圖的）一次補縮圖
    const fillBtn = h('button', { class: 'btn small', type: 'button', text: '產生縮圖', title: '幫還沒有縮圖的 PDF、影片、照片補上縮圖', onclick: () => backfillThumbs(fillBtn) });
    wrap.appendChild(h('div', { class: 'section-head' }, h('h1', { class: 'page-title', text: '檔案' }), state.user.role === 'admin' ? fillBtn : null));
    // 編輯模式的多選列：勾選後可以一次刪掉多個
    const ed = selection(() => s.items, { repaint: () => paint(), onDeleted: () => paint(), onChanged: (saved) => { replaceItem(s, saved); paint(); } });
    wrap.appendChild(search); wrap.appendChild(chips); wrap.appendChild(ed.bar); wrap.appendChild(gridEl); wrap.appendChild(more);
    const paint = () => {
      if (state.view !== 'files') return;
      if (!s.loaded && s.loading) gridEl.replaceChildren(h('div', { class: 'muted', text: '載入中…' }));
      else if (!s.items.length) gridEl.replaceChildren(h('div', { class: 'empty', text: s.loaded ? (s.q || s.filter ? '沒有符合的檔案。' : '還沒有檔案。按右下角「＋」上傳第一個檔案。') : '' }));
      else gridEl.replaceChildren.apply(gridEl, s.items.map((f) => fileTile(f, ed)));
      ed.onSel();
      more.hidden = !s.cursor; more.disabled = s.loading; more.textContent = s.loading ? '載入中…' : '載入更多';
    };
    state.painter = paint; paint(); ensureLoaded(s, loadFiles);
    ensureLoaded(state.records, loadRecords);   // 檔案格要標示「屬於哪一筆紀錄」，需要紀錄的標題
    ensureLoaded(state.projects, loadProjects);
    return wrap;
  }
  // 幫舊檔案補縮圖：一次處理目前已載入、還沒有縮圖的 PDF／影片／照片。
  // 存在 Notion 的檔案經 ?raw=1 同網域轉一手再下載（Notion 的網址沒有 CORS，瀏覽器直接抓會被擋）。
  async function backfillThumbs(btn) {
    const todo = state.files.items.filter((f) => !f.thumb && f.files[0] && ['image', 'pdf', 'video'].indexOf(kindOf(f.files[0].name, '')) >= 0);
    if (!todo.length) { toast('目前載入的檔案都有縮圖了'); return; }
    if (!confirm('要幫 ' + todo.length + ' 個檔案產生縮圖嗎？會逐一下載檔案來產生，檔案大的話要等一下。')) return;
    btn.disabled = true;
    let ok = 0, bad = 0;
    for (let i = 0; i < todo.length; i++) {
      const f = todo[i];
      btn.textContent = '產生縮圖 ' + (i + 1) + '/' + todo.length;
      try {
        const saved = await api('PATCH', '/files/' + f.id, { thumb: await genThumbFor(f) });
        replaceItem(state.files, saved); ok++; repaint();
      } catch (e) { bad++; console.warn('補縮圖失敗', f.name, e); }
    }
    btn.disabled = false; btn.textContent = '產生縮圖';
    toast('縮圖完成 ' + ok + ' 個' + (bad ? '，' + bad + ' 個失敗（格式不支援或下載失敗）' : ''), bad ? 'err' : '');
  }
  function fileUrl(id, idx, download) { return API + '/file/' + id + '/' + (idx || 0) + (download ? '?download=1' : ''); }
  function thumbFor(f, big) {
    const first = f.files[0];
    const kind = first ? kindOf(first.name, '') : 'other';
    const box = h('div', { class: big ? 'preview' : 'thumb' });
    // 小格優先用自動產生的縮圖（PDF 第一頁、影片畫面、照片縮小版），右下角標示檔案種類
    if (!big && f.thumb) {
      box.appendChild(h('img', { src: f.thumb, alt: f.name, loading: 'lazy' }));
      if (kind !== 'image') box.appendChild(h('span', { class: 'thumb-badge', text: kind === 'video' ? '▶ 影片' : kind === 'pdf' ? 'PDF' : (extOf(f.name) || 'FILE') }));
      return box;
    }
    if (first && kind === 'image') {
      const img = h('img', { src: first.url || fileUrl(f.id, first.index), alt: f.name, loading: 'lazy' });
      img.addEventListener('error', () => {
        if (!img.dataset.retry) { img.dataset.retry = '1'; img.src = fileUrl(f.id, first.index); }
        else box.replaceChildren(h('span', { class: 'ext', text: extOf(f.name) || 'FILE' }));
      });
      box.appendChild(img);
    } else if (first && kind === 'video' && big) {
      box.appendChild(h('video', { src: fileUrl(f.id, first.index), controls: true, preload: 'metadata', playsinline: true }));
    } else if (first && kind === 'pdf' && big) {
      box.classList.add('pdf');
      box.appendChild(h('iframe', { src: fileUrl(f.id, first.index), title: f.name, loading: 'lazy' }));
    } else {
      box.appendChild(h('span', { class: 'ext' + (big ? ' big' : ''), text: kind === 'video' ? '影片' : kind === 'pdf' ? 'PDF' : (extOf(f.name) || 'FILE') }));
    }
    return box;
  }
  // 這個檔案屬於哪一筆紀錄（哪個項目）：從已載入的紀錄裡找，找不到就不顯示
  function relatedTitle(f) {
    for (const id of f.recordIds || []) {
      const r = state.records.items.find((x) => x.id === id) || state.active.items.find((x) => x.id === id);
      if (r && r.title) return r.title;
    }
    return '';
  }
  // 檔案格上的「📌」：直接掛在專案就顯示專案名，不然顯示它屬於哪一筆紀錄
  function pinLabel(f) {
    if (f.projectId) return projectName(f.projectId) || '';
    return relatedTitle(f);
  }
  // ed（編輯模式用，可省略）：selection() 做出來的多選狀態，有的話格子左上角多一個勾選框
  function fileTile(f, ed) {
    const rec = pinLabel(f);
    const picked = !!(state.edit && ed && ed.sel.has(f.id));
    return h('article', { class: 'tile' + (state.edit ? ' editing' : '') + (picked ? ' picked' : ''), tabindex: 0, role: 'button', onclick: () => openFile(f), onkeydown: (e) => { if (e.key === 'Enter') openFile(f); } },
      state.edit && ed ? h('input', { type: 'checkbox', class: 'tile-check', 'aria-label': '勾選 ' + f.name, checked: picked, onclick: (e) => { e.stopPropagation(); if (e.target.checked) ed.sel.add(f.id); else ed.sel.delete(f.id); e.target.closest('.tile').classList.toggle('picked', e.target.checked); ed.onSel(); } }) : null,
      thumbFor(f, false),
      h('div', { class: 'tile-body' },
        h('div', { class: 'tile-name', text: f.name }),
        rec ? h('div', { class: 'tile-rec', title: rec, text: '📌 ' + rec }) : null,
        h('div', { class: 'tile-meta', text: [f.category, fileDate(f), f.by].filter(Boolean).join(' · ') })),
      state.edit ? fileTools(f, ed) : null);
  }
  // 編輯模式：檔案格上的「改」「刪除」
  function fileTools(f, ed) {
    return h('div', { class: 'tools' },
      h('button', { class: 'btn small', type: 'button', text: '改', title: '改檔名、說明、標籤、所屬專案', onclick: stopThen(() => openFileEdit(f, null, ed && ed.onChanged)) }),
      canDelete(f.by) ? h('button', { class: 'btn small danger', type: 'button', text: '刪除', onclick: stopThen(async (e) => {
        if (!confirm('刪除「' + f.name + '」？刪掉就找不回來了。')) return;
        e.target.disabled = true;
        try { await deleteFiles([f]); toast('已刪除檔案'); if (ed) ed.onDeleted([f.id]); else repaint(); }
        catch (ex) { toast(ex.message, 'err'); e.target.disabled = false; }
      }) }) : null);
  }
  // 一次刪多個檔案：逐一呼叫 API，刪掉的從已載入清單拿掉；專案卡片的檔案數會變，重抓專案
  // 逐一刪；onEach(已刪幾個, 檔案) 讓多選刪除顯示進度。不管中途有沒有失敗，有刪到就重載一次專案清單（筆數變了）
  async function deleteFiles(list, onEach) {
    let n = 0;
    try {
      for (const f of list) {
        await api('DELETE', '/files/' + f.id);
        state.files.items = state.files.items.filter((x) => x.id !== f.id);
        n++; if (onEach) onEach(n, f);
      }
    } finally { if (n) loadProjects(); }
    return n;
  }
  // 編輯模式的多選：getFiles() 回傳畫面上這一批檔案；hooks.repaint 重畫格子、hooks.onDeleted(ids) 刪完更新清單、hooks.onChanged(saved) 改完更新清單
  function selection(getFiles, hooks) {
    const ed = { sel: new Set(), bar: h('div', { class: 'editbar', hidden: true }) };
    ed.onSel = function () {
      const files = getFiles() || [];
      const n = files.filter((f) => ed.sel.has(f.id)).length;
      ed.bar.hidden = !state.edit || !files.length;
      if (ed.bar.hidden) return;
      ed.bar.replaceChildren.apply(ed.bar, [
        h('span', { class: 'editbar-n', text: n ? '已勾選 ' + n + ' 個檔案' : '勾選檔案後可以一次刪除' }),
        h('button', { class: 'btn small', type: 'button', text: n === files.length ? '取消全選' : '全選', onclick: () => { if (n === files.length) ed.sel.clear(); else files.forEach((f) => ed.sel.add(f.id)); hooks.repaint(); } }),
        n ? h('button', { class: 'btn small danger', type: 'button', text: '刪除所選（' + n + '）', onclick: async (e) => {
          const picked = files.filter((f) => ed.sel.has(f.id));
          const allowed = picked.filter((f) => canDelete(f.by));
          if (!allowed.length) { toast('勾選的檔案都不是你上傳的，不能刪', 'err'); return; }
          const skip = picked.length - allowed.length;
          if (!confirm('刪除這 ' + allowed.length + ' 個檔案？刪掉就找不回來了。' + (skip ? '（另外 ' + skip + ' 個不是你上傳的，會略過）' : ''))) return;
          e.target.disabled = true; e.target.textContent = '刪除中…';
          const done = [];
          try {
            await deleteFiles(allowed, (n, f) => { done.push(f.id); e.target.textContent = '刪除中 ' + n + '/' + allowed.length; });
            toast('已刪除 ' + done.length + ' 個檔案');
          } catch (ex) { toast(ex.message, 'err'); }
          done.forEach((id) => ed.sel.delete(id));
          hooks.onDeleted(done);
        } }) : null].filter(Boolean));
    };
    ed.onDeleted = (ids) => { ids.forEach((id) => ed.sel.delete(id)); hooks.onDeleted(ids); };
    ed.onChanged = hooks.onChanged;
    return ed;
  }
  // 檔案顯示的日期是「完成日期」，舊資料沒填才退回上傳時間
  function fileDate(f) { return f.date ? fmtDate(f.date) : fmtTime(f.createdAt); }

  async function openFile(f) {
    const sh = openSheet(f.name, { wide: true });
    const b = sh.body;
    const first = f.files[0];
    b.appendChild(thumbFor(f, true));
    b.appendChild(h('div', { class: 'meta', text: [f.code, f.category, f.date ? '日期 ' + fmtDate(f.date) : '', f.by ? '上傳者 ' + f.by : '', '上傳 ' + fmtTime(f.createdAt)].filter(Boolean).join(' · ') }));
    if (f.tags.length) b.appendChild(h('div', { class: 'chips' }, f.tags.map((t) => chip('#' + t, 'tag'))));
    if (f.note) b.appendChild(richText(f.note, 'note'));
    if (f.files.length > 1) {
      b.appendChild(h('h3', { class: 'sub', text: '這一筆有 ' + f.files.length + ' 個檔案' }));
      b.appendChild(h('div', { class: 'linklist' }, f.files.map((x) => h('a', { class: 'filelink', href: fileUrl(f.id, x.index), target: '_blank', rel: 'noopener', text: x.name }))));
    }
    const actions = h('div', { class: 'actions' },
      first ? h('a', { class: 'btn primary', href: fileUrl(f.id, first.index), target: '_blank', rel: 'noopener', text: '開啟' }) : null,
      first ? h('a', { class: 'btn', href: fileUrl(f.id, first.index, true), text: '下載' }) : null,
      h('button', { class: 'btn', type: 'button', text: '編輯', onclick: () => openFileEdit(f, sh) }),
      canDelete(f.by) ? h('button', { class: 'btn danger', type: 'button', text: '刪除', onclick: () => confirmBox(actions, '刪除這個檔案？刪掉就找不回來了。', async () => {
        await api('DELETE', '/files/' + f.id);
        state.files.items = state.files.items.filter((x) => x.id !== f.id);
        toast('已刪除檔案'); sh.close(); repaint();
      }) }) : null);
    b.appendChild(actions);
    const relEl = h('div', { class: 'linklist' });
    b.appendChild(h('h3', { class: 'sub', text: '相關紀錄' }));
    b.appendChild(relEl);
    if (!f.recordIds.length) { relEl.appendChild(h('div', { class: 'muted', text: '沒有相關紀錄' })); return; }
    relEl.appendChild(h('div', { class: 'muted', text: '載入中…' }));
    const recs = (await Promise.all(f.recordIds.map(cachedRecord))).filter(Boolean);
    relEl.replaceChildren.apply(relEl, recs.length ? recs.map((r) => h('button', { class: 'reclink', type: 'button', onclick: () => openRecord(r) }, h('span', { class: 'mono small muted', text: fmtDate(r.date) + '  ' }), r.title || '（無標題）')) : [h('div', { class: 'muted', text: '相關紀錄已被刪除' })]);
  }

  // onSaved(saved)：編輯模式從專案頁改檔案時，順便更新專案頁手上那份清單
  function openFileEdit(f, parentSheet, onSaved) {
    const sh = openSheet('編輯檔案資料');
    const name = h('input', { type: 'text', id: 'e-name', maxlength: 200, value: f.name, required: true });
    const category = select('e-category', FILE_CATEGORY, f.category);
    const date = h('input', { type: 'date', id: 'e-date', value: f.date || '' });
    const note = h('textarea', { id: 'e-note', rows: 3, value: f.note });
    const tags = h('input', { type: 'text', id: 'e-tags', value: f.tags.join(', '), placeholder: '用逗號分開' });
    const project = projectSelect('e-project', f.projectId || '');
    const err = h('div', { class: 'form-error' });
    const submit = h('button', { class: 'btn primary', type: 'submit', text: '儲存變更' });
    const form = h('form', { class: 'form' }, field('檔名', name), h('div', { class: 'row' }, field('分類', category), field('日期（檔案完成的日子）', date)), field('專案', project), field('標籤', tags), field('說明', note), err,
      h('div', { class: 'actions' }, submit, h('button', { class: 'btn', type: 'button', text: '取消', onclick: () => sh.close() })));
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); submit.disabled = true; err.textContent = '';
      try {
        const saved = await api('PATCH', '/files/' + f.id, { name: name.value.trim() || f.name, category: category.value, date: date.value, note: note.value.trim(), tags: parseTags(tags.value), projectId: project.value });
        if (project.value !== (f.projectId || '')) loadProjects();
        replaceItem(state.files, saved);
        toast('已儲存'); sh.close(); if (parentSheet) parentSheet.close();
        if (onSaved) onSaved(saved); else repaint();
      } catch (ex) { err.textContent = ex.message; submit.disabled = false; }
    });
    sh.body.appendChild(form);
  }

  // opts.projectId：從專案頁上傳時預選專案；opts.afterSave：傳完要做的事
  function openFileForm(opts) {
    opts = opts || {};
    const sh = openSheet('上傳檔案', { wide: true });
    const picker = filePicker();
    const projectSel = projectSelect('u-project', opts.projectId || '');
    const category = select('u-category', FILE_CATEGORY, '', '自動判斷');
    const date = h('input', { type: 'date', id: 'u-date', value: today() });
    const note = h('textarea', { id: 'u-note', rows: 3, placeholder: '這是什麼、給誰用' });
    const tags = h('input', { type: 'text', id: 'u-tags', placeholder: '用逗號分開' });
    const recordSel = h('select', { id: 'u-record' }, h('option', { value: '', text: '（不連結）' }));
    const fillRecords = () => { for (const r of state.records.items.slice(0, 60)) recordSel.appendChild(h('option', { value: r.id, text: fmtDate(r.date) + ' ' + (r.title || '（無標題）') })); };
    if (state.records.loaded) fillRecords();
    else loadRecords(true).then(fillRecords);
    const err = h('div', { class: 'form-error' });
    const submit = h('button', { class: 'btn primary', type: 'submit', text: '開始上傳' });
    const form = h('form', { class: 'form' },
      field('檔案', picker.el),
      h('div', { class: 'row' }, field('分類', category), field('日期（檔案完成的日子，不是上傳日）', date)),
      field('標籤', tags),
      field('說明', note),
      h('div', { class: 'row' }, field('屬於哪個專案（選填）', projectSel), field('屬於哪一筆紀錄（選填）', recordSel)),
      err,
      h('div', { class: 'actions' }, submit, h('button', { class: 'btn', type: 'button', text: '取消', onclick: () => sh.close() })));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!picker.count()) { err.textContent = '請先選擇檔案'; return; }
      err.textContent = ''; submit.disabled = true; sh.lock(true);
      try {
        const rid = recordSel.value;
        const ids = await picker.uploadAll((file) => ({ category: category.value || guessCategory(file), date: date.value, note: note.value.trim(), tags: parseTags(tags.value), recordIds: rid ? [rid] : [], projectId: projectSel.value }));
        toast('已上傳 ' + ids.length + ' 個檔案');
        sh.lock(false); sh.close();
        state.files.loaded = true; repaint();
        if (rid) loadRecords(true);
        if (projectSel.value) loadProjects();
        if (opts.afterSave) opts.afterSave();
      } catch (ex) { err.textContent = ex.message; submit.disabled = false; sh.lock(false); }
    });
    sh.body.appendChild(form);
  }

  // ---------- 專案 ----------
  // 專案是紀錄和檔案的上一層：點進一個專案，看它的紀錄時間軸、檔案牆、連結。
  function projectName(id) { const p = state.projects.items.find((x) => x.id === id); return p ? p.name : ''; }
  function sortProjects(items) {
    const rank = (p) => (PROJECT_STATUS.indexOf(p.status) < 0 ? 9 : PROJECT_STATUS.indexOf(p.status));
    return items.slice().sort((a, b) => rank(a) - rank(b) || (b.lastDate || '').localeCompare(a.lastDate || '') || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }
  let projectsPromise = null;
  function loadProjects() {
    const s = state.projects;
    if (s.loading && projectsPromise) return projectsPromise;
    s.loading = true; s.seq++;
    const seq = s.seq;
    projectsPromise = (async () => {
      try {
        const r = await api('GET', '/projects');
        if (seq !== s.seq) return;
        s.items = sortProjects(r.items || []); s.loaded = true;
        autoCovers();   // 還沒封面的專案在背景補
      } catch (e) {
        if (seq === s.seq) { s.loaded = true; toast(e.message, 'err'); }
      } finally {
        if (seq === s.seq) { s.loading = false; repaint(); }
      }
    })();
    return projectsPromise;
  }
  // 專案下拉：第一個選項是「不屬於專案」；專案清單還沒載入就先載
  function projectSelect(id, value) {
    const sel = h('select', { id }, h('option', { value: '', text: '（不屬於專案）' }));
    const fill = () => {
      for (const p of state.projects.items) sel.appendChild(h('option', { value: p.id, text: p.name + (p.status && p.status !== '進行中' ? '（' + p.status + '）' : '') }));
      sel.value = value || '';
    };
    if (state.projects.loaded) fill(); else loadProjects().then(fill);
    return sel;
  }
  // 封面怎麼挑（專案清單、專案頁、後端 lib/jilugui.ts 的 pickCover 都是同一套規則）：
  // 1. 手動指定的永遠優先——專案表單上傳一張，或在專案頁的檔案下按「設為封面」
  // 2. 沒指定就從這個專案的檔案裡挑：分類是「照片」「圖面」的先，其次 PDF 第一頁／影片第一格；同類裡日期最新的
  // 3. 一張有縮圖的都沒有（例如只有 Word 檔）就不放圖，顯示專案名稱第一個字
  function coverOrder(a, b) {
    const rank = (f) => (f.category === '照片' || f.category === '圖面') ? 0 : 1;
    const when = (f) => f.date || (f.createdAt || '').slice(0, 10);
    return (rank(a) - rank(b)) || when(b).localeCompare(when(a));
  }
  function pickCover(files) {
    const cands = (files || []).filter((f) => f.thumb).sort(coverOrder);
    return cands.length ? cands[0].thumb : '';
  }
  // 自動補封面：專案清單載好後，還沒封面又有東西的專案在背景一個一個做——讀它的檔案，有縮圖就直接挑；
  // 都沒縮圖就照同樣順序挑最適合的一個先做縮圖（最多試 3 個），存成封面。其他檔案的縮圖等開到再補，不用一次全做。
  let coverBusy = false;
  const coverTried = {};
  async function autoCovers() {
    if (coverBusy || !state.user) return;
    const pick = () => state.projects.items.filter((p) => !p.cover && !coverTried[p.id] && (p.fileCount > 0 || p.recordCount > 0));
    if (!pick().length) return;
    coverBusy = true;
    try {
      let todo;
      while ((todo = pick()).length) {
        const p = todo[0];
        coverTried[p.id] = true;
        try {
          const data = await api('GET', '/projects/' + p.id);
          let cover = data.project.cover || pickCover(data.files);
          if (!cover) {
            const cands = data.files.filter((f) => f.files[0] && !thumbTried[f.id] && ['image', 'pdf', 'video'].indexOf(kindOf(f.files[0].name, '')) >= 0).sort(coverOrder);
            for (const f of cands.slice(0, 3)) {
              thumbTried[f.id] = true;
              try {
                const saved = await api('PATCH', '/files/' + f.id, { thumb: await genThumbFor(f) });
                replaceItem(state.files, saved); cover = saved.thumb; break;
              } catch (e) { console.warn('封面縮圖失敗', f.name, e); }
            }
          }
          if (!cover) continue;
          const saved = data.project.cover ? data.project : await api('PATCH', '/projects/' + p.id, { cover });
          replaceItem(state.projects, saved); state.covers[p.id] = saved.cover || cover;
          if (state.view === 'projects') repaint();
        } catch (e) { console.warn('自動封面失敗', p.name, e); }
      }
    } finally { coverBusy = false; }
  }
  // 專案卡片的封面：開過專案頁就記住挑出來的那張；沒開過就從已載入的檔案裡找屬於它的
  function coverFor(p) {
    if (p.cover) return p.cover;
    if (state.covers[p.id]) return state.covers[p.id];
    const belongs = (f) => f.projectId === p.id || (f.recordIds || []).some((rid) => {
      const r = state.records.items.find((x) => x.id === rid) || state.active.items.find((x) => x.id === rid);
      return !!r && r.projectId === p.id;
    });
    return pickCover(state.files.items.filter(belongs));
  }
  // 專案頁就是首頁：問候、專案卡片，下面接「沒掛專案的進行中事項」
  function projectsView() {
    const s = state.projects;
    const wrap = h('div', { class: 'view' });
    wrap.appendChild(h('div', { class: 'greet' }, h('h1', { class: 'page-title', text: greeting() }), h('p', { class: 'muted', text: todayLabel() })));
    wrap.appendChild(h('div', { class: 'section-head' }, h('h2', { text: '專案' }),
      h('button', { class: 'btn small primary', type: 'button', text: '＋ 新增專案', onclick: () => openProjectForm(null) })));
    const search = h('input', { type: 'search', class: 'search', id: 'search-projects', placeholder: '搜尋專案名稱、說明', value: s.q, 'aria-label': '搜尋專案',
      oninput: debounce((e) => { s.q = e.target.value.trim(); paint(); }, 200) });
    const chips = h('div', { class: 'chips scroll' }, [''].concat(PROJECT_STATUS).map((st) => h('button', { type: 'button', class: 'chip' + (s.filter === st ? ' active' : ''), 'data-v': st, text: st || '全部',
      onclick: () => { s.filter = st; chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.v === st)); paint(); } })));
    const gridEl = h('div', { class: 'pgrid' });
    wrap.appendChild(search); wrap.appendChild(chips); wrap.appendChild(gridEl);
    const boardEl = h('div', { class: 'board' });
    const boardSec = h('section', { class: 'section', hidden: true }, h('div', { class: 'section-head' }, h('h2', { text: '其他進行中的事（沒掛專案）' })), boardEl);
    wrap.appendChild(boardSec);
    const paint = () => {
      if (state.view !== 'projects') return;
      paintBoard(boardEl, boardSec);
      if (!s.loaded && s.loading) { gridEl.replaceChildren(h('div', { class: 'muted', text: '載入中…' })); return; }
      const q = s.q.toLowerCase();
      const items = s.items.filter((p) => (!s.filter || p.status === s.filter) && (!q || (p.name + ' ' + p.note + ' ' + p.category).toLowerCase().indexOf(q) >= 0));
      if (!items.length) { gridEl.replaceChildren(h('div', { class: 'empty', text: s.loaded ? (s.items.length ? '沒有符合的專案。' : '還沒有專案。按「＋ 新增專案」建立第一個。') : '' })); return; }
      gridEl.replaceChildren.apply(gridEl, items.map(projectCard));
    };
    state.painter = paint; paint();
    loadProjects();
    loadActive();                               // 卡片上「進行中 n」和最近一筆靠它；每次回來都重抓
    ensureLoaded(state.files, loadFiles);       // 封面縮圖要靠檔案
    ensureLoaded(state.records, loadRecords);
    return wrap;
  }
  // 專案最近的一筆紀錄：從已載入的紀錄（進行中清單＋最近的紀錄）裡挑日期最新的
  function latestOf(p) {
    let best = null;
    const seen = {};
    for (const r of state.active.items.concat(state.records.items)) {
      if (r.projectId !== p.id || seen[r.id]) continue;
      seen[r.id] = true;
      const d = r.date || '', bd = best ? (best.date || '') : '';
      if (!best || d > bd || (d === bd && (r.createdAt || '') > (best.createdAt || ''))) best = r;
    }
    return best;
  }
  function projectCard(p) {
    const cover = coverFor(p);
    const latest = latestOf(p);
    const doing = state.active.items.filter((r) => r.projectId === p.id && r.status === '進行中').length;
    const waiting = state.active.items.filter((r) => r.projectId === p.id && r.status === '待追蹤').length;
    return h('article', { class: 'pcard', tabindex: 0, role: 'button', onclick: () => openProject(p), onkeydown: (e) => { if (e.key === 'Enter') openProject(p); } },
      h('div', { class: 'pcover' }, cover ? h('img', { src: cover, alt: '', loading: 'lazy' }) : h('span', { class: 'pinitial', text: (p.name || '?').slice(0, 1) })),
      h('div', { class: 'pbody' },
        h('div', { class: 'chips' }, p.status ? chip(p.status, STATUS_CLASS[p.status] || 'gray') : null, doing ? chip('進行中 ' + doing, 'blue') : null, waiting ? chip('待追蹤 ' + waiting, 'yellow') : null, p.category ? chip(p.category) : null),
        h('div', { class: 'ptitle', text: p.name || '（未命名）' }),
        latest
          ? h('div', { class: 'platest' }, h('span', { class: 'mono small muted', text: fmtDate(latest.date) + '  ' }), latest.title || '（無標題）')
          : (p.note ? h('div', { class: 'pnote', text: firstLine(p.note, 70) }) : null),
        h('div', { class: 'pmeta', text: ['紀錄 ' + p.recordCount, '檔案 ' + p.fileCount, p.lastDate ? '最近 ' + fmtDate(p.lastDate) : ''].filter(Boolean).join(' · ') })),
      state.edit ? h('div', { class: 'tools' },
        h('button', { class: 'btn small', type: 'button', text: '改', title: '改名稱、說明、狀態、封面', onclick: stopThen(() => openProjectForm(p, null)) }),
        state.user.role === 'admin' ? h('button', { class: 'btn small danger', type: 'button', text: '整個刪除', title: '連同這個專案底下的紀錄和檔案一起刪掉', onclick: stopThen(() => deleteProjectDeep(p, null)) }) : null) : null);
  }
  // 整個專案連同內容一起刪：先抓專案頁的清單，逐一刪檔案、紀錄，最後刪專案本身。
  // 這是「只留自己做的東西」用的：不要的專案一次清乾淨，不會留下沒掛專案的孤兒紀錄和檔案。
  async function deleteProjectDeep(p, sheet, btn) {
    let data;
    try { data = await api('GET', '/projects/' + p.id); } catch (e) { toast(e.message, 'err'); return; }
    const nf = data.files.length, nr = data.records.length;
    if (!confirm('整個刪除「' + p.name + '」？會一併刪掉它的 ' + nr + ' 筆紀錄和 ' + nf + ' 個檔案，刪掉就找不回來了。')) return;
    const total = nf + nr + 1; let n = 0;
    const tick = () => { n++; if (btn) btn.textContent = '刪除中 ' + n + '/' + total; };
    if (btn) btn.disabled = true;
    try {
      for (const f of data.files) { await api('DELETE', '/files/' + f.id); tick(); }
      for (const r of data.records) { await api('DELETE', '/records/' + r.id); tick(); }
      await api('DELETE', '/projects/' + p.id); tick();
    } catch (e) {
      toast('刪到一半出錯：' + e.message + '。已刪掉的不會復原，再按一次可以繼續刪。', 'err');
      if (btn) { btn.disabled = false; btn.textContent = '連同紀錄與檔案一起刪除'; }
      loadProjects(); return;
    }
    state.projects.items = state.projects.items.filter((x) => x.id !== p.id);
    const gone = {}; data.files.forEach((f) => { gone[f.id] = true; }); data.records.forEach((r) => { gone[r.id] = true; });
    state.files.items = state.files.items.filter((x) => !gone[x.id]);
    state.records.items = state.records.items.filter((x) => !gone[x.id]);
    state.active.items = state.active.items.filter((x) => !gone[x.id]);
    toast('已刪除「' + p.name + '」和它的 ' + nr + ' 筆紀錄、' + nf + ' 個檔案');
    if (sheet) sheet.close();
    repaint();
  }
  async function openProject(p) {
    const sh = openSheet(p.name || '專案', { wide: true });
    const b = sh.body;
    b.appendChild(h('div', { class: 'chips' }, p.status ? chip(p.status, STATUS_CLASS[p.status] || 'gray') : null, p.category ? chip(p.category) : null, p.code ? h('span', { class: 'meta', text: p.code }) : null));
    if (p.note) b.appendChild(richText(p.note, 'note'));
    const refresh = () => { sh.close(); openProject(p); };
    const actions = h('div', { class: 'actions' },
      h('button', { class: 'btn primary', type: 'button', text: '＋ 新增紀錄', onclick: () => openRecordForm(null, null, { projectId: p.id, afterSave: refresh }) }),
      h('button', { class: 'btn', type: 'button', text: '上傳檔案', onclick: () => openFileForm({ projectId: p.id, afterSave: refresh }) }),
      h('button', { class: 'btn', type: 'button', text: '編輯專案', onclick: () => openProjectForm(p, sh) }),
      state.user.role === 'admin' ? h('button', { class: 'btn danger', type: 'button', text: '刪除', title: '只刪專案這一層，底下的紀錄和檔案留著', onclick: () => confirmBox(actions, '刪除這個專案？底下的紀錄和檔案都會留著，只是不再掛在這個專案上。', async () => {
        await api('DELETE', '/projects/' + p.id);
        state.projects.items = state.projects.items.filter((x) => x.id !== p.id);
        toast('已刪除專案'); sh.close(); repaint();
      }) }) : null,
      state.user.role === 'admin' && state.edit ? h('button', { class: 'btn danger', type: 'button', text: '連同紀錄與檔案一起刪除', onclick: (e) => deleteProjectDeep(p, sh, e.target) }) : null);
    b.appendChild(actions);
    const linksHead = h('h3', { class: 'sub', text: '連結' });
    const linksEl = h('div', { class: 'linklist' });
    const recHead = h('h3', { class: 'sub', text: '紀錄' });
    const recsEl = h('div', { class: 'list' });
    const fileHead = h('h3', { class: 'sub', text: '檔案' });
    const filesEl = h('div', { class: 'grid small' });
    b.appendChild(linksHead); b.appendChild(linksEl); b.appendChild(recHead); b.appendChild(recsEl); b.appendChild(fileHead); b.appendChild(filesEl);
    recsEl.appendChild(h('div', { class: 'muted', text: '載入中…' }));
    let data;
    try { data = await api('GET', '/projects/' + p.id); }
    catch (e) { recsEl.replaceChildren(h('div', { class: 'muted', text: e.message })); return; }
    // 連結：專案自己的，加上每一筆紀錄填的連結
    const links = [];
    if (data.project.link) links.push({ url: data.project.link, label: '專案連結' });
    for (const r of data.records) if (r.link) links.push({ url: r.link, label: r.title || '（無標題）' });
    linksEl.replaceChildren.apply(linksEl, links.length
      ? links.map((l) => h('a', { class: 'filelink', href: l.url, target: '_blank', rel: 'noopener' }, h('span', { text: '↗ ' + l.label }), h('div', { class: 'link-url', text: l.url })))
      : [h('div', { class: 'muted', text: '沒有連結' })]);
    // 紀錄清單：編輯模式改完或刪掉，更新專案頁手上這份清單
    const recHooks = {
      onChanged: (saved) => { const i = data.records.findIndex((x) => x.id === saved.id); if (i >= 0) data.records[i] = saved; replaceItem(state.records, saved); paintRecs(); repaint(); },
      onDeleted: (id) => { data.records = data.records.filter((x) => x.id !== id); paintRecs(); repaint(); },
    };
    const paintRecs = () => {
      recHead.textContent = '紀錄（' + data.records.length + '）';
      recsEl.replaceChildren.apply(recsEl, data.records.length ? data.records.map((r) => recordCard(r, recHooks)) : [h('div', { class: 'muted', text: '還沒有紀錄，按上面「＋ 新增紀錄」' })]);
    };
    paintRecs();
    // 編輯模式的多選列（勾選檔案一次刪）
    const ed = selection(() => data.files, {
      repaint: () => paintFiles(),
      onDeleted: (ids) => { data.files = data.files.filter((f) => ids.indexOf(f.id) < 0); paintFiles(); repaint(); },
      onChanged: (saved) => { const i = data.files.findIndex((x) => x.id === saved.id); if (i >= 0) data.files[i] = saved; paintFiles(); repaint(); },
    });
    b.insertBefore(ed.bar, filesEl);
    // 檔案牆：每個有縮圖的檔案下面有「設為封面」
    const paintFiles = () => {
      fileHead.textContent = '檔案（' + data.files.length + '）';
      ed.onSel();
      filesEl.replaceChildren.apply(filesEl, data.files.length ? data.files.map((f) => h('div', { class: 'tilewrap' }, fileTile(f, ed),
        f.thumb ? h('button', { class: 'linkbtn', type: 'button', text: data.project.cover === f.thumb ? '✓ 目前封面' : '設為封面', onclick: async () => {
          try {
            const saved = await api('PATCH', '/projects/' + p.id, { cover: f.thumb });
            data.project = saved; p.cover = saved.cover; replaceItem(state.projects, saved);
            toast('已設為封面'); paintFiles(); repaint();
          } catch (ex) { toast(ex.message, 'err'); }
        } }) : null)) : [h('div', { class: 'muted', text: '還沒有檔案' })]);
    };
    paintFiles();
    replaceItem(state.projects, data.project);   // 筆數、封面可能變了
    p.cover = data.project.cover;
    state.covers[p.id] = data.project.cover || pickCover(data.files);
    // 沒縮圖的檔案在背景補；補完重畫檔案牆，專案還沒封面就順手設一張
    autoThumbs(data.files).then(async () => {
      paintFiles();
      if (!data.project.cover) {
        const cov = pickCover(data.files);
        if (cov) {
          state.covers[p.id] = cov;
          try { const saved = await api('PATCH', '/projects/' + p.id, { cover: cov }); data.project = saved; p.cover = saved.cover; replaceItem(state.projects, saved); paintFiles(); repaint(); } catch (e) { /* 下次再試 */ }
        }
      }
    });
  }
  function openProjectForm(existing, parentSheet) {
    const sh = openSheet(existing ? '編輯專案' : '新增專案');
    const name = h('input', { type: 'text', id: 'p-name', maxlength: 200, placeholder: '例如：台中建設公司大廳案、官網改版', value: existing ? existing.name : '', required: true });
    const status = select('p-status', PROJECT_STATUS, existing ? existing.status : '進行中');
    const category = select('p-category', CATEGORY, existing ? existing.category : '');
    const note = h('textarea', { id: 'p-note', rows: 3, placeholder: '這個專案在做什麼、目標、注意事項', value: existing ? existing.note : '' });
    const link = h('input', { type: 'url', id: 'p-link', placeholder: 'https://…（專案的網站或主要頁面，選填）', value: existing ? (existing.link || '') : '' });
    const err = h('div', { class: 'form-error' });
    // 封面：可以自己上傳一張（會縮成小圖再傳）；沒設就自動用專案裡第一張有縮圖的檔案
    const coverUrl = { v: existing ? (existing.cover || '') : '' };
    const coverPrev = h('div', { class: 'cover-pick' });
    const coverInput = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', id: 'p-cover-' + Math.random().toString(36).slice(2, 8) });
    const paintCover = () => coverPrev.replaceChildren(
      coverUrl.v ? h('img', { src: coverUrl.v, alt: '' }) : h('span', { class: 'muted small', text: '還沒有封面。沒設的話會自動從專案的檔案裡挑：照片、圖面優先，其次 PDF 第一頁或影片第一格，同類裡取日期最新的。也可以在這裡上傳一張，或在專案頁的檔案下按「設為封面」。' }),
      h('div', { class: 'actions' },
        h('label', { class: 'btn small', for: coverInput.id, text: coverUrl.v ? '換一張' : '上傳封面圖片' }),
        coverUrl.v ? h('button', { class: 'btn small', type: 'button', text: '清除', onclick: () => { coverUrl.v = ''; paintCover(); } }) : null,
        coverInput));
    coverInput.addEventListener('change', async (e) => {
      const file = e.target.files[0]; e.target.value = '';
      if (!file) return;
      err.textContent = '封面上傳中…';
      try {
        const j = await makeThumb(file, file.name, file.type);
        if (!j) throw new Error('這個格式不能當封面，請用 JPG 或 PNG');
        coverUrl.v = await uploadThumb(j, file.name); err.textContent = ''; paintCover();
      } catch (ex) { err.textContent = '封面上傳失敗：' + ex.message; }
    });
    paintCover();
    const submit = h('button', { class: 'btn primary', type: 'submit', text: existing ? '儲存變更' : '建立專案' });
    const form = h('form', { class: 'form' }, field('專案名稱', name), h('div', { class: 'row' }, field('狀態', status), field('分類', category)), field('說明', note), field('連結', link), field('封面圖片', coverPrev), err,
      h('div', { class: 'actions' }, submit, h('button', { class: 'btn', type: 'button', text: '取消', onclick: () => sh.close() })));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!name.value.trim()) { err.textContent = '請填「專案名稱」'; name.focus(); return; }
      err.textContent = ''; submit.disabled = true;
      try {
        const data = { name: name.value.trim(), status: status.value, category: category.value, note: note.value.trim(), link: link.value.trim(), cover: coverUrl.v };
        const saved = existing ? await api('PATCH', '/projects/' + existing.id, data) : await api('POST', '/projects', data);
        replaceItem(state.projects, saved); state.projects.items = sortProjects(state.projects.items); state.projects.loaded = true;
        toast(existing ? '已儲存' : '已建立專案');
        sh.close(); if (parentSheet) parentSheet.close();
        repaint();
        openProject(saved);
      } catch (ex) { err.textContent = ex.message; submit.disabled = false; }
    });
    sh.body.appendChild(form);
    setTimeout(() => name.focus(), 60);
  }

  // ---------- 問紀錄櫃（右下角小視窗）----------
  const EXAMPLES = ['2025 新版型錄在哪？', '日本採訪的逐字稿', '最近上傳的圖面', '阿緯做的打樣'];
  function assistantPanel() {
    const c = state.chat;
    const panel = h('section', { class: 'assistant-panel', id: 'assistant-panel', role: 'dialog', 'aria-label': '問紀錄櫃', hidden: !c.open });
    const list = h('div', { class: 'assistant-body', id: 'chat-list' });
    const input = h('input', { type: 'text', id: 'chat-input', class: 'chat-text', placeholder: state.ai ? '問我檔案在哪，例如：台中案的報價單' : '輸入關鍵字，例如：報價單 台中', autocomplete: 'off', maxlength: 500 });
    const send = h('button', { class: 'btn primary', type: 'submit', text: '送出' });
    const form = h('form', { class: 'assistant-input', onsubmit: (e) => { e.preventDefault(); const t = input.value.trim(); if (!t || c.busy) return; input.value = ''; sendQuestion(t); } }, input, send);
    const clearBtn = h('button', { class: 'iconbtn light', type: 'button', 'aria-label': '清除對話', title: '清除對話', text: '清除', onclick: () => { c.messages = []; paint(); } });
    panel.appendChild(h('div', { class: 'assistant-head' },
      h('div', { class: 'assistant-title' }, h('strong', { text: '問紀錄櫃' }), h('span', { class: 'assistant-mode', text: state.ai ? 'AI' : '關鍵字' })),
      h('div', { class: 'assistant-tools' }, clearBtn, h('button', { class: 'iconbtn light', type: 'button', 'aria-label': '關閉', html: ICONS.close, onclick: toggleAssistant }))));
    panel.appendChild(list); panel.appendChild(form);
    const paint = () => {
      panel.hidden = !c.open;
      const fab = document.querySelector('.fab.assistant');
      if (fab) fab.classList.toggle('active', c.open);
      if (!c.open) return;
      const nodes = [];
      if (!c.messages.length) {
        nodes.push(h('div', { class: 'chat-intro' },
          h('div', { text: state.ai ? '用平常講話的方式問，我會到檔案庫和工作紀錄裡找，找到的檔案可以直接開啟或下載。' : '目前是關鍵字模式：會用關鍵字搜尋檔名、說明和相關紀錄。' }),
          h('div', { text: '可以這樣問：' }),
          h('div', { class: 'chips' }, EXAMPLES.map((ex) => h('button', { type: 'button', class: 'chip', text: ex, onclick: () => sendQuestion(ex) })))));
      }
      for (const msg of c.messages) nodes.push(messageEl(msg));
      if (c.busy) nodes.push(h('div', { class: 'msg model' }, h('div', { class: 'bubble muted', text: state.ai ? 'AI 查詢中…' : '搜尋中…' })));
      list.replaceChildren.apply(list, nodes);
      clearBtn.hidden = !c.messages.length;
      send.disabled = c.busy;
      requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
    };
    state.chatPainter = paint;
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleAssistant(); });
    paint();
    return panel;
  }
  function toggleAssistant() {
    const c = state.chat;
    c.open = !c.open;
    if (state.chatPainter) state.chatPainter();
    if (c.open) setTimeout(() => { const i = document.getElementById('chat-input'); if (i) i.focus(); }, 60);
  }
  function messageEl(msg) {
    if (msg.role === 'user') return h('div', { class: 'msg user' }, h('div', { class: 'bubble', text: msg.text }));
    const b = h('div', { class: 'bubble' + (msg.error ? ' err' : '') }, linkified(msg.text, 'msg-text', 'div'));
    if (msg.opened) b.appendChild(h('div', { class: 'opened-note', text: '已自動打開「' + msg.opened + '」，其他候選在下面。' }));
    if (msg.files && msg.files.length) b.appendChild(h('div', { class: 'filerows' }, msg.files.map(fileRow)));
    if (msg.records && msg.records.length) b.appendChild(h('div', { class: 'linklist' }, msg.records.map((r) => h('button', { class: 'reclink', type: 'button', onclick: () => openRecord(r) }, h('span', { class: 'mono small muted', text: fmtDate(r.date) + '  ' }), r.title || '（無標題）'))));
    return h('div', { class: 'msg model' }, b);
  }
  function fileRow(f) {
    const first = f.files[0];
    return h('div', { class: 'filerow' },
      thumbFor(f, false),
      h('div', { class: 'filerow-body' },
        h('div', { class: 'tile-name', text: f.name }),
        h('div', { class: 'tile-meta', text: [f.category, fileDate(f), f.by].filter(Boolean).join(' · ') }),
        h('div', { class: 'actions' },
          first ? h('a', { class: 'btn small', href: fileUrl(f.id, first.index), target: '_blank', rel: 'noopener', text: '開啟' }) : null,
          first ? h('a', { class: 'btn small', href: fileUrl(f.id, first.index, true), text: '下載' }) : null,
          h('button', { class: 'btn small', type: 'button', text: '詳細', onclick: () => openFile(f) }))));
  }
  async function sendQuestion(text) {
    const c = state.chat;
    const paint = () => { if (state.chatPainter) state.chatPainter(); };
    c.messages.push({ role: 'user', text });
    c.busy = true; paint();
    try {
      const history = c.messages.slice(0, -1).slice(-8).map((m) => ({ role: m.role, text: m.text }));
      const r = await api('POST', '/ask', { question: text, history });
      const files = r.files || [];
      const records = r.records || [];
      const msg = { role: 'model', text: r.answer || '', files, records };
      // 找到就直接打開最相關的那一個，不用再點
      if (files.length) { msg.opened = files[0].name; setTimeout(() => openFile(files[0]), 150); }
      else if (records.length) { msg.opened = records[0].title; setTimeout(() => openRecord(records[0]), 150); }
      c.messages.push(msg);
    } catch (e) {
      c.messages.push({ role: 'model', text: e.message, error: true });
    }
    c.busy = false; paint();
  }

  // ---------- 上傳 ----------
  function filePicker() {
    const chosen = [];
    const uid = Math.random().toString(36).slice(2, 8);
    const listEl = h('div', { class: 'picked' });
    const input = h('input', { type: 'file', multiple: true, id: 'fp-' + uid, class: 'visually-hidden' });
    const camera = h('input', { type: 'file', accept: 'image/*', capture: 'environment', id: 'fc-' + uid, class: 'visually-hidden' });
    const onPick = (e) => {
      for (const file of e.target.files) {
        const why = unsupportedReason(file);
        chosen.push({ file, progress: 0, status: why ? 'error' : 'wait', reason: why });
      }
      e.target.value = ''; paint();
    };
    input.addEventListener('change', onPick); camera.addEventListener('change', onPick);
    const el = h('div', { class: 'picker' },
      h('div', { class: 'picker-btns' }, h('label', { class: 'btn', for: input.id, text: '選擇檔案' }), h('label', { class: 'btn', for: camera.id, text: '拍照' }), input, camera),
      h('div', { class: 'hint', text: '什麼格式都可以放（圖片、影片、PDF、Office、XMind、DWG、壓縮檔…）。檔案存在公司的雲端空間，Notion 檔案庫裡也看得到連結；大檔會自動分段上傳。' }), listEl);
    function paint() {
      listEl.replaceChildren.apply(listEl, chosen.map((c, i) => h('div', { class: 'picked-item' + (c.status === 'error' ? ' error' : '') },
        h('div', { class: 'picked-name', text: c.file.name + (c.reason ? '：' + c.reason : '') }),
        h('div', { class: 'picked-meta', text: c.status === 'error' ? (c.reason ? '不能上傳' : '失敗') : c.status === 'done' ? '完成' : c.status === 'thumb' ? '產生縮圖…' : c.status === 'up' ? Math.round(c.progress * 100) + '%' : fmtBytes(c.file.size) }),
        c.status === 'wait' || c.reason ? h('button', { type: 'button', class: 'iconbtn', 'aria-label': '移除', html: ICONS.close, onclick: () => { chosen.splice(i, 1); paint(); } }) : h('span'),
        c.status === 'up' ? h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: 'width:' + Math.round(c.progress * 100) + '%' })) : null)));
    }
    async function uploadAll(metaFor) {
      const blocked = chosen.find((c) => c.reason);
      if (blocked) throw new Error('「' + blocked.file.name + '」' + blocked.reason + '，請先把它移除。');
      const ids = [];
      for (const c of chosen) {
        if (c.status === 'done') { ids.push(c.entryId); continue; }
        c.status = 'up'; c.progress = 0; paint();
        try {
          const up = await uploadFile(c.file, (p) => { c.progress = p; paint(); });
          c.status = 'thumb'; paint();
          const thumb = await tryThumb(c.file, c.file.name, c.file.type);
          const meta = metaFor ? metaFor(c.file) : {};
          const entry = await api('POST', '/files', Object.assign({ name: c.file.name, uploads: [up], thumb }, meta));
          c.status = 'done'; c.entryId = entry.id; ids.push(entry.id);
          state.files.items.unshift(entry);
        } catch (e) {
          c.status = 'error'; paint();
          throw new Error('「' + c.file.name + '」上傳失敗：' + e.message);
        }
        paint();
      }
      return ids;
    }
    return { el, uploadAll, count: () => chosen.length };
  }
  // 檔案從瀏覽器「直接」送到 Vercel Blob，不經過我們的伺服器——伺服器函式一次只能收 4.5MB，影片一定塞不下。
  // Blob 的瀏覽器端程式從 CDN 載入（這個 App 沒有打包工具）；第一個載不到就換第二個。
  let blobClient = null;
  async function loadBlobClient() {
    if (blobClient) return blobClient;
    const urls = ['https://esm.sh/@vercel/blob@2.8.0/client', 'https://cdn.jsdelivr.net/npm/@vercel/blob@2.8.0/client/+esm'];
    let lastErr = null;
    for (const u of urls) {
      try { const m = await import(u); if (m && typeof m.upload === 'function') { blobClient = m; return m; } }
      catch (e) { lastErr = e; }
    }
    throw new Error('上傳元件載入失敗，請檢查網路後再試一次' + (lastErr ? '（' + lastErr.message + '）' : ''));
  }
  // Blob 上的路徑：jilugui/日期/時間戳-原檔名。原檔名留著，在 Vercel 後台也認得出是哪個檔；伺服器還會再加一段亂碼避免同名互蓋。
  function blobPath(name) {
    const safe = String(name || 'file').replace(/[\\/:*?"<>|#%&+]/g, '_').replace(/\s+/g, ' ').trim().slice(-120) || 'file';
    return 'jilugui/' + today().replace(/-/g, '') + '/' + Date.now().toString(36) + '-' + safe;
  }
  async function uploadFile(file, onProgress) {
    const type = file.type || guessType(file.name) || 'application/octet-stream';
    const client = await loadBlobClient();
    const blob = await client.upload(blobPath(file.name), file, {
      access: 'public',
      handleUploadUrl: API + '/upload',
      multipart: file.size > 8 * 1024 * 1024,   // 大檔分段傳，斷了只重傳那一段
      contentType: type,
      onUploadProgress: (p) => onProgress(Math.min(1, ((p && p.percentage) || 0) / 100)),
    });
    onProgress(1);
    return { url: blob.url, name: file.name, size: file.size, type };
  }

  // ---------- 縮圖 ----------
  // 上傳時在瀏覽器裡產生一張小圖（最長邊 480px 的 JPEG）：PDF 取第一頁、影片抓約第 1 秒的畫面、照片縮小。
  // 其他格式（Office、XMind、DWG…）瀏覽器畫不出來，就維持顯示副檔名。
  const THUMB_MAX = 480;
  let pdfjsLib = null;
  async function loadPdfJs() {
    if (pdfjsLib) return pdfjsLib;
    const base = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/';
    const m = await import(base + 'pdf.min.mjs');
    m.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs';
    pdfjsLib = m;
    return m;
  }
  function fitCanvas(w, h) {
    const scale = Math.min(1, THUMB_MAX / Math.max(w || 1, h || 1));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round((w || 1) * scale)); c.height = Math.max(1, Math.round((h || 1) * scale));
    return c;
  }
  function canvasToJpeg(c) { return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/jpeg', 0.82)); }
  async function thumbFromImage(blob) {
    const bmp = await createImageBitmap(blob);
    const c = fitCanvas(bmp.width, bmp.height);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    return canvasToJpeg(c);
  }
  async function thumbFromPdf(blob) {
    const pdfjs = await loadPdfJs();
    const doc = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise;
    const page = await doc.getPage(1);
    const v1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: Math.min(2, THUMB_MAX / Math.max(v1.width, v1.height)) });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    if (doc.destroy) doc.destroy();
    return canvasToJpeg(c);
  }
  function thumbFromVideo(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
      let settled = false;
      const finish = (b) => { if (settled) return; settled = true; URL.revokeObjectURL(url); resolve(b); };
      const giveUp = (e) => { if (settled) return; settled = true; URL.revokeObjectURL(url); reject(e || new Error('影片無法解碼')); };
      const timer = setTimeout(() => giveUp(new Error('影片讀取逾時')), 20000);
      v.addEventListener('loadeddata', () => { try { v.currentTime = Math.min(1, (v.duration || 2) / 2); } catch (e) { clearTimeout(timer); giveUp(e); } });
      v.addEventListener('seeked', async () => {
        clearTimeout(timer);
        try {
          const c = fitCanvas(v.videoWidth || 320, v.videoHeight || 240);
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          finish(await canvasToJpeg(c));
        } catch (e) { giveUp(e); }
      });
      v.addEventListener('error', () => { clearTimeout(timer); giveUp(v.error); });
    });
  }
  async function makeThumb(blob, name, type) {
    const kind = kindOf(name, type || blob.type);
    const e = extOf(name).toLowerCase();
    if (kind === 'image' && e !== 'heic' && e !== 'svg') return thumbFromImage(blob);
    if (kind === 'pdf') return thumbFromPdf(blob);
    if (kind === 'video') return thumbFromVideo(blob);
    return null;
  }
  async function uploadThumb(jpeg, name) {
    const client = await loadBlobClient();
    const base = String(name || 'file').replace(/\.[^.]+$/, '');
    const path = blobPath(base + '.jpg').replace('jilugui/', 'jilugui/thumbs/');
    const blob = await client.upload(path, jpeg, { access: 'public', handleUploadUrl: API + '/upload', contentType: 'image/jpeg' });
    return blob.url;
  }
  // 產生縮圖失敗不影響上傳，只是那個檔案格會顯示副檔名
  async function tryThumb(blob, name, type) {
    try { const j = await makeThumb(blob, name, type); return j ? await uploadThumb(j, name) : ''; }
    catch (e) { console.warn('縮圖失敗', name, e); return ''; }
  }
  // 幫一個「已經在庫裡」的檔案做縮圖：先把檔案抓下來（Notion 的經 ?raw=1 同網域轉一手），做好傳上去，回傳縮圖網址
  async function genThumbFor(f) {
    const first = f.files[0];
    const src = first.url ? first.url : fileUrl(f.id, first.index) + '?raw=1';
    const res = await fetch(src, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('下載失敗（' + res.status + '）');
    const blob = await res.blob();
    const jpeg = await makeThumb(blob, first.name, blob.type);
    if (!jpeg) throw new Error('格式不支援');
    return uploadThumb(jpeg, first.name);
  }
  // 自動補縮圖：畫面上有還沒縮圖的 PDF／影片／照片，就在背景一個一個做，做好直接換上去，不用按任何鈕。
  // 一輪最多 8 個，做完還有再接著做；失敗的記住不重試（避免一直打）。
  const thumbTried = {};
  let thumbBusy = false;
  async function autoThumbs(list) {
    if (thumbBusy || !list) return;
    const pick = () => list.filter((f) => !f.thumb && f.files[0] && !thumbTried[f.id] && ['image', 'pdf', 'video'].indexOf(kindOf(f.files[0].name, '')) >= 0).slice(0, 8);
    let todo = pick();
    if (!todo.length) return;
    thumbBusy = true;
    try {
      while (todo.length) {
        for (const f of todo) {
          thumbTried[f.id] = true;
          try {
            const saved = await api('PATCH', '/files/' + f.id, { thumb: await genThumbFor(f) });
            replaceItem(state.files, saved);
            const i = list.indexOf(f);
            if (i >= 0) list[i] = saved;
            repaint();
          } catch (e) { console.warn('自動縮圖失敗', f.name, e); }
        }
        todo = pick();
      }
    } finally { thumbBusy = false; }
  }

  // ---------- 面板 ----------
  function openSheet(title, opts) {
    opts = opts || {};
    const body = h('div', { class: 'sheet-body' });
    const titleEl = h('h2', { class: 'sheet-title', text: title });
    const backdrop = h('div', { class: 'backdrop' });
    const sheet = h('div', { class: 'sheet' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'sheet-head' }, titleEl, h('button', { class: 'iconbtn', type: 'button', 'aria-label': '關閉', html: ICONS.close, onclick: () => { if (!opts.locked) close(); } })), body);
    backdrop.appendChild(sheet);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop && !opts.locked) close(); });
    const onKey = (e) => { if (e.key === 'Escape' && !opts.locked) close(); };
    document.addEventListener('keydown', onKey);
    document.body.appendChild(backdrop); document.body.classList.add('no-scroll');
    function close() {
      document.removeEventListener('keydown', onKey); backdrop.remove();
      if (!document.querySelector('.backdrop')) document.body.classList.remove('no-scroll');
    }
    return { body, close, lock: (v) => { opts.locked = !!v; } };
  }
  function confirmBox(container, msg, onYes) {
    const box = h('div', { class: 'confirm' }, h('div', { text: msg }), h('div', { class: 'actions' },
      h('button', { class: 'btn danger', type: 'button', text: '確定刪除', onclick: async (e) => { e.target.disabled = true; try { await onYes(); } catch (ex) { toast(ex.message, 'err'); e.target.disabled = false; } } }),
      h('button', { class: 'btn', type: 'button', text: '取消', onclick: () => box.replaceWith(container) })));
    container.replaceWith(box);
  }
  function openAccount() {
    const sh = openSheet('帳號');
    const cur = h('input', { type: 'password', id: 'pw-current', autocomplete: 'current-password', placeholder: '目前的登入碼', required: true });
    const next = h('input', { type: 'password', id: 'pw-next', autocomplete: 'new-password', placeholder: '新登入碼，至少 6 碼', required: true, minlength: 6, maxlength: 64 });
    const again = h('input', { type: 'password', id: 'pw-again', autocomplete: 'new-password', placeholder: '再輸入一次新登入碼', required: true });
    const err = h('div', { class: 'form-error' });
    const submit = h('button', { class: 'btn primary', type: 'submit', text: '更改登入碼' });
    const form = h('form', { class: 'form' },
      h('p', { class: 'hint', text: '改過的登入碼會以加密形式存放，Notion 裡也看不到原文。忘記時請管理者在成員名單重新設一組。' }),
      field('目前的登入碼', cur), field('新登入碼', next), field('確認新登入碼', again), err,
      h('div', { class: 'actions' }, submit));
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); err.textContent = '';
      if (next.value.trim().length < 6) { err.textContent = '新登入碼至少 6 碼'; next.focus(); return; }
      if (next.value !== again.value) { err.textContent = '兩次輸入的新登入碼不一樣'; again.focus(); return; }
      submit.disabled = true;
      try {
        await api('POST', '/password', { current: cur.value, next: next.value.trim() });
        toast('登入碼已更新，下次請用新的登入');
        sh.close();
      } catch (ex) { err.textContent = ex.message; submit.disabled = false; }
    });
    sh.body.appendChild(h('div', { class: 'meta', text: state.user.name + ' · ' + (state.user.role === 'admin' ? '管理者' : '成員') }));
    sh.body.appendChild(form);
    sh.body.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', text: '登出', onclick: () => { sh.close(); logout(); } })));
  }

  function openAddMenu() {
    const sh = openSheet('新增');
    sh.body.appendChild(h('div', { class: 'menu' },
      h('button', { class: 'menu-item', type: 'button', onclick: () => { sh.close(); openRecordForm(null); } }, h('span', { class: 'menu-icon', html: ICONS.records }), h('span', {}, h('strong', { text: '新增紀錄' }), h('small', { text: '記一件做過的事，可以一起附上檔案' }))),
      h('button', { class: 'menu-item', type: 'button', onclick: () => { sh.close(); openFileForm(); } }, h('span', { class: 'menu-icon', html: ICONS.files }), h('span', {}, h('strong', { text: '上傳檔案' }), h('small', { text: '圖片、影片、PDF、Office 文件，大檔自動分段上傳' })))));
  }

  // ---------- 表單小工具 ----------
  function field(label, control) {
    return h('div', { class: 'field' }, h('label', { class: 'field-label', for: control.id || null, text: label }), control);
  }
  function select(id, options, value, emptyLabel) {
    const s = h('select', { id });
    if (emptyLabel !== undefined) s.appendChild(h('option', { value: '', text: emptyLabel }));
    else if (options.indexOf(value) < 0) s.appendChild(h('option', { value: '', text: '未選' }));
    options.forEach((o) => s.appendChild(h('option', { value: o, text: o })));
    s.value = value || '';
    return s;
  }
  function canDelete(by) { return state.user.role === 'admin' || (!!by && by === state.user.name); }
  function replaceItem(list, item) { const i = list.items.findIndex((x) => x.id === item.id); if (i >= 0) list.items[i] = item; else list.items.unshift(item); }
  async function cachedFile(id) { return state.files.items.find((x) => x.id === id) || api('GET', '/files/' + id).catch(() => null); }
  async function cachedRecord(id) { return state.records.items.find((x) => x.id === id) || api('GET', '/records/' + id).catch(() => null); }

  // ---------- 載入清單 ----------
  function loadRecords(reset) { return loadList(state.records, '/records', reset, (s) => ({ q: s.q, status: s.filter })); }
  // 首頁「進行中的項目」：進行中＋待追蹤一次最多抓 100 筆（不分頁，這份要完整）
  async function loadActive() {
    const s = state.active;
    if (s.loading) return;
    s.loading = true; s.seq++;
    const seq = s.seq;
    repaint();
    try {
      const r = await api('GET', '/records?status=active&limit=100');
      if (seq !== s.seq) return;
      s.items = r.items; s.cursor = null; s.loaded = true;
    } catch (e) {
      if (seq === s.seq) { s.loaded = true; toast(e.message, 'err'); }
    } finally {
      if (seq === s.seq) { s.loading = false; repaint(); }
    }
  }
  function loadFiles(reset) { return loadList(state.files, '/files', reset, (s) => ({ q: s.q, category: s.filter })); }
  async function loadList(s, path, reset, paramsOf) {
    if (reset) { s.items = []; s.cursor = null; s.loaded = false; s.seq++; }
    else if (s.loading || !s.cursor) return;
    const seq = s.seq;
    s.loading = true; repaint();
    try {
      const qs = new URLSearchParams();
      const p = paramsOf(s);
      for (const k in p) if (p[k]) qs.set(k, p[k]);
      if (s.cursor) qs.set('cursor', s.cursor);
      qs.set('limit', String(PAGE));
      const r = await api('GET', path + '?' + qs.toString());
      if (seq !== s.seq) return;
      s.items = s.items.concat(r.items); s.cursor = r.nextCursor; s.loaded = true;
    } catch (e) {
      if (seq === s.seq) { s.loaded = true; toast(e.message, 'err'); }
    } finally {
      if (seq === s.seq) { s.loading = false; repaint(); }
    }
    if (path === '/files' && seq === s.seq) autoThumbs(s.items);   // 載到沒縮圖的檔案就在背景補
  }

  boot();
})();
