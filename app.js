/* ══════════════════════════════════════════════════════════════════════════
   app.js —— 粒子背景 · 分类路由 · 内容块渲染 · 可视化编辑器
   一般不需要改这个文件。要改内容，请改 profile.js 或用页面右下角 ✎ 面板。
   ══════════════════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const STORE_KEY = 'my-homepage-profile-v2';
  /* 数据结构版本：改动 profile.js 的字段结构时 +1，浏览器里的旧草稿会自动失效，
     否则旧草稿会覆盖新结构，让你误以为「改了没生效」。 */
  const SCHEMA = 4;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  let reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* 无头浏览器默认报「减少动效」，截图时用 ?shot=1&motion=on 强制打开动画 */
  try {
    const _q = new URLSearchParams(location.search);
    if (_q.has('shot') && _q.get('motion') === 'on') reduceMotion = false;
  } catch (e) {}

  /* ══ 工具 ══════════════════════════════════════════════════════════ */
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const pad2 = (n) => String(n).padStart(2, '0');

  const initial = (str) => (String(str || '').trim()[0] || 'Y').toUpperCase();

  /* ══ 内容块类型 ════════════════════════════════════════════════════ */
  const BLOCK_KINDS = [
    { type: 'text',     label: '文字',   hint: '小标题 + 一段正文' },
    { type: 'list',     label: '列表',   hint: '每行一条' },
    { type: 'tags',     label: '标签',   hint: '用「、」或逗号分隔' },
    { type: 'stats',    label: '数字',   hint: '每行：数字 | 说明' },
    { type: 'timeline', label: '时间轴', hint: '每行：时间 | 标题 | 描述' },
    { type: 'links',    label: '链接',   hint: '每行：平台 | 链接 | 备注' },
    { type: 'photos',   label: '照片',   hint: '一整个照片网格' },
    { type: 'albums',   label: '相册',   hint: '照片再分相册，可增删相册与照片' }
  ];
  const kindLabel = (t) => (BLOCK_KINDS.find((k) => k.type === t) || {}).label || t;

  /* 文本 ⇄ 结构化数据 */
  function linesToItems(text, kind) {
    const raw = String(text || '');
    const rows = raw.split('\n').map((s) => s.trim()).filter(Boolean);
    const split = (r) => r.split('|').map((s) => (s || '').trim());
    if (kind === 'list') return rows;
    if (kind === 'tags') return raw.split(/[、,，\n]+/).map((s) => s.trim()).filter(Boolean);
    if (kind === 'stats') return rows.map((r) => { const [n, l] = split(r); return { n: n || '', l: l || '' }; });
    if (kind === 'timeline') return rows.map((r) => { const [time, title, desc] = split(r); return { time: time || '', title: title || '', desc: desc || '' }; });
    if (kind === 'links') return rows.map((r) => { const [name, url, note] = split(r); return { name: name || '', url: url || '', note: note || '' }; });
    return [];
  }

  function itemsToLines(items, kind) {
    const list = Array.isArray(items) ? items : [];
    if (kind === 'list') return list.join('\n');
    if (kind === 'tags') return list.join('、');
    if (kind === 'stats') return list.map((x) => [x.n, x.l].join(' | ')).join('\n');
    if (kind === 'timeline') return list.map((x) => [x.time, x.title, x.desc].join(' | ')).join('\n');
    if (kind === 'links') return list.map((x) => [x.name, x.url, x.note].join(' | ')).join('\n');
    return '';
  }

  /* ══ 数据结构规范化 ════════════════════════════════════════════════ */
  function normalizeBlock(b) {
    const type = BLOCK_KINDS.some((k) => k.type === (b && b.type)) ? b.type : 'text';
    const out = { type, title: (b && b.title) || '' };
    const src = Array.isArray(b && b.items) ? b.items : [];
    if (type === 'text') out.body = (b && b.body) || '';
    else if (type === 'albums') {
      out.items = src.map((a) => ({
        name: (a && a.name) || '未命名相册',
        desc: (a && a.desc) || '',
        photos: Array.isArray(a && a.photos) ? a.photos : []
      }));
    } else out.items = src;
    return out;
  }

  function normalizeCategory(c, i) {
    const raw = c || {};
    return {
      id: raw.id || 'node-' + (i + 1),
      glyph: raw.glyph || pad2(i + 1),
      name: raw.name || '未命名分类',
      en: raw.en || 'CATEGORY',
      summary: raw.summary || '',
      blocks: Array.isArray(raw.blocks) ? raw.blocks.map(normalizeBlock) : []
    };
  }

  function normalize(p) {
    const raw = p || {};
    return {
      name: raw.name || '你的名字',
      brand: raw.brand || raw.name || '你的名字',
      monogram: raw.monogram || initial(raw.name),
      role: raw.role || '身份 / 头衔',
      location: raw.location || '所在城市',
      coords: (raw.coords && typeof raw.coords.lat === 'number' &&
        typeof raw.coords.lng === 'number')
        ? {
          lat: raw.coords.lat, lng: raw.coords.lng,
          acc: raw.coords.acc || 0, at: raw.coords.at || 0,
          source: raw.coords.source === 'gps' ? 'gps' : 'manual'
        }
        : {},
      available: raw.available || '开放合作',
      statement: raw.statement || '一句话介绍你自己。',
      accent: raw.accent || '',
      avatar: raw.avatar || '',
      facts: Array.isArray(raw.facts) ? raw.facts : [],
      stats: Array.isArray(raw.stats) ? raw.stats : [],
      focus: Array.isArray(raw.focus) ? raw.focus : [],
      categories: Array.isArray(raw.categories) ? raw.categories.map(normalizeCategory) : [],
      socials: Array.isArray(raw.socials) ? raw.socials : [],
      email: raw.email || 'hello@example.com',
      emailLabel: raw.emailLabel || '有想法，随时聊聊。',
      copyright: raw.copyright || '© 2025 你的名字'
    };
  }

  const DEFAULTS = normalize(window.PROFILE);

  /* ══ 状态 ══════════════════════════════════════════════════════════ */
  function loadState() {
    const base = clone(DEFAULTS);
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return base;
      const saved = JSON.parse(raw);
      if (saved.__v !== SCHEMA) return base;   /* 结构变了：忽略旧草稿 */
      return normalize(Object.assign(base, saved));
    } catch (e) { return base; }
  }

  let state = loadState();
  let settle = false;
  let watchId = null;      /* 坐标「跟随」模式的 watchPosition id（见第四节） */
  let geoPerm = 'unknown';  /* 定位权限状态：granted / prompt / denied / unknown */
  /* 坐标来源的中文标签（放在这里是因为读数每秒刷新时会用到） */
  const SRC_LABEL = { gps: 'GPS 定位', ip: '网络定位 · 约 ±25 公里', manual: '手填' };
  try { settle = !!localStorage.getItem(STORE_KEY); } catch (e) { settle = false; }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(Object.assign({}, state, { __v: SCHEMA })));
    } catch (e) { toast('浏览器存储已满，请用「下载 profile.js」保存'); }
  }

  let rafPending = null;
  function commit() {
    save();
    if (rafPending) return;
    rafPending = requestAnimationFrame(() => { rafPending = null; renderAll(); });
  }

  /* ══════════════════════════════════════════════════════════════════
     配色：黑 / 灰 / 白 三套单色主题（写在 <html data-theme="..."> 上）
     颜色本身都在 style.css 的 :root 与 [data-theme] 里，这里只管切换和记忆。
     ══════════════════════════════════════════════════════════════════ */
  const THEME_KEY = 'my-homepage-theme';
  const THEMES = [
    { id: 'obsidian', name: '曜石 · 纯黑', meta: '#000000' },
    { id: 'graphite', name: '石墨 · 深灰', meta: '#131313' },
    { id: 'paper',    name: '宣纸 · 浅白', meta: '#F1F1EF' }
  ];
  const themeMeta = (id) => (THEMES.find((t) => t.id === id) || THEMES[0]).meta;

  /* 把 CSS 变量读成 [r,g,b]：支持 #abc / #aabbcc / "12,12,12" / "rgb(1,2,3)" */
  function cssColor(name, fallback) {
    let v = '';
    try {
      v = String(getComputedStyle(document.documentElement)
        .getPropertyValue(name) || '').trim();
    } catch (e) { v = ''; }
    let m = /^#([0-9a-f]{3})$/i.exec(v);
    if (m) return m[1].split('').map((c) => parseInt(c + c, 16));
    m = /^#([0-9a-f]{6})$/i.exec(v);
    if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
    const n = v.split(/[,\s]+/).map((x) => parseFloat(x)).filter((x) => isFinite(x));
    return n.length >= 3 ? n.slice(0, 3) : fallback;
  }

  /* 画布要用的颜色：光点、连线、高光核心、鼠标微光 */
  function readPalette() {
    const ink = cssColor('--ink', [250, 250, 250]);
    const acc = cssColor('--accent-rgb', [255, 255, 255]);
    const mid = cssColor('--ink-3', [118, 118, 118]);
    return { dots: [ink, acc, mid], link: ink, core: ink, glow: acc };
  }

  function applyTheme(id) {
    const t = THEMES.some((x) => x.id === id) ? id : 'obsidian';
    document.documentElement.setAttribute('data-theme', t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', themeMeta(t));
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    $$('[data-theme-set]').forEach((b) => {
      b.classList.toggle('on', b.dataset.themeSet === t);
    });
    try { field.retint(); } catch (e) {}   /* 光点跟着重新上色 */
    return t;
  }

  /* ══════════════════════════════════════════════════════════════════
     一、粒子场：三维投影 + 视差 + 鼠标力场 + 连线星座
     ══════════════════════════════════════════════════════════════════ */
  const field = (() => {
    const canvas = $('#field');
    if (!canvas) return { count: 0, fps: 0, resize() {} };
    const ctx = canvas.getContext('2d');

    /* 光点颜色跟着主题走（从 CSS 变量读，见前面「配色」一节） */
    let pal = readPalette();
    let COLORS = pal.dots.slice();
    const small = innerWidth < 760;
    const COUNT = reduceMotion ? 0 : (small ? 52 : 112);
    const LINK_DIST = small ? 92 : 118;
    const MAX_LINKS = 190;

    let W = 0, H = 0, DPR = 1, cx = 0, cy = 0, spread = 1;
    let ay = 0, ax = 0, t0 = performance.now(), fps = 60, frames = 0, fpsAt = t0;
    let mx = -9, my = -9, hasMouse = false;
    let running = true, rafId = 0;

    const pts = [];
    for (let i = 0; i < COUNT; i++) {
      pts.push({
        x: (Math.random() * 2 - 1),
        y: (Math.random() * 2 - 1),
        z: (Math.random() * 2 - 1),
        vx: (Math.random() - .5) * .0009,
        vy: (Math.random() - .5) * .0009,
        vz: (Math.random() - .5) * .0006,
        c: COLORS[i % COLORS.length],
        si: i % COLORS.length,
        ph: Math.random() * Math.PI * 2
      });
    }

    /* 预渲染光点贴图：比每帧为上百个粒子新建径向渐变快一个数量级 */
    const SPRITE = 64;
    function buildSprites() {
      return COLORS.map((c) => {
        const cv = document.createElement('canvas');
        cv.width = cv.height = SPRITE;
        const g = cv.getContext('2d');
        const rg = g.createRadialGradient(SPRITE / 2, SPRITE / 2, 0,
          SPRITE / 2, SPRITE / 2, SPRITE / 2);
        rg.addColorStop(0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',1)');
        rg.addColorStop(.42, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',.34)');
        rg.addColorStop(1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
        g.fillStyle = rg;
        g.fillRect(0, 0, SPRITE, SPRITE);
        return cv;
      });
    }
    let sprites = buildSprites();

    /* 换配色时重算：光点贴图要重画，不然还是旧颜色 */
    function retint() {
      pal = readPalette();
      COLORS = pal.dots.slice();
      sprites = buildSprites();
      if (reduceMotion) draw(performance.now());
    }

    function resize() {
      DPR = Math.min(devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight;
      canvas.width = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      cx = W / 2; cy = H / 2;
      spread = Math.min(W, H) * 0.62;
    }

    /* 三维旋转 + 透视投影 */
    const proj = [];
    function project() {
      const cosY = Math.cos(ay), sinY = Math.sin(ay);
      const cosX = Math.cos(ax), sinX = Math.sin(ax);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        /* 绕 Y 轴 */
        let x = p.x * cosY - p.z * sinY;
        let z = p.x * sinY + p.z * cosY;
        /* 绕 X 轴 */
        let y = p.y * cosX - z * sinX;
        z = p.y * sinX + z * cosX;

        const depth = 1 / (1.9 + z);           /* 越近越大 */
        const s = depth * spread;
        const sx = cx + x * s;
        const sy = cy + y * s;
        const near = Math.max(0, Math.min(1, (1 - z) / 2));
        proj[i] = { sx, sy, r: 0.5 + near * 1.9, a: 0.05 + near * 0.34, c: p.c, near };
      }
    }

    function step(dt) {
      const f = dt / 16.67;
      for (const p of pts) {
        p.x += p.vx * f; p.y += p.vy * f; p.z += p.vz * f;
        if (p.x > 1) p.x = -1; else if (p.x < -1) p.x = 1;
        if (p.y > 1) p.y = -1; else if (p.y < -1) p.y = 1;
        if (p.z > 1) p.z = -1; else if (p.z < -1) p.z = 1;
      }
      /* 鼠标力场：在屏幕空间附近推开 / 远处吸引 */
      if (hasMouse) {
        for (let i = 0; i < pts.length; i++) {
          const pr = proj[i];
          const dx = pr.sx - mx, dy = pr.sy - my;
          const d2 = dx * dx + dy * dy;
          if (d2 > 46000 || d2 < 1) continue;
          const d = Math.sqrt(d2);
          const force = (1 - d / 214) * 0.00055;
          pts[i].vx += (dx / d) * force;
          pts[i].vy += (dy / d) * force;
        }
      }
      ay += (reduceMotion ? 0 : 0.00055) * f;
      ax += 0.00022 * f;
      /* 速度阻尼，避免越跑越快 */
      for (const p of pts) {
        p.vx *= 0.995; p.vy *= 0.995; p.vz *= 0.995;
        const v = Math.hypot(p.vx, p.vy, p.vz);
        if (v < 0.0004) {
          p.vx += (Math.random() - .5) * .00035;
          p.vy += (Math.random() - .5) * .00035;
        }
      }
    }

    function draw(now) {
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      const time = (now - t0) / 1000;

      /* 连线 */
      let links = 0;
      for (let i = 0; i < pts.length && links < MAX_LINKS; i++) {
        const a = proj[i];
        for (let j = i + 1; j < pts.length && links < MAX_LINKS; j++) {
          const b = proj[j];
          const dx = a.sx - b.sx, dy = a.sy - b.sy;
          const d2 = dx * dx + dy * dy;
          if (d2 > LINK_DIST * LINK_DIST) continue;
          const t = 1 - Math.sqrt(d2) / LINK_DIST;
          const alpha = t * 0.085 * (0.35 + (a.near + b.near) / 2);
          ctx.strokeStyle = 'rgba(' + pal.link.join(',') + ',' + alpha.toFixed(3) + ')';
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(a.sx, a.sy);
          ctx.lineTo(b.sx, b.sy);
          ctx.stroke();
          links++;
        }
      }

      /* 光点：贴图叠加，速度远快于每帧新建渐变 */
      for (let i = 0; i < pts.length; i++) {
        const pr = proj[i];
        const p = pts[i];
        const pulse = 0.72 + 0.28 * Math.sin(time * 1.4 + p.ph);
        const r = pr.r * 3.4;
        ctx.globalAlpha = Math.max(0, Math.min(1, pr.a * pulse));
        ctx.drawImage(sprites[p.si], pr.sx - r, pr.sy - r, r * 2, r * 2);
        /* 高光核心，让粒子有「实心感」 */
        ctx.globalAlpha = Math.max(0, Math.min(1, pr.a * 0.95));
        ctx.fillStyle = 'rgb(' + pal.core.join(',') + ')';
        ctx.beginPath();
        ctx.arc(pr.sx, pr.sy, Math.max(0.5, pr.r * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* 鼠标处的一圈微光 */
      if (hasMouse) {
        const g2 = ctx.createRadialGradient(mx, my, 0, mx, my, 140);
        g2.addColorStop(0, 'rgba(' + pal.glow.join(',') + ',.055)');
        g2.addColorStop(1, 'rgba(' + pal.glow.join(',') + ',0)');
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.arc(mx, my, 140, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    let last = performance.now();
    function loop(now) {
      if (!running) return;
      const dt = Math.min(48, now - last); last = now;
      project(); step(dt); draw(now);

      frames++;
      if (now - fpsAt > 500) {
        fps = Math.round(frames * 1000 / (now - fpsAt));
        frames = 0; fpsAt = now;
        updateTelemetry();
      }
      rafId = requestAnimationFrame(loop);
    }

    addEventListener('resize', () => { resize(); project(); });
    addEventListener('pointermove', (e) => {
      mx = e.clientX; my = e.clientY; hasMouse = true;
    }, { passive: true });
    addEventListener('pointerleave', () => { hasMouse = false; });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { running = false; cancelAnimationFrame(rafId); }
      else if (!reduceMotion) { running = true; last = performance.now(); rafId = requestAnimationFrame(loop); }
    });

    resize(); project();
    if (reduceMotion) draw(performance.now());
    else rafId = requestAnimationFrame(loop);

    return {
      count: COUNT,
      get fps() { return fps; },
      resize,
      retint
    };
  })();

  /* ══ 控制台读数 ════════════════════════════════════════════════════ */
  function updateTelemetry() {
    const fps = field.fps || 0;
    const fpsBar = $('#fpsBar'), fpsVal = $('#fpsVal');
    if (fpsBar) fpsBar.style.width = Math.max(2, Math.min(100, fps / 60 * 100)) + '%';
    if (fpsVal) fpsVal.textContent = fps + 'FPS';

    const pBar = $('#pBar'), pVal = $('#pVal');
    if (pBar) pBar.style.width = Math.max(2, Math.min(100, field.count / 3)) + '%';
    if (pVal) pVal.textContent = field.count;

    const res = $('#resVal');
    if (res) res.textContent = innerWidth + '×' + innerHeight + ' px · DPR ' +
      Math.min(devicePixelRatio || 1, 2) + ' · CANVAS 2D';

    renderCoords();   /* 让「刚刚 / 3 分钟前 / 跟随中」保持实时 */
  }

  function tickClock() {
    const el = $('#clock');
    if (!el) return;
    const d = new Date();
    el.textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }
  tickClock();
  setInterval(tickClock, 1000);
  updateTelemetry();

  /* ══ 渲染：首页 ════════════════════════════════════════════════════ */
  function renderAll() {
    const s = state;

    $('#brandName').textContent = s.brand;
    $('#brandGlyph').textContent = initial(s.monogram || s.name);
    $('#available').textContent = s.available;
    $('#name').textContent = s.name;
    $('#role').textContent = s.role;
    $('#cardName').textContent = s.name;
    $('#cardLocation').textContent = s.location;

    const text = esc(s.statement);
    $('#statement').innerHTML = s.accent && s.statement.includes(s.accent)
      ? text.replace(esc(s.accent), '<em>' + esc(s.accent) + '</em>')
      : text;

    /* 标签 */
    const tags = $('#focusList');
    if (tags) {
      tags.innerHTML = (s.focus || []).filter(Boolean)
        .map((t) => '<span class="chip">' + esc(t) + '</span>').join('');
    }

    /* 坐标 */
    renderCoords();

    /* 头像 */
    const av = $('#avatar');
    av.textContent = '';
    if (s.avatar) {
      const img = document.createElement('img');
      img.src = s.avatar; img.alt = s.name;
      img.addEventListener('error', () => { av.textContent = initial(s.monogram || s.name); });
      av.appendChild(img);
    } else {
      av.textContent = initial(s.monogram || s.name);
    }

    /* 控制台信息行 */
    $('#factsList').innerHTML = s.facts.filter((f) => f && (f.k || f.v))
      .map((f) => '<li><span class="k">' + esc(f.k) + '</span><span class="v">' + esc(f.v) + '</span></li>')
      .join('');

    /* 数字 */
    $('#statsList').innerHTML = s.stats.filter((x) => x && (x.n || x.l))
      .map((x) => '<div class="stat ' + (settle ? 'reveal in' : 'reveal') + '">' +
        '<div class="n">' + esc(x.n) + '</div><div class="l">' + esc(x.l) + '</div></div>').join('');

    /* 我的几面 */
    $('#facetGrid').innerHTML = s.categories.map((c) =>
      '<button class="facet" type="button" data-id="' + esc(c.id) + '">' +
      '<span class="facet-top"><span class="facet-index">' + esc(c.glyph) + '</span>' +
      '<span class="mono facet-en">' + esc(c.en) + '</span></span>' +
      '<span class="facet-name">' + esc(c.name) + '</span>' +
      '<span class="facet-summary">' + esc(c.summary) + '</span>' +
      '<span class="facet-go"><span>展开</span><span class="arrow">→</span></span>' +
      '<i class="sheen" aria-hidden="true"></i>' +
      '</button>').join('');

    /* 顶部导航 */
    $('#hudNav').innerHTML = s.categories.map((c) =>
      '<button type="button" data-id="' + esc(c.id) + '">' + esc(c.name) + '</button>').join('');

    /* 社交：统一的素色徽标，不用彩虹配色 */
    $('#socialGrid').innerHTML = s.socials.filter((x) => x && x.name).map((x) => {
      const badge = esc(x.badge || x.name.slice(0, 1));
      const hasUrl = !!x.url;
      const tag = hasUrl ? 'a' : 'div';
      const attrs = hasUrl ? ' href="' + esc(x.url) + '" target="_blank" rel="noopener"' : '';
      const qr = x.qr ? '<span class="qr-pop"><img src="' + esc(x.qr) + '" alt="' +
        esc(x.name) + ' 二维码" /><span>' + esc(x.name) + '</span></span>' : '';
      return '<' + tag + ' class="social' + (hasUrl ? '' : ' locked') + '"' + attrs + '>' +
        '<span class="badge">' + badge + '</span>' +
        '<span class="social-meta"><span class="nm">' + esc(x.name) + '</span>' +
        (x.note ? '<span class="nt">' + esc(x.note) + '</span>' : '') + '</span>' +
        (hasUrl ? '<span class="go">↗</span>' : '') + qr + '</' + tag + '>';
    }).join('');

    $('#emailLabel').textContent = s.emailLabel;
    $('#emailText').textContent = s.email;
    $('#emailLink').setAttribute('href', 'mailto:' + s.email);
    $('#copyright').textContent = s.copyright;

    wireHome();
    if (!$('#view-detail').hidden) renderDetail(currentId(), true);
    observeReveals();
  }

  function wireHome() {
    $$('.facet', $('#facetGrid')).forEach((el) => {
      const go = () => liquidGo('#/' + el.dataset.id, el);
      el.addEventListener('click', go);
      attachTilt(el, 4);
    });
    $$('#hudNav button').forEach((el) => {
      el.addEventListener('click', () => liquidGo('#/' + el.dataset.id, el));
    });
  }

  /* ══ 渲染：分类详情 ════════════════════════════════════════════════ */
  let albumFilter = {};     /* 每个相册块当前选中的相册，0 = 全部 */
  let lastCatId = null;

  function currentId() {
    return decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  }

  function renderDetail(id, keep) {
    const cat = state.categories.find((c) => c.id === id);
    if (!cat) return false;

    /* 换了分类就重置相册筛选 */
    if (lastCatId !== id) { albumFilter = {}; lastCatId = id; }

    $('#dEn').textContent = cat.en;
    $('#dName').textContent = cat.name;
    $('#dSummary').textContent = cat.summary;
    $('#crumb').textContent = '我的几面 / ' + cat.name;
    if ($('#dEditName')) $('#dEditName').textContent = cat.name;
    drawerCatId = cat.id;      /* 详情抽屉始终跟着当前这一面 */

    const box = $('#blocks');
    box.innerHTML = cat.blocks.map(blockHTML).join('');
    /* 给每个块标上数组下标，避免块数与下标错位；顺手加一层玻璃高光 */
    $$('.block', box).forEach((el, i) => {
      el.dataset.bi = String(i);
      if (reduceMotion) return;
      const sh = document.createElement('i');
      sh.className = 'sheen';
      sh.setAttribute('aria-hidden', 'true');
      el.appendChild(sh);
      attachTilt(el, 0);          /* 只驱动 --mx / --my，不做倾斜 */
    });
    if (!cat.blocks.length) {
      box.innerHTML = '<div class="block"><p class="block-body">这个分类还没有内容。' +
        '点右下角的「编辑主页」就能添加。</p></div>';
    }
    wireBlocks();

    if (!keep) {
      const v = $('#view-detail');
      v.classList.remove('enter');
      void v.offsetWidth;
      v.classList.add('enter');
    }
    observeReveals();
    return true;
  }

  /* 单张照片卡（photos 与 albums 共用），i 为该网格内的序号 */
  function photoCardHTML(p, i, albumName) {
    if (!p || !p.src) return '';
    return '<div class="photo" role="button" tabindex="0" data-p="' + i + '" ' +
      'aria-label="查看照片：' + esc(p.title || '') + '">' +
      '<div class="photo-media"><span class="photo-idx">' + pad2(i + 1) + '</span>' +
      (albumName ? '<span class="photo-album">' + esc(albumName) + '</span>' : '') +
      '<img src="' + esc(p.src) + '" alt="' + esc(p.title || '') + '" loading="lazy" /></div>' +
      '<div class="photo-body"><h3>' + esc(p.title || '未命名') + '</h3>' +
      (p.caption ? '<p>' + esc(p.caption) + '</p>' : '') + '</div></div>';
  }

  /* 把相册摊平成网格列表；filter = 0 表示全部 */
  function flattenAlbums(albums, filter) {
    const out = [];
    albums.forEach((a, ai) => {
      if (filter > 0 && ai !== filter - 1) return;
      (Array.isArray(a.photos) ? a.photos : []).forEach((p) => {
        if (p && p.src) out.push({ p, album: a.name });
      });
    });
    return out;
  }

  function albumChipsHTML(albums, filter) {
    const total = flattenAlbums(albums, 0).length;
    const chip = (idx, label, n) =>
      '<button class="chip' + (filter === idx ? ' on' : '') + '" type="button" data-a="' + idx + '">' +
      esc(label) + '<em>' + n + '</em></button>';
    return chip(0, '全部', total) +
      albums.map((a, i) => chip(i + 1, a.name || '未命名相册', flattenAlbums(albums, i + 1).length)).join('');
  }

  function blockHTML(b, i) {
    const title = b.title
      ? '<h3 class="block-title"><span class="mono">' + pad2(i + 1) + '</span>' + esc(b.title) + '</h3>'
      : '';
    const items = Array.isArray(b.items) ? b.items : [];

    switch (b.type) {
      case 'text':
        return '<div class="block' + (settle ? '' : ' reveal') + '">' + title +
          '<p class="block-body">' + fmt(b.body) + '</p></div>';

      case 'list':
        return '<div class="block' + (settle ? '' : ' reveal') + '">' + title +
          '<ul class="block-list">' + items.map((x) => '<li>' + esc(x) + '</li>').join('') +
          '</ul></div>';

      case 'tags':
        return '<div class="block' + (settle ? '' : ' reveal') + '">' + title +
          '<div class="chips">' + items.map((x) => '<span class="chip">' + esc(x) + '</span>').join('') +
          '</div></div>';

      case 'stats':
        return '<div class="block' + (settle ? '' : ' reveal') + '">' + title +
          '<div class="block-stats">' + items.map((x) =>
            '<div class="bs"><div class="n">' + esc(x.n) + '</div>' +
            '<div class="l">' + esc(x.l) + '</div></div>').join('') + '</div></div>';

      case 'timeline':
        return '<div class="block' + (settle ? '' : ' reveal') + '">' + title +
          '<ul class="timeline">' + items.map((x) =>
            '<li><div class="t-time">' + esc(x.time) + '</div>' +
            '<div class="t-title">' + esc(x.title) + '</div>' +
            (x.desc ? '<div class="t-desc">' + esc(x.desc) + '</div>' : '') + '</li>').join('') +
          '</ul></div>';

      case 'links':
        return '<div class="block' + (settle ? '' : ' reveal') + '">' + title +
          '<div class="link-grid">' + items.map((x) => {
            const tag = x.url ? 'a' : 'div';
            const attrs = x.url ? ' href="' + esc(x.url) + '" target="_blank" rel="noopener"' : '';
            return '<' + tag + ' class="link-card"' + attrs + '><span class="lc-dot"></span>' +
              '<span><span class="lc-name">' + esc(x.name) + '</span>' +
              (x.note ? '<span class="lc-note">' + esc(x.note) + '</span>' : '') + '</span>' +
              (x.url ? '<span class="lc-go">↗</span>' : '') + '</' + tag + '>';
          }).join('') + '</div></div>';

      case 'photos':
        return '<div class="block' + (settle ? '' : ' reveal') + '">' + title +
          '<div class="photo-grid">' + items.map((p, j) => photoCardHTML(p, j, '')).join('') +
          '</div></div>';

      case 'albums': {
        const albums = items;
        const filter = albumFilter[i] || 0;
        const list = flattenAlbums(albums, filter);
        const cur = filter > 0 ? albums[filter - 1] : null;
        const note = cur && cur.desc ? cur.desc : '';
        return '<div class="block' + (settle ? '' : ' reveal') + '" data-albums="1" data-bi="' + i + '">' +
          title +
          '<div class="album-bar"><div class="chips album-chips">' +
            albumChipsHTML(albums, filter) + '</div></div>' +
          '<p class="album-note"' + (note ? '' : ' hidden') + '>' + esc(note) + '</p>' +
          '<div class="photo-grid">' +
            (list.length
              ? list.map((x, j) => photoCardHTML(x.p, j, x.album)).join('')
              : '<p class="photo-empty">这个相册还没有照片。点「编辑主页」即可添加。</p>') +
          '</div></div>';
      }

      default:
        return '';
    }
  }

  function wireBlocks() {
    const cat = state.categories.find((c) => c.id === currentId());
    if (!cat) return;

    $$('#blocks .block').forEach((blockEl) => {
      const bi = +blockEl.dataset.bi;
      const b = cat.blocks[bi];
      if (!b) return;

      /* 普通照片网格 */
      if (b.type === 'photos') {
        wirePhotoGrid(blockEl, () => b.items || []);
      }

      /* 相册：顶部胶囊切换 + 网格重绘 */
      if (b.type === 'albums') {
        const albums = b.items || [];
        const chips = $$('.album-chips .chip', blockEl);
        const paint = () => {
          const filter = albumFilter[bi] || 0;
          const list = flattenAlbums(albums, filter);
          const grid = $('.photo-grid', blockEl);
          const note = $('.album-note', blockEl);
          grid.innerHTML = list.length
            ? list.map((x, j) => photoCardHTML(x.p, j, x.album)).join('')
            : '<p class="photo-empty">这个相册还没有照片。点右下角 ✎ 添加。</p>';
          chips.forEach((c) => c.classList.toggle('on', +c.dataset.a === filter));
          const cur = filter > 0 ? albums[filter - 1] : null;
          const txt = cur && cur.desc ? cur.desc : '';
          note.textContent = txt;
          note.hidden = !txt;
          wirePhotoGrid(blockEl, () => list);
        };
        chips.forEach((c) => c.addEventListener('click', () => {
          albumFilter[bi] = +c.dataset.a;
          paint();
        }));
        wirePhotoGrid(blockEl, () => flattenAlbums(albums, albumFilter[bi] || 0));
      }
    });
  }

  /* 给一个块里的照片卡接上放大与倾斜 */
  function wirePhotoGrid(blockEl, getList) {
    const list = getList();
    $$('.photo', blockEl).forEach((el) => {
      const item = list[+el.dataset.p];
      if (!item) return;
      const open = () => openLightbox(item.p || item);
      el.addEventListener('click', open);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
      attachTilt(el, 5);
    });
  }

  /* ══ 液态玻璃转场 ══════════════════════════════════════════════════
     点开某一面时：一块磨砂玻璃先盖住被点的那张卡片，
     然后像液体一样漫开成整屏（同时有一个液滴从点击处涌出、
     一道镜面高光斜掠而过），翻页后玻璃再化开露出内容。
     ══════════════════════════════════════════════════════════════════ */
  const veil = $('#veil');
  let veiling = false;

  function liquidGo(hash, fromEl) {
    if (hash === location.hash || veiling) return;
    if (reduceMotion || !veil) { location.hash = hash; return; }

    const r = fromEl && fromEl.getBoundingClientRect ? fromEl.getBoundingClientRect() : null;
    const vw = innerWidth, vh = innerHeight;
    veiling = true;

    /* 1. 薄片先停在被点元素的位置上 */
    veil.style.transition = 'none';
    veil.classList.remove('open', 'cover', 'out');
    if (r && r.width > 10 && r.height > 10) {
      const pad = 8;
      const top = Math.max(0, r.top - pad);
      const left = Math.max(0, r.left - pad);
      const right = Math.max(0, vw - Math.min(vw, r.right + pad));
      const bottom = Math.max(0, vh - Math.min(vh, r.bottom + pad));
      const rad = Math.max(4, Math.min(20, Math.round(Math.min(r.width, r.height) * .12)));
      veil.style.clipPath = 'inset(' + top + 'px ' + right + 'px ' + bottom + 'px ' +
        left + 'px round ' + rad + 'px)';
      veil.style.setProperty('--vx', ((r.left + r.width / 2) / vw * 100).toFixed(2) + '%');
      veil.style.setProperty('--vy', ((r.top + r.height / 2) / vh * 100).toFixed(2) + '%');
    } else {
      veil.style.clipPath = 'inset(46% round 10px)';
    }
    veil.classList.add('on');
    void veil.offsetWidth;

    /* 2. 漫开成整屏 */
    veil.style.transition = '';
    requestAnimationFrame(() => {
      veil.classList.add('open');
      veil.style.clipPath = 'inset(0px round 0px)';
    });

    /* 3. 全屏后翻页，再化开 */
    setTimeout(() => veil.classList.add('cover'), 380);
    setTimeout(() => { if (location.hash !== hash) location.hash = hash; }, 520);
    setTimeout(() => veil.classList.add('out'), 660);
    setTimeout(() => {
      veil.classList.remove('on', 'open', 'cover', 'out');
      veil.style.transition = 'none';
      veil.style.clipPath = 'inset(46% round 10px)';
      void veil.offsetWidth;
      veil.style.transition = '';
      veiling = false;
    }, 1260);
  }

  /* ══ 视图路由 ══════════════════════════════════════════════════════ */
  function route() {
    const id = currentId();
    const ok = id ? renderDetail(id) : false;
    const home = $('#view-home'), detail = $('#view-detail');
    document.body.classList.toggle('detail', !!ok);

    if (ok) {
      home.hidden = true; detail.hidden = false;
      document.title = state.categories.find((c) => c.id === id).name + ' · ' + state.name;
      $$('#hudNav button').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
      scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    } else {
      detail.hidden = true; home.hidden = false;
      document.title = state.name + ' · 个人主页';
      $$('#hudNav button').forEach((b) => b.classList.remove('on'));
      if (isOpen('detail')) setOpen('detail', false);   /* 回到首页就收起这一面的抽屉 */
      home.classList.remove('enter');
      void home.offsetWidth;
      home.classList.add('enter');
      observeReveals();
    }
  }

  addEventListener('hashchange', route);
  $('#backBtn').addEventListener('click', (e) => liquidGo('#/', e.currentTarget));
  $('#backBtn2').addEventListener('click', (e) => liquidGo('#/', e.currentTarget));
  $('#brandLink').addEventListener('click', (e) => {
    if (!location.hash || location.hash === '#') return;
    e.preventDefault();
    liquidGo('#/', e.currentTarget);
  });

  /* ══ 卡片三维倾斜 ══════════════════════════════════════════════════ */
  function attachTilt(el, max) {
    if (reduceMotion || !matchMedia('(hover:hover)').matches) return;
    let ticking = false;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        el.style.setProperty('--ry', ((px - .5) * max * 2).toFixed(2) + 'deg');
        el.style.setProperty('--rx', ((.5 - py) * max * 2).toFixed(2) + 'deg');
        el.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
        el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
        ticking = false;
      });
    }, { passive: true });
    el.addEventListener('pointerleave', () => {
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    });
  }

  /* ══ 大图 ══════════════════════════════════════════════════════════ */
  const lightbox = $('#lightbox');
  function openLightbox(p) {
    if (!p || !p.src) return;
    $('#lbImg').src = p.src;
    $('#lbImg').alt = p.title || '';
    $('#lbTitle').textContent = p.title || '';
    $('#lbCaption').textContent = p.caption || '';
    lightbox.hidden = false;
  }
  const closeLightbox = () => { lightbox.hidden = true; };
  $('#lbClose').addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });

  /* ══ 轻提示 ════════════════════════════════════════════════════════ */
  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.hidden = false;
    requestAnimationFrame(() => el.classList.add('in'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('in');
      setTimeout(() => { el.hidden = true; }, 320);
    }, 2400);
  }

  /* ══ 出场动画 ══════════════════════════════════════════════════════ */
  let io = null;
  function observeReveals() {
    const items = $$('.reveal:not(.in)');
    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('in'));
      return;
    }
    if (!io) {
      io = new IntersectionObserver((entries) => {
        entries.forEach((entry, i) => {
          if (!entry.isIntersecting) return;
          entry.target.style.transitionDelay = Math.min(i, 4) * 70 + 'ms';
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -12% 0px', threshold: .1 });
    }
    items.forEach((el) => io.observe(el));
  }

  /* ══ 顶栏状态 + 复制 ═══════════════════════════════════════════════ */
  const hud = $('#hud');
  const onScroll = () => hud.classList.toggle('stuck', scrollY > 10);
  onScroll();
  addEventListener('scroll', onScroll, { passive: true });

  $('#copyBtn').addEventListener('click', async () => {
    await copyText(state.email);
    const b = $('#copyBtn');
    b.textContent = '已复制 ✓'; b.classList.add('done');
    setTimeout(() => { b.textContent = '复制'; b.classList.remove('done'); }, 1800);
  });

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const t = document.createElement('textarea');
      t.value = text; t.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(t); t.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      t.remove();
      return ok;
    }
  }

  /* ══ 图片压缩 ══════════════════════════════════════════════════════ */
  function shrinkImage(file, maxSide = 1600, quality = .82) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('图片读取失败'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('这个文件无法作为图片打开'));
        img.onload = () => {
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          const ctx = cv.getContext('2d');
          ctx.fillStyle = 'rgb(' + cssColor('--bg', [0, 0, 0]).join(',') + ')';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(cv.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     三、就地编辑：每块内容自己带一个 ✎，点开原地改，改完「✓ 完成」
     ══════════════════════════════════════════════════════════════════ */
  const MENU_ITEMS = [
    ['hero',    '首屏：姓名 / 主张 / 头像'],
    ['console', '实时读数：信息行'],
    ['cats',    '我的几面'],
    ['stats',   '三个数字'],
    ['socials', '联系方式与社交'],
    ['footer',  '界面颜色 / 下载备份']
  ];
  let openName = null;          /* 当前打开的抽屉 */
  let drawerCatId = null;       /* 详情抽屉正在编辑哪一面 */

  const drawerOf = (name) => $('[data-drawer="' + name + '"]');
  const isOpen = (name) => { const el = drawerOf(name); return !!el && !el.hidden; };

  function setOpen(name, on) {
    const el = drawerOf(name);
    if (!el) return;
    if (on) {
      /* 一次只开一个，免得同时摊开一堆表单 */
      $$('[data-drawer]').forEach((d) => { d.hidden = true; });
      $$('[data-open]').forEach((b) => b.classList.toggle('on', b.dataset.open === name));
      el.hidden = false;
      openName = name;
      if (name === 'detail') {
        drawerCatId = currentId();
        const cat = state.categories.find((c) => c.id === drawerCatId);
        if (cat && $('#dEditName')) $('#dEditName').textContent = cat.name;
      }
      syncFields();
      renderEditorLists();
      if (el.scrollIntoView) {
        el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      }
    } else {
      el.hidden = true;
      if (openName === name) openName = null;
      $$('[data-open]').forEach((b) => {
        if (b.dataset.open === name) b.classList.remove('on');
      });
    }
    syncOpenButtons();
  }
  function toggleOpen(name) { setOpen(name, !isOpen(name)); }

  /* 带文字的按钮跟着切换文案（✎ 编辑这一面 ⇄ ✓ 完成） */
  function syncOpenButtons() {
    $$('[data-open]').forEach((b) => {
      const lbl = $('.lbl', b);
      if (!lbl) return;
      const name = b.dataset.open;
      const on = isOpen(name);
      const auto = { detail: ['编辑这一面', '完成'] }[name];
      if (!auto) return;
      /* 收起时用图标 + 文字，展开时就一个 ✓，避免出现两个铅笔 */
      lbl.textContent = on ? '✓ ' + auto[1] : auto[0];
    });
  }

  $$('[data-open]').forEach((b) => {
    b.addEventListener('click', () => toggleOpen(b.dataset.open));
  });
  $$('[data-done]').forEach((b) => {
    b.addEventListener('click', () => setOpen(b.dataset.done, false));
  });

  /* 各模块的「+ 添加…」 */
  $$('[data-add]').forEach((b) => {
    b.addEventListener('click', () => {
      const kind = b.dataset.add;
      if (kind === 'stats') state.stats.push({ n: '0', l: '说明' });
      if (kind === 'facts') state.facts.push({ k: '新的一项', v: '内容' });
      if (kind === 'socials') state.socials.push({ name: '新平台', url: '', note: '', badge: '', qr: '' });
      if (kind === 'cats') {
        const n = state.categories.length + 1;
        state.categories.push(normalizeCategory({
          id: 'node-' + n, glyph: pad2(n), name: '新的一面', en: 'CATEGORY',
          summary: '一句话说明', blocks: [{ type: 'text', title: '小标题', body: '在这里写内容。' }]
        }, n - 1));
      }
      renderEditorLists(); commit();
    });
  });

  /* ── 右下角菜单：列出当前页面能改的几块 ── */
  const fab = $('#fab'), menu = $('#menu'), menuList = $('#menuList');
  let menuKind = null;

  function buildMenu() {
    const onDetail = !$('#view-detail').hidden;
    const kind = onDetail ? 'detail' : 'home';
    if (menuKind === kind) return;         /* 同一页面不用重建 */
    menuKind = kind;
    $('#menuHead').textContent = onDetail ? '编辑这一面' : '编辑本页';
    const items = onDetail ? [['detail', '这一面的全部内容']] : MENU_ITEMS;
    menuList.innerHTML = items.map(([name, label]) =>
      '<button type="button" data-jump="' + name + '">' + label + '</button>').join('') +
      '<span class="sep"></span>' +
      '<button type="button" data-jump="footer">下载 / 备份</button>';
    $$('[data-jump]', menuList).forEach((b) => {
      b.addEventListener('click', () => { closeMenu(); setOpen(b.dataset.jump, true); });
    });
  }

  function closeMenu() {
    if (!menu) return;
    menu.hidden = true;
    fab.classList.remove('on');
    fab.setAttribute('aria-expanded', 'false');
  }
  function toggleMenu(fromTop) {
    if (!menu) return;
    if (menu.hidden) {
      buildMenu();
      menu.hidden = false;
      menu.classList.toggle('top', !!fromTop);
      fab.classList.add('on');
      fab.setAttribute('aria-expanded', 'true');
      hideCoach(false);
    } else closeMenu();
  }
  const hudEdit = $('#hudEdit');
  if (fab) fab.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(false); });
  document.addEventListener('click', (e) => {
    if (!menu || menu.hidden) return;
    if (menu.contains(e.target) || (fab && fab.contains(e.target)) ||
        (hudEdit && hudEdit.contains(e.target))) return;
    closeMenu();
  });
  if (hudEdit) hudEdit.addEventListener('click', () => toggleMenu(true));

  /* ── 首次访问提示 ── */
  const COACH_KEY = 'my-homepage-coach-v1';
  const coach = $('#coach');
  let coachDone = false;
  try { coachDone = localStorage.getItem(COACH_KEY) === '1'; } catch (e) { coachDone = false; }
  function hideCoach(remember) {
    if (!coach || coach.hidden) return;
    coach.hidden = true;
    if (remember) { try { localStorage.setItem(COACH_KEY, '1'); } catch (e) {} }
  }
  if (coach && !coachDone) {
    setTimeout(() => { if (!openName) coach.hidden = false; }, 1800);
    const cx = $('#coachX'), cg = $('#coachGo');
    if (cx) cx.addEventListener('click', () => hideCoach(true));
    if (cg) cg.addEventListener('click', () => { hideCoach(true); setOpen('hero', true); });
  }

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!lightbox.hidden) return closeLightbox();
      if (menu && !menu.hidden) return closeMenu();
      if (openName) return setOpen(openName, false);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      if (openName) setOpen(openName, false);
      else setOpen($('#view-detail').hidden ? 'hero' : 'detail', true);
    }
  });

  const FIELDS = [
    ['f-name', 'name'], ['f-brand', 'brand'], ['f-monogram', 'monogram'],
    ['f-role', 'role'], ['f-location', 'location'], ['f-available', 'available'],
    ['f-statement', 'statement'], ['f-accent', 'accent'],
    ['f-email', 'email'], ['f-emailLabel', 'emailLabel'], ['f-copyright', 'copyright']
  ];
  FIELDS.forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => { state[key] = el.value; commit(); });
  });

  const focusEl = $('#f-focus');
  focusEl.addEventListener('input', () => {
    state.focus = focusEl.value.split(/[、,，\n]+/).map((t) => t.trim()).filter(Boolean);
    commit();
  });

  function syncFields() {
    FIELDS.forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (el) el.value = state[key] || '';
    });
    focusEl.value = state.focus.join('、');
    renderEditorLists();
    renderAvatarPreview();
  }

  /* —— 小工具条 —— */
  function toolsHTML() {
    return '<div class="row-tools">' +
      '<button class="mini-btn ghost" data-act="up" type="button">↑</button>' +
      '<button class="mini-btn ghost" data-act="down" type="button">↓</button>' +
      '<button class="mini-btn danger" data-act="del" type="button">删除</button>' +
      '</div>';
  }
  function wireTools(row, arr, i, after) {
    $$('[data-act]', row).forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        if (act === 'del') arr.splice(i, 1);
        if (act === 'up' && i > 0) arr.splice(i - 1, 0, arr.splice(i, 1)[0]);
        if (act === 'down' && i < arr.length - 1) arr.splice(i + 1, 0, arr.splice(i, 1)[0]);
        if (after) after(act);
        renderEditorLists(); commit();
      });
    });
  }

  /* —— 照片编辑器（用于 photos 内容块） —— */
  function buildPhotoEditor(container, items) {
    container.innerHTML = '';
    items.forEach((p, i) => {
      const isData = String(p.src || '').startsWith('data:');
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML =
        '<div class="row-top">' +
          '<div class="thumb">' + (p.src ? '<img src="' + esc(p.src) + '" alt="">' : '图') + '</div>' +
          '<div class="grow"><label class="mini-btn">上传图片' +
          '<input type="file" accept="image/*" hidden></label></div>' +
        '</div>' +
        '<label class="field"><span>标题</span><input data-f="title" value="' + esc(p.title) + '"></label>' +
        '<label class="field"><span>简介</span><textarea data-f="caption" rows="2">' + esc(p.caption) + '</textarea></label>' +
        '<label class="field"><span>图片路径</span><input data-f="src" value="' + (isData ? '' : esc(p.src)) +
        '" placeholder="' + (isData ? '已内嵌的图片（可改填 assets/photos/x.jpg）' : 'assets/photos/x.jpg') + '"></label>' +
        toolsHTML();
      $$('[data-f]', row).forEach((inp) => {
        inp.addEventListener('input', () => {
          if (inp.dataset.f === 'src' && isData && !inp.value.trim()) return;
          p[inp.dataset.f] = inp.value;
          commit();
        });
      });
      const file = $('input[type=file]', row);
      file.addEventListener('change', async () => {
        if (!file.files || !file.files[0]) return;
        try {
          p.src = await shrinkImage(file.files[0]);
          renderEditorLists(); commit(); toast('照片已加入');
        } catch (err) { toast(err.message || '图片处理失败'); }
      });
      wireTools(row, items, i, () => renderEditorLists());
      container.appendChild(row);
    });
    const add = document.createElement('button');
    add.type = 'button'; add.className = 'mini-btn ghost add'; add.textContent = '+ 添加照片';
    add.addEventListener('click', () => {
      items.push({ src: '', title: '新照片', caption: '' });
      renderEditorLists(); commit();
    });
    container.appendChild(add);
  }

  /* —— 相册编辑器：相册名可增删改，每个相册内的照片也可增删 —— */
  function buildAlbumEditor(container, albums) {
    container.innerHTML = '';
    albums.forEach((a, i) => {
      const photos = Array.isArray(a.photos) ? a.photos : (a.photos = []);
      const row = document.createElement('div');
      row.className = 'row album-row';
      row.innerHTML =
        '<div class="row-top">' +
          '<div class="thumb">' + esc((a.name || '相').slice(0, 1)) + '</div>' +
          '<div class="grow"><input data-af="name" value="' + esc(a.name) +
          '" placeholder="相册名，如 旅行 / 工作 / 日常"></div>' +
        '</div>' +
        '<label class="field"><span>相册说明（可留空）</span>' +
        '<input data-af="desc" value="' + esc(a.desc) + '" placeholder="一句话说明这个相册"></label>' +
        '<div class="album-photos"></div>' +
        '<div class="row-tools">' +
          '<button class="mini-btn ghost" data-aact="up" type="button">↑ 上移相册</button>' +
          '<button class="mini-btn ghost" data-aact="down" type="button">↓ 下移相册</button>' +
          '<button class="mini-btn danger" data-aact="del" type="button">删除相册</button>' +
        '</div>';

      $$('[data-af]', row).forEach((inp) => {
        inp.addEventListener('input', () => { a[inp.dataset.af] = inp.value; commit(); });
      });

      buildPhotoEditor($('.album-photos', row), photos);

      $$('[data-aact]', row).forEach((btn) => {
        btn.addEventListener('click', () => {
          const act = btn.dataset.aact;
          if (act === 'del') albums.splice(i, 1);
          if (act === 'up' && i > 0) albums.splice(i - 1, 0, albums.splice(i, 1)[0]);
          if (act === 'down' && i < albums.length - 1) {
            albums.splice(i + 1, 0, albums.splice(i, 1)[0]);
          }
          renderEditorLists(); commit();
        });
      });

      container.appendChild(row);
    });

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'mini-btn ghost add';
    add.textContent = '+ 添加相册';
    add.addEventListener('click', () => {
      albums.push({ name: '新相册', desc: '', photos: [] });
      renderEditorLists(); commit();
    });
    container.appendChild(add);
  }

  /* —— 内容块编辑器 —— */
  function blockFieldsHTML(b) {
    const titleField = '<label class="field"><span>小标题（可留空）</span>' +
      '<input data-bf="title" value="' + esc(b.title) + '"></label>';
    const hint = (t) => '<span>' + t + '</span>';
    switch (b.type) {
      case 'text':
        return titleField + '<label class="field"><span>正文（可换行）</span>' +
          '<textarea data-bf="body" rows="4">' + esc(b.body) + '</textarea></label>';
      case 'list':
        return titleField + '<label class="field">' + hint('每行一条') +
          '<textarea data-b="items" rows="4">' + esc(itemsToLines(b.items, 'list')) + '</textarea></label>';
      case 'tags':
        return titleField + '<label class="field">' + hint('用「、」或逗号分隔') +
          '<textarea data-b="items" rows="2">' + esc(itemsToLines(b.items, 'tags')) + '</textarea></label>';
      case 'stats':
        return titleField + '<label class="field">' + hint('每行：数字 | 说明') +
          '<textarea data-b="items" rows="3">' + esc(itemsToLines(b.items, 'stats')) + '</textarea></label>';
      case 'timeline':
        return titleField + '<label class="field">' + hint('每行：时间 | 标题 | 描述') +
          '<textarea data-b="items" rows="4">' + esc(itemsToLines(b.items, 'timeline')) + '</textarea></label>';
      case 'links':
        return titleField + '<label class="field">' + hint('每行：平台 | 链接 | 备注') +
          '<textarea data-b="items" rows="4">' + esc(itemsToLines(b.items, 'links')) + '</textarea></label>';
      case 'photos':
        return titleField + '<div class="photo-rows"></div>';
      case 'albums':
        return titleField + '<div class="album-rows"></div>';
      default: return titleField;
    }
  }

  function buildBlockEditor(cat, b, bi, wrap) {
    const el = document.createElement('div');
    el.className = 'blk';
    el.innerHTML =
      '<div class="blk-head">' +
        '<span class="blk-no">' + pad2(bi + 1) + '</span>' +
        '<span class="blk-kind">' + kindLabel(b.type) + '</span>' +
        '<select data-bf="type">' + BLOCK_KINDS.map((k) =>
          '<option value="' + k.type + '"' + (k.type === b.type ? ' selected' : '') + '>' +
          k.label + '</option>').join('') + '</select>' +
        '<button class="blk-toggle" type="button" data-act="collapse">收起</button>' +
      '</div>' +
      '<div class="blk-body">' + blockFieldsHTML(b) +
        '<div class="row-tools">' +
          '<button class="mini-btn ghost" data-act="blk-up" type="button">↑ 上移</button>' +
          '<button class="mini-btn ghost" data-act="blk-down" type="button">↓ 下移</button>' +
          '<button class="mini-btn danger" data-act="blk-del" type="button">删除此块</button>' +
        '</div>' +
      '</div>';

    const list = cat.blocks;

    /* 类型切换 */
    $('[data-bf="type"]', el).addEventListener('change', (e) => {
      const nt = e.target.value;
      const conv = { type: nt, title: b.title };
      if (nt === 'text') conv.body = b.type === 'text' ? b.body : '';
      else if (nt === 'photos') conv.items = b.type === 'photos' ? b.items : [];
      else conv.items = [];
      cat.blocks[bi] = normalizeBlock(conv);
      renderEditorLists(); commit();
    });

    /* 通用字段 */
    $$('[data-bf]', el).forEach((inp) => {
      if (inp.dataset.bf === 'type') return;
      inp.addEventListener('input', () => { b[inp.dataset.bf] = inp.value; commit(); });
    });
    $$('[data-b]', el).forEach((inp) => {
      inp.addEventListener('input', () => {
        b.items = linesToItems(inp.value, b.type);
        commit();
      });
    });

    /* 折叠 */
    $('[data-act="collapse"]', el).addEventListener('click', (e) => {
      el.classList.toggle('collapsed');
      e.target.textContent = el.classList.contains('collapsed') ? '展开' : '收起';
    });

    /* 照片块 */
    if (b.type === 'photos') {
      const box = $('.photo-rows', el);
      const items = Array.isArray(b.items) ? b.items : (b.items = []);
      buildPhotoEditor(box, items);
    }

    /* 相册块 */
    if (b.type === 'albums') {
      const box = $('.album-rows', el);
      const albums = Array.isArray(b.items) ? b.items : (b.items = []);
      buildAlbumEditor(box, albums);
    }

    /* 上下移动 / 删除 */
    $$('[data-act]', el).forEach((btn) => {
      const act = btn.dataset.act;
      if (act !== 'blk-up' && act !== 'blk-down' && act !== 'blk-del') return;
      btn.addEventListener('click', () => {
        if (act === 'blk-del') list.splice(bi, 1);
        if (act === 'blk-up' && bi > 0) list.splice(bi - 1, 0, list.splice(bi, 1)[0]);
        if (act === 'blk-down' && bi < list.length - 1) list.splice(bi + 1, 0, list.splice(bi, 1)[0]);
        renderEditorLists(); commit();
      });
    });

    wrap.appendChild(el);
  }

  /* —— 分类编辑器 —— */
  function buildCategoryEditor(cat, i) {
    const el = document.createElement('div');
    el.className = 'row';
    const blkCount = Array.isArray(cat.blocks) ? cat.blocks.length : 0;
    el.innerHTML =
      '<div class="ed-sec">' +
        '<h3>这一面叫什么 <em>名字会显示在首页卡片和标题上</em></h3>' +
        '<div class="row-top">' +
          '<div class="thumb">' + esc(cat.glyph || pad2(i + 1)) + '</div>' +
          '<div class="grow"><input data-cf="name" value="' + esc(cat.name) + '" placeholder="这一面的名字"></div>' +
        '</div>' +
        '<div class="two">' +
          '<label class="field"><span>编号 <em>（卡片角上的字）</em></span><input data-cf="glyph" value="' + esc(cat.glyph) + '"></label>' +
          '<label class="field"><span>英文名</span><input data-cf="en" value="' + esc(cat.en) + '"></label>' +
        '</div>' +
        '<label class="field"><span>一句话说明</span><input data-cf="summary" value="' + esc(cat.summary) + '"></label>' +
        '<label class="field"><span>链接 id <em>（英文、唯一，改它等于换网址）</em></span><input data-cf="id" value="' + esc(cat.id) + '"></label>' +
      '</div>' +
      '<div class="ed-sec">' +
        '<h3>这一面的内容块 <i class="num">' + blkCount + '</i></h3>' +
        '<div class="blk-wrap"></div>' +
        '<div class="row-tools">' +
          '<button class="mini-btn ghost" data-act="blk-add" type="button">+ 内容块</button>' +
          '<button class="mini-btn ghost" data-act="up" type="button">↑ 上移</button>' +
          '<button class="mini-btn ghost" data-act="down" type="button">↓ 下移</button>' +
          '<button class="mini-btn danger" data-act="del" type="button">删除这一面</button>' +
        '</div>' +
      '</div>';

    $$('[data-cf]', el).forEach((inp) => {
      inp.addEventListener('input', () => {
        const key = inp.dataset.cf;
        cat[key] = inp.value;
        /* 改了 id 就等于换了链接：让地址栏和当前页面立刻跟上 */
        if (key === 'id' && cat.id === drawerCatId) {
          drawerCatId = inp.value;
          if (!$('#view-detail').hidden) location.hash = '#/' + inp.value;
        }
        if (key === 'name' && $('#dEditName')) $('#dEditName').textContent = inp.value;
        commit();
      });
    });

    const wrap = $('.blk-wrap', el);
    const blks = Array.isArray(cat.blocks) ? cat.blocks : (cat.blocks = []);
    blks.forEach((b, bi) => buildBlockEditor(cat, b, bi, wrap));

    $$('[data-act]', el).forEach((btn) => {
      const act = btn.dataset.act;
      if (!['blk-add', 'up', 'down', 'del'].includes(act)) return;
      btn.addEventListener('click', () => {
        if (act === 'blk-add') blks.push(normalizeBlock({ type: 'text', title: '新的内容块', body: '' }));
        if (act === 'del') state.categories.splice(i, 1);
        if (act === 'up' && i > 0) state.categories.splice(i - 1, 0, state.categories.splice(i, 1)[0]);
        if (act === 'down' && i < state.categories.length - 1) {
          state.categories.splice(i + 1, 0, state.categories.splice(i, 1)[0]);
        }
        renderEditorLists(); commit();
      });
    });

    return el;
  }

  /* 每个槽位可能出现在多个抽屉里，一律全部填充 */
  const slots = (name) => $$('[data-slot="' + name + '"]');

  /* 分区标题右边的数量，让人一眼知道这块有几条 */
  function setCount(id, n) {
    const el = document.getElementById(id);
    if (el) el.textContent = n;
  }

  function renderEditorLists() {
    /* 数字 */
    slots('stats').forEach((box) => {
      box.innerHTML = '';
      state.stats.forEach((x, i) => {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = '<div class="two">' +
          '<label class="field"><span>数字</span><input data-f="n" value="' + esc(x.n) + '"></label>' +
          '<label class="field"><span>说明</span><input data-f="l" value="' + esc(x.l) + '"></label>' +
          '</div>' + toolsHTML();
        $$('[data-f]', row).forEach((inp) => {
          inp.addEventListener('input', () => { x[inp.dataset.f] = inp.value; commit(); });
        });
        wireTools(row, state.stats, i);
        box.appendChild(row);
      });
    });

    /* 信息行 */
    slots('facts').forEach((box) => {
      box.innerHTML = '';
      state.facts.forEach((f, i) => {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = '<div class="two">' +
          '<label class="field"><span>名称</span><input data-f="k" value="' + esc(f.k) + '"></label>' +
          '<label class="field"><span>内容</span><input data-f="v" value="' + esc(f.v) + '"></label>' +
          '</div>' + toolsHTML();
        $$('[data-f]', row).forEach((inp) => {
          inp.addEventListener('input', () => { f[inp.dataset.f] = inp.value; commit(); });
        });
        wireTools(row, state.facts, i);
        box.appendChild(row);
      });
    });

    /* 我的几面（首页管理抽屉） */
    slots('cats').forEach((box) => {
      box.innerHTML = '';
      state.categories.forEach((c, i) => box.appendChild(buildCategoryEditor(c, i)));
    });

    /* 当前这一面（详情抽屉） */
    slots('detail').forEach((box) => {
      box.innerHTML = '';
      const cat = state.categories.find((c) => c.id === drawerCatId) ||
                  state.categories.find((c) => c.id === currentId());
      if (!cat) return;
      box.appendChild(buildCategoryEditor(cat, state.categories.indexOf(cat)));
    });

    /* 社交 */
    slots('socials').forEach((box) => {
      box.innerHTML = '';
      state.socials.forEach((x, i) => {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML =
          '<div class="row-top">' +
            '<div class="thumb">' + esc(x.badge || (x.name || '?').slice(0, 1)) + '</div>' +
            '<div class="grow"><input data-f="name" value="' + esc(x.name) + '" placeholder="平台名"></div>' +
          '</div>' +
          '<label class="field"><span>链接（留空则不可点击）</span>' +
          '<input data-f="url" value="' + esc(x.url) + '" placeholder="https://..."></label>' +
          '<div class="two">' +
            '<label class="field"><span>账号 / 备注</span><input data-f="note" value="' + esc(x.note) + '"></label>' +
            '<label class="field"><span>方框里的字</span><input data-f="badge" maxlength="2" value="' + esc(x.badge) + '"></label>' +
          '</div>' +
          '<label class="field"><span>二维码路径（可留空）</span>' +
          '<input data-f="qr" value="' + esc(x.qr) + '" placeholder="assets/photos/wechat-qr.png"></label>' +
          toolsHTML();
        $$('[data-f]', row).forEach((inp) => {
          inp.addEventListener('input', () => { x[inp.dataset.f] = inp.value; commit(); });
        });
        wireTools(row, state.socials, i);
        box.appendChild(row);
      });
    });

    /* 分区标题上的数量 */
    setCount('statCount', state.stats.length);
    setCount('factCount', state.facts.length);
    setCount('catCount', state.categories.length);
    setCount('socCount', state.socials.length);
  }

  /* —— 头像 —— */
  function renderAvatarPreview() {
    const box = $('#edAvatar');
    box.innerHTML = state.avatar
      ? '<img src="' + esc(state.avatar) + '" alt="">'
      : esc(initial(state.monogram || state.name));
  }

  /* 编辑器里的「上传照片」和直接点头像，走同一套处理 */
  async function applyAvatar(file) {
    if (!file) return;
    if (file.type && !/^image\//.test(file.type)) { toast('请选择图片文件'); return; }
    try {
      toast('正在处理图片…');
      state.avatar = await shrinkImage(file, 900, .86);
      renderAvatarPreview();
      commit();
      toast('头像已更新，已存在这台浏览器里');
    } catch (err) { toast(err.message || '图片处理失败'); }
  }

  $('#avatarFile').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    applyAvatar(f);
    e.target.value = '';
  });

  const avatarQuick = $('#avatarQuick');
  if (avatarQuick) {
    avatarQuick.addEventListener('change', (e) => {
      applyAvatar(e.target.files && e.target.files[0]);
      e.target.value = '';
    });
    const av = $('#avatar');
    if (av) {
      av.addEventListener('click', () => avatarQuick.click());
      av.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); avatarQuick.click(); }
      });
    }
  }

  $('#avatarClear').addEventListener('click', () => {
    state.avatar = ''; renderAvatarPreview(); commit();
  });

  /* ══════════════════════════════════════════════════════════════════
     四、坐标：一键请求浏览器定位，或者自己填
     页面本身不联网；只有点「📍 定位我」时才会问浏览器要位置。
     ══════════════════════════════════════════════════════════════════ */
  /* 这几个用函数声明，因为它们会被更早执行的 updateTelemetry 调到 */
  function num(v) { return typeof v === 'number' && isFinite(v); }
  function fmtAxis(v, pos, neg) { return Math.abs(v).toFixed(4) + '° ' + (v >= 0 ? pos : neg); }

  function coordText(c) {
    if (!c || !num(c.lat) || !num(c.lng)) return '—';
    return fmtAxis(c.lat, 'N', 'S') + ' · ' + fmtAxis(c.lng, 'E', 'W');
  }

  function agoText(t) {
    if (!t) return '';
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 15) return '刚刚';
    if (s < 60) return s + ' 秒前';
    if (s < 3600) return Math.round(s / 60) + ' 分钟前';
    if (s < 86400) return Math.round(s / 3600) + ' 小时前';
    return Math.round(s / 86400) + ' 天前';
  }

  function tzText() {
    const off = -new Date().getTimezoneOffset() / 60;
    return 'GMT' + (off >= 0 ? '+' : '') + off;
  }

  function renderCoords() {
    const val = $('#coordVal'), meta = $('#coordMeta');
    if (!val || !meta) return;
    const c = state.coords || {};
    val.textContent = coordText(c);
    if (!num(c.lat) || !num(c.lng)) {
      meta.textContent = geoPerm === 'denied'
        ? '定位权限被浏览器挡住了，点「📍 定位我」看怎么开'
        : '还没有坐标，点「📍 定位我」或「手填」';
      return;
    }
    const bits = [SRC_LABEL[c.source] || '手填'];
    if (c.acc && c.source === 'gps') bits.push('精度 ±' + Math.round(c.acc) + ' 米');
    if (c.at) bits.push(agoText(c.at));
    if (watchId !== null) bits.push('跟随中');
    meta.innerHTML = (watchId !== null ? '<i class="live-dot"></i>' : '') + esc(bits.join(' · '));
  }

  function fillCoordForm() {
    const c = state.coords || {};
    if ($('#f-lat')) $('#f-lat').value = num(c.lat) ? String(c.lat) : '';
    if ($('#f-lng')) $('#f-lng').value = num(c.lng) ? String(c.lng) : '';
  }

  function setCoords(lat, lng, extra) {
    state.coords = Object.assign({
      lat: Number(lat), lng: Number(lng), acc: 0, at: Date.now(), source: 'manual'
    }, extra || {});
    renderCoords();
    commit();
  }

  function gpsFail(err) {
    const code = err && err.code;
    if (code === 1) { geoPerm = 'denied'; showGeo('denied'); return; }
    toast({
      2: '暂时拿不到位置：系统的定位服务可能关着，或信号太弱。',
      3: '定位超时了，再试一次，或者用网络粗略定位 / 手填。'
    }[code] || '定位失败，可以直接手填坐标。');
  }

  function stopFollow() {
    if (watchId === null) return;
    try { navigator.geolocation.clearWatch(watchId); } catch (e) {}
    watchId = null;
    const b = $('#locFollow');
    if (b) { b.classList.remove('on'); b.textContent = '跟随'; }
    renderCoords();
  }

  /* 先问浏览器：这个站点的定位权限现在是什么状态 */
  function geoPermission() {
    if (!navigator.permissions || !navigator.permissions.query) {
      return Promise.resolve('unknown');
    }
    return navigator.permissions.query({ name: 'geolocation' })
      .then((st) => st.state || 'unknown')
      .catch(() => 'unknown');
  }

  /* 真的要位置：这一步会触发浏览器自己那个「允许 / 阻止」小窗 */
  function geoRequest() {
    toast('正在定位…');
    navigator.geolocation.getCurrentPosition((pos) => {
      const c = pos.coords;
      geoPerm = 'granted';
      setCoords(c.latitude, c.longitude, {
        acc: Math.round(c.accuracy || 0), source: 'gps'
      });
      toast('已定位：' + coordText(state.coords));
      reverseGeocode(c.latitude, c.longitude);
    }, gpsFail, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
  }

  function locate() {
    if (!navigator.geolocation) { showGeo('unsupported'); return; }
    if (location.protocol === 'file:') { showGeo('file'); return; }
    geoPermission().then((st) => {
      geoPerm = st;
      /* 已经允许过：直接定位，不再打扰
         还没决定过：先弹我们自己的说明卡，点「允许并定位」再让浏览器问
         被阻止过：浏览器不会再问了，给开启步骤 + 两条替代路 */
      if (st === 'granted') { geoRequest(); return; }
      showGeo(st === 'denied' ? 'denied' : 'ask');
    });
  }

  /* —— 页内说明卡：把「为什么」和「接下来怎么办」讲清楚 —— */
  const geoEl = $('#geo');

  function browserName() {
    const ua = navigator.userAgent || '';
    if (/Edg\//.test(ua)) return 'Edge';
    if (/OPR\//.test(ua)) return 'Opera';
    if (/Firefox\//.test(ua)) return 'Firefox';
    if (/Chrome\//.test(ua)) return 'Chrome';
    if (/Safari\//.test(ua)) return 'Safari';
    return '';
  }

  function permSteps() {
    const b = browserName();
    if (b === 'Safari') return [
      '点屏幕左上角菜单栏的「Safari」→「设置」',
      '选「网站」，左边找到「位置」',
      '在列表里找到这个网址，把权限改成「允许」',
      '刷新本页'
    ];
    if (b === 'Firefox') return [
      '点地址栏左边那个「🔒」小锁',
      '把「位置」那一项改成「允许」',
      '刷新本页（或者点下面的「重新检测」）'
    ];
    return [
      '点地址栏左边那个「🔒」或「ⓘ」小图标',
      '在弹出的面板里，把「位置」从「阻止」改成「允许」',
      '关掉面板，刷新本页（或者点下面的「重新检测」）'
    ];
  }

  function geoBtn(act, label, primary) {
    return '<button class="mini-btn' + (primary ? ' primary' : '') +
      '" data-geo="' + act + '" type="button">' + label + '</button>';
  }

  function showGeo(mode) {
    if (!geoEl) return;
    const T = $('#geoTitle'), B = $('#geoBody'), A = $('#geoActs');
    if (!T || !B || !A) return;
    const b = browserName();

    if (mode === 'ask') {
      T.textContent = '读取你的位置，需要你点一下「允许」';
      B.innerHTML =
        '<p>接下来浏览器会自己弹一个小窗，问「是否允许获取你的位置」，' +
        '点<b>允许</b>就行。</p>' +
        '<p>位置只用来在这一页上显示坐标，不会上传，也不会发给别人。</p>';
      A.innerHTML = geoBtn('allow', '允许并定位', 1) +
        geoBtn('net', '不想授权：用网络粗略定位') + geoBtn('manual', '手填坐标');
    } else if (mode === 'denied') {
      T.textContent = '定位权限被浏览器挡住了';
      B.innerHTML =
        '<p>你之前点过「阻止」，浏览器就记住了：同一个网站它不会再问第二次。' +
        '这是浏览器的安全规矩，网页自己没法再弹窗求你同意。</p>' +
        '<p>手动开一次就好，以后一直有效' + (b ? '（' + esc(b) + ' 里这样点）：' : '：') + '</p>' +
        '<ol>' + permSteps().map((x) => '<li>' + esc(x) + '</li>').join('') + '</ol>' +
        '<p>还是不行的话，看一眼 Windows 的 <code>设置 → 隐私和安全性 → 位置</code> 有没有打开。</p>' +
        '<p>不想折腾也没关系，下面两条路一样能用。</p>';
      A.innerHTML = geoBtn('retry', '我已改好，重新检测') +
        geoBtn('net', '用网络粗略定位', 1) + geoBtn('manual', '手填坐标');
    } else if (mode === 'file') {
      T.textContent = '本地打开的文件不允许定位';
      B.innerHTML = '<p>你大概是直接双击 <code>index.html</code> 打开的吧？' +
        '浏览器规定 <code>file://</code> 打开的页面一律不给定位权限。</p>' +
        '<p>用线上网址打开就正常了；或者走下面两条路，一样能出坐标。</p>';
      A.innerHTML = geoBtn('net', '用网络粗略定位', 1) + geoBtn('manual', '手填坐标');
    } else if (mode === 'unsupported') {
      T.textContent = '这个浏览器不支持定位';
      B.innerHTML = '<p>换 Chrome / Edge / Safari 都可以，或者直接手填坐标。</p>';
      A.innerHTML = geoBtn('manual', '手填坐标', 1);
    } else {
      T.textContent = '网络定位也没成功';
      B.innerHTML = '<p>可能是没联网，或者网络定位服务这会儿不可用。手填最省事。</p>' +
        '<p>想找坐标：在地图上右键那个点，「复制坐标」出来的两个数就是' +
        '纬度在前、经度在后。</p>';
      A.innerHTML = geoBtn('manual', '手填坐标', 1) + geoBtn('retry', '再试一次');
    }

    geoEl.hidden = false;
    $$('[data-geo]', A).forEach((x) => {
      x.addEventListener('click', () => onGeoAct(x.dataset.geo));
    });
  }

  function hideGeo() { if (geoEl) geoEl.hidden = true; }

  function onGeoAct(act) {
    hideGeo();
    if (act === 'allow') { geoRequest(); return; }
    if (act === 'retry') {
      if (!navigator.geolocation) { showGeo('unsupported'); return; }
      geoPermission().then((st) => {
        geoPerm = st;
        if (st === 'denied') { showGeo('denied'); return; }
        geoRequest();
      });
      return;
    }
    if (act === 'net') { locateByNetwork(); return; }
    if (act === 'manual') { fillCoordForm(); setOpen('coord', true); }
  }

  /* —— 网络粗略定位：不用任何权限，代价是只精确到城市 —— */
  const NET_SOURCES = [
    { url: 'https://ipwho.is/',
      pick: (d) => (d && d.success !== false && num(d.latitude))
        ? { lat: d.latitude, lng: d.longitude, city: d.city, country: d.country } : null },
    { url: 'https://ipapi.co/json/',
      pick: (d) => (d && num(d.latitude))
        ? { lat: d.latitude, lng: d.longitude, city: d.city, country: d.country_name } : null }
  ];

  async function locateByNetwork() {
    if (typeof fetch !== 'function') { showGeo('netfail'); return; }
    toast('正在用网络粗略定位…');
    for (const src of NET_SOURCES) {
      try {
        const ctl = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = ctl ? setTimeout(() => ctl.abort(), 7000) : null;
        const res = await fetch(src.url, ctl ? { signal: ctl.signal } : undefined);
        if (timer) clearTimeout(timer);
        const data = await res.json();
        const hit = src.pick(data);
        if (!hit) continue;
        setCoords(hit.lat, hit.lng, { acc: 25000, source: 'ip' });
        if (hit.city || hit.country) {
          state.location = [hit.city, hit.country].filter(Boolean).join(' · ') +
            ' · ' + tzText();
          renderAll();
          commit();
        }
        toast('已定位到 ' + (hit.city || '大致位置') + '（大约 ±25 公里）');
        return;
      } catch (e) { /* 这个来源不行，换下一个 */ }
    }
    showGeo('netfail');
  }

  function toggleFollow() {
    if (watchId !== null) { stopFollow(); toast('已停止跟随'); return; }
    if (!navigator.geolocation) { toast('这个浏览器不支持定位'); return; }
    if (location.protocol === 'file:') { toast('用 file:// 打开时浏览器禁止定位'); return; }
    watchId = navigator.geolocation.watchPosition((pos) => {
      const c = pos.coords;
      setCoords(c.latitude, c.longitude, { acc: Math.round(c.accuracy || 0), source: 'gps' });
    }, gpsFail, { enableHighAccuracy: true, timeout: 20000, maximumAge: 3000 });
    const b = $('#locFollow');
    if (b) { b.classList.add('on'); b.textContent = '跟随中'; }
    toast('开始跟随你的位置（关掉页面就停）');
    renderCoords();
  }

  /* 想要城市名时才会请求一次公开的 OSM 反查；失败也只影响城市名。 */
  async function reverseGeocode(lat, lng) {
    if (typeof fetch !== 'function') return;
    try {
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), 8000) : null;
      const url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10' +
        '&accept-language=zh-CN&lat=' + lat.toFixed(4) + '&lon=' + lng.toFixed(4);
      const res = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
      if (timer) clearTimeout(timer);
      const data = await res.json();
      const a = (data && data.address) || {};
      const city = a.city || a.town || a.county || a.state || a.region || '';
      const country = a.country || '';
      if (city || country) {
        state.location = [city, country].filter(Boolean).join(' · ') + ' · ' + tzText();
        renderAll();
        commit();
        toast('已定位到 ' + (city || country));
      }
    } catch (e) {
      toast('已拿到坐标；城市名可以手填');
    }
  }

  if ($('#locBtn')) $('#locBtn').addEventListener('click', locate);
  if ($('#coordNow')) $('#coordNow').addEventListener('click', locate);
  if ($('#coordNet')) $('#coordNet').addEventListener('click', locateByNetwork);
  if ($('#locFollow')) $('#locFollow').addEventListener('click', toggleFollow);
  if ($('#locEdit')) {
    $('#locEdit').addEventListener('click', () => {
      if (isOpen('coord')) { setOpen('coord', false); return; }
      fillCoordForm();
      setOpen('coord', true);
    });
  }
  if ($('#coordDone')) {
    $('#coordDone').addEventListener('click', () => {
      const la = parseFloat($('#f-lat') ? $('#f-lat').value : '');
      const ln = parseFloat($('#f-lng') ? $('#f-lng').value : '');
      if (num(la) && num(ln)) {
        setCoords(la, ln, { source: 'manual' });
        toast('坐标已保存：' + coordText(state.coords));
      } else if ($('#f-lat') && $('#f-lat').value !== '' && $('#f-lng').value !== '') {
        toast('纬度要填 -90~90，经度要填 -180~180');
      }
    });
  }
  if ($('#coordClear')) {
    $('#coordClear').addEventListener('click', () => {
      state.coords = {};
      fillCoordForm();
      renderCoords();
      commit();
      toast('坐标已清空');
    });
  }
  ['f-lat', 'f-lng'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      const la = parseFloat($('#f-lat').value);
      const ln = parseFloat($('#f-lng').value);
      if (!num(la) || !num(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) return;
      setCoords(la, ln, { source: 'manual' });
    });
  });

  /* 说明卡的两种关法：右上角 ✕、点卡片外面 */
  if ($('#geoX')) $('#geoX').addEventListener('click', hideGeo);
  if (geoEl) {
    geoEl.addEventListener('click', (e) => { if (e.target === geoEl) hideGeo(); });
  }

  /* ══════════════════════════════════════════════════════════════════
     五、配色：页脚抽屉里的三个按钮（黑 / 灰 / 白）
     ══════════════════════════════════════════════════════════════════ */
  $$('[data-theme-set]').forEach((b) => {
    b.addEventListener('click', () => {
      const id = applyTheme(b.dataset.themeSet);
      const t = THEMES.find((x) => x.id === id);
      toast('配色换成「' + t.name + '」');
    });
  });
  applyTheme(document.documentElement.getAttribute('data-theme') || 'obsidian');

  /* —— 导出 / 复制 / 重置 —— */
  const configText = () =>
    '/* 由页面上的编辑功能生成 · 用它覆盖 profile.js 即可永久生效 */\n' +
    'window.PROFILE = ' + JSON.stringify(state, null, 2) + ';\n';

  $('#exportBtn').addEventListener('click', () => {
    const blob = new Blob([configText()], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'profile.js';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    toast('已下载 profile.js，覆盖同名文件即可');
  });
  $('#copyConfig').addEventListener('click', async () => {
    const ok = await copyText(configText());
    toast(ok ? '配置已复制到剪贴板' : '复制失败，请改用「下载 profile.js」');
  });
  $('#resetBtn').addEventListener('click', () => {
    localStorage.removeItem(STORE_KEY);
    state = clone(DEFAULTS);
    renderEditorLists(); syncFields(); commit();
    toast('已恢复为 profile.js 里的内容');
  });

  /* ══ 启动 ══════════════════════════════════════════════════════════ */
  renderAll();
  route();
  syncFields();
  syncOpenButtons();
  attachTilt($('.console'), 4);
  setInterval(updateTelemetry, 1000);
  setTimeout(() => { settle = true; }, 1500);

  /* —— 截图用的开关（平时访问完全不受影响）：
        ?shot=1&theme=paper&open=hero&y=900&go=%23/about
        只有带 ?shot 才会执行，用来把某个状态摆好给我「看」一眼。 —— */
  (function shotHook() {
    let p = null;
    try { p = new URLSearchParams(location.search); } catch (e) { return; }
    if (!p || !p.has('shot')) return;
    const t = p.get('theme');
    if (t) applyTheme(t);
    const go = p.get('go');
    if (go) location.hash = go;
    const y = parseInt(p.get('y') || '0', 10);
    if (y > 0) setTimeout(() => { try { scrollTo(0, y); } catch (e) {} }, 60);
    const open = p.get('open');
    if (open) setTimeout(() => setOpen(open, true), 150);
  })();
})();
