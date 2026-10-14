/* ══════════════════════════════════════════════════════════════════════════
   app.js —— 路由 · 内容渲染 · 玻璃交互
   ──────────────────────────────────────────────────────────────────────────
   这个文件只管“怎么显示”。要改内容，改 profile.js。
   不做的事：不写 localStorage、不联网、不请求定位、没有编辑器。
   ══════════════════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ══ 小工具 ══════════════════════════════════════════════════════ */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /* 正文里用 **两个字** 表示加粗 */
  const fmt = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const pad2 = (n) => String(n).padStart(2, '0');
  const initial = (s) => (String(s || '').trim()[0] || 'Y').toUpperCase();

  /* ══ 规范化：profile.js 少写了字段也不会崩 ══════════════════════ */
  const BLOCK_TYPES = ['text', 'list', 'tags', 'stats', 'timeline', 'links', 'photos', 'albums'];

  function normalizeBlock(b) {
    const src = b || {};
    const type = BLOCK_TYPES.includes(src.type) ? src.type : 'text';
    const items = Array.isArray(src.items) ? src.items : [];
    const out = { type, title: src.title || '' };
    if (type === 'text') out.body = src.body || '';
    else if (type === 'albums') {
      out.items = items.map((a) => ({
        name: (a && a.name) || '未命名相册',
        desc: (a && a.desc) || '',
        photos: (a && Array.isArray(a.photos)) ? a.photos : []
      }));
    } else out.items = items;
    return out;
  }

  function normalizeCategory(c, i) {
    const src = c || {};
    return {
      id: src.id || 'node-' + (i + 1),
      glyph: src.glyph || pad2(i + 1),
      name: src.name || '未命名分类',
      en: src.en || 'CATEGORY',
      summary: src.summary || '',
      blocks: Array.isArray(src.blocks) ? src.blocks.map(normalizeBlock) : []
    };
  }

  function normalize(p) {
    const src = p || {};
    return {
      name: src.name || '你的名字',
      brand: src.brand || src.name || '你的名字',
      monogram: src.monogram || initial(src.name),
      role: src.role || '身份 / 头衔',
      available: src.available || '开放合作',
      statement: src.statement || '一句话介绍你自己。',
      accent: src.accent || '',
      avatar: src.avatar || '',
      stats: Array.isArray(src.stats) ? src.stats : [],
      focus: Array.isArray(src.focus) ? src.focus : [],
      categories: Array.isArray(src.categories) ? src.categories.map(normalizeCategory) : [],
      socials: Array.isArray(src.socials) ? src.socials : [],
      email: src.email || 'hello@example.com',
      emailLabel: src.emailLabel || '有想法，随时聊聊。',
      copyright: src.copyright || '© 2025 你的名字'
    };
  }

  const state = normalize(window.PROFILE);

  /* ══ 渲染：首页 ══════════════════════════════════════════════════ */
  function renderHome() {
    $('#brandName').textContent = state.brand;
    $('#brandGlyph').textContent = initial(state.monogram || state.name);
    $('#available').textContent = state.available;
    $('#name').textContent = state.name;
    $('#role').textContent = state.role;

    /* 一句话主张：accent 那段单独高亮 */
    const text = esc(state.statement);
    const acc = esc(state.accent);
    $('#statement').innerHTML = state.accent && state.statement.includes(state.accent)
      ? text.replace(acc, '<em>' + acc + '</em>')
      : text;

    /* 标签 */
    $('#focusList').innerHTML = state.focus.filter(Boolean)
      .map((t) => '<span class="chip">' + esc(t) + '</span>').join('');

    /* 头像 */
    const av = $('#avatar');
    av.textContent = '';
    if (state.avatar) {
      const img = document.createElement('img');
      img.src = state.avatar;
      img.alt = state.name;
      img.addEventListener('error', () => { av.textContent = initial(state.monogram || state.name); });
      av.appendChild(img);
    } else {
      av.textContent = initial(state.monogram || state.name);
    }

    /* 我的几面：五张等大的玻璃卡 */
    $('#facetGrid').innerHTML = state.categories.map((c) =>
      '<button class="facet glass reveal" type="button" data-id="' + esc(c.id) + '">' +
        '<span class="facet-top">' +
          '<span class="facet-index">' + esc(c.glyph) + '</span>' +
          '<span class="mono facet-en">' + esc(c.en) + '</span>' +
        '</span>' +
        '<span class="facet-name">' + esc(c.name) + '</span>' +
        '<span class="facet-summary">' + esc(c.summary) + '</span>' +
        '<span class="facet-go"><span>展开</span><span class="arrow">→</span></span>' +
      '</button>').join('');

    /* 数字带 */
    $('#statsList').innerHTML = state.stats.filter((x) => x && (x.n || x.l))
      .map((x) => '<div class="stat reveal">' +
        '<div class="n">' + esc(x.n) + '</div>' +
        '<div class="l">' + esc(x.l) + '</div></div>').join('');

    /* 联系方式 */
    $('#emailLabel').textContent = state.emailLabel;
    $('#emailText').textContent = state.email;
    $('#emailLink').setAttribute('href', 'mailto:' + state.email);
    $('#socialGrid').innerHTML = state.socials.filter((x) => x && x.name).map(socialHTML).join('');
    $('#copyright').textContent = state.copyright;

    wireFacets();
    observeReveals();
  }

  function socialHTML(x) {
    const badge = esc(x.badge || x.name.slice(0, 1));
    const hasUrl = !!x.url;
    const tag = hasUrl ? 'a' : 'div';
    const attrs = hasUrl
      ? ' href="' + esc(x.url) + '" target="_blank" rel="noopener"' : '';
    const qr = x.qr
      ? '<span class="qr-pop"><img src="' + esc(x.qr) + '" alt="' + esc(x.name) +
        ' 二维码" loading="lazy" /><span>' + esc(x.name) + '</span></span>'
      : '';
    return '<' + tag + ' class="social' + (hasUrl ? '' : ' locked') + '"' + attrs + '>' +
      '<span class="badge">' + badge + '</span>' +
      '<span class="social-meta"><span class="nm">' + esc(x.name) + '</span>' +
      (x.note ? '<span class="nt">' + esc(x.note) + '</span>' : '') + '</span>' +
      (hasUrl ? '<span class="go">↗</span>' : '') + qr +
      '</' + tag + '>';
  }

  function wireFacets() {
    $$('.facet', $('#facetGrid')).forEach((el) => {
      el.addEventListener('click', () => { location.hash = '#/' + el.dataset.id; });
    });
  }

  /* ══ 渲染：分类详情 ══════════════════════════════════════════════ */
  let albumFilter = {};     /* 每个相册块当前选中的相册，0 = 全部 */
  let lastCatId = null;

  const currentId = () => decodeURIComponent(location.hash.replace(/^#\/?/, ''));

  function photoCardHTML(p, i, albumName) {
    if (!p || !p.src) return '';
    return '<div class="photo" role="button" tabindex="0" data-p="' + i + '" ' +
      'aria-label="查看照片：' + esc(p.title || '') + '">' +
      '<div class="photo-media">' +
        '<span class="photo-idx">' + pad2(i + 1) + '</span>' +
        (albumName ? '<span class="photo-album">' + esc(albumName) + '</span>' : '') +
        '<img src="' + esc(p.src) + '" alt="' + esc(p.title || '') + '" loading="lazy" />' +
      '</div>' +
      '<div class="photo-body"><h3>' + esc(p.title || '未命名') + '</h3>' +
      (p.caption ? '<p>' + esc(p.caption) + '</p>' : '') + '</div></div>';
  }

  /* 把相册摊平成一条网格列表；filter = 0 表示全部 */
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
    const chip = (idx, label, n) =>
      '<button class="chip' + (filter === idx ? ' on' : '') + '" type="button" data-a="' + idx + '">' +
      esc(label) + '<em>' + n + '</em></button>';
    return chip(0, '全部', flattenAlbums(albums, 0).length) +
      albums.map((a, i) => chip(i + 1, a.name || '未命名相册', flattenAlbums(albums, i + 1).length)).join('');
  }

  function blockHTML(b, i) {
    const title = b.title
      ? '<h3 class="block-title"><span class="mono">' + pad2(i + 1) + '</span>' + esc(b.title) + '</h3>'
      : '';
    const head = '<div class="block glass reveal" data-bi="' + i + '">' + title;
    const items = Array.isArray(b.items) ? b.items : [];

    switch (b.type) {
      case 'text':
        return head + '<p class="block-body">' + fmt(b.body) + '</p></div>';

      case 'list':
        return head + '<ul class="block-list">' +
          items.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div>';

      case 'tags':
        return head + '<div class="chips">' +
          items.map((x) => '<span class="chip">' + esc(x) + '</span>').join('') + '</div></div>';

      case 'stats':
        return head + '<div class="block-stats">' + items.map((x) =>
          '<div class="bs"><div class="n">' + esc(x.n) + '</div>' +
          '<div class="l">' + esc(x.l) + '</div></div>').join('') + '</div></div>';

      case 'timeline':
        return head + '<ul class="timeline">' + items.map((x) =>
          '<li><div class="t-time">' + esc(x.time) + '</div>' +
          '<div class="t-title">' + esc(x.title) + '</div>' +
          (x.desc ? '<div class="t-desc">' + esc(x.desc) + '</div>' : '') + '</li>').join('') +
          '</ul></div>';

      case 'links':
        return head + '<div class="link-grid">' + items.map((x) => {
          const tag = x.url ? 'a' : 'div';
          const attrs = x.url
            ? ' href="' + esc(x.url) + '" target="_blank" rel="noopener"' : '';
          return '<' + tag + ' class="link-card"' + attrs + '>' +
            '<span class="lc-dot"></span>' +
            '<span><span class="lc-name">' + esc(x.name) + '</span>' +
            (x.note ? '<span class="lc-note">' + esc(x.note) + '</span>' : '') + '</span>' +
            (x.url ? '<span class="lc-go">↗</span>' : '') + '</' + tag + '>';
        }).join('') + '</div></div>';

      case 'photos':
        return head + '<div class="photo-grid">' +
          items.map((p, j) => photoCardHTML(p, j, '')).join('') + '</div></div>';

      case 'albums': {
        const albums = items;
        const filter = albumFilter[i] || 0;
        const list = flattenAlbums(albums, filter);
        const cur = filter > 0 ? albums[filter - 1] : null;
        const note = cur && cur.desc ? cur.desc : '';
        return head +
          '<div class="album-bar"><div class="chips album-chips">' +
            albumChipsHTML(albums, filter) + '</div></div>' +
          '<p class="album-note"' + (note ? '' : ' hidden') + '>' + esc(note) + '</p>' +
          '<div class="photo-grid">' +
            (list.length
              ? list.map((x, j) => photoCardHTML(x.p, j, x.album)).join('')
              : '<p class="photo-empty">这个相册还没有照片。</p>') +
          '</div></div>';
      }

      default:
        return '';
    }
  }

  function renderDetail(id) {
    const cat = state.categories.find((c) => c.id === id);
    if (!cat) return false;

    /* 换了分类就重置相册筛选 */
    if (lastCatId !== id) { albumFilter = {}; lastCatId = id; }

    $('#dEn').textContent = cat.en;
    $('#dName').textContent = cat.name;
    $('#dSummary').textContent = cat.summary;
    $('#crumb').textContent = '我的几面 / ' + cat.name;

    $('#blocks').innerHTML = cat.blocks.length
      ? cat.blocks.map(blockHTML).join('')
      : '<div class="block glass reveal"><p class="block-body">这一面还没有内容。</p></div>';

    wireBlocks(cat);
    return true;
  }

  function wireBlocks(cat) {
    $$('#blocks .block').forEach((blockEl) => {
      const b = cat.blocks[+blockEl.dataset.bi];
      if (!b) return;

      if (b.type === 'photos') wirePhotoGrid(blockEl, () => b.items || []);

      if (b.type === 'albums') {
        const bi = +blockEl.dataset.bi;
        const albums = b.items || [];
        const chips = $$('.album-chips .chip', blockEl);

        const paint = () => {
          const filter = albumFilter[bi] || 0;
          const list = flattenAlbums(albums, filter);
          $('.photo-grid', blockEl).innerHTML = list.length
            ? list.map((x, j) => photoCardHTML(x.p, j, x.album)).join('')
            : '<p class="photo-empty">这个相册还没有照片。</p>';
          chips.forEach((c) => c.classList.toggle('on', +c.dataset.a === filter));
          const cur = filter > 0 ? albums[filter - 1] : null;
          const txt = cur && cur.desc ? cur.desc : '';
          const note = $('.album-note', blockEl);
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
    });
  }

  /* ══ 路由 ════════════════════════════════════════════════════════ */
  function route() {
    const id = currentId();
    const home = $('#view-home');
    const detail = $('#view-detail');
    const ok = id ? renderDetail(id) : false;

    const replay = (el) => {
      el.classList.remove('enter');
      void el.offsetWidth;
      el.classList.add('enter');
    };

    if (ok) {
      home.hidden = true;
      detail.hidden = false;
      document.title = state.categories.find((c) => c.id === id).name + ' · ' + state.name;
      $$('#hudNav button').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
      scrollTo({ top: 0, behavior: 'auto' });
      replay(detail);
    } else {
      detail.hidden = true;
      home.hidden = false;
      document.title = state.name + ' · 个人主页';
      $$('#hudNav button').forEach((b) => b.classList.remove('on'));
      replay(home);
    }
    observeReveals();
    onScroll();          /* 换页面后高度变了，重算背景位移 */
  }

  $('#hudNav').innerHTML = state.categories.map((c) =>
    '<button type="button" data-id="' + esc(c.id) + '">' + esc(c.name) + '</button>').join('');

  $$('#hudNav button').forEach((el) => {
    el.addEventListener('click', () => { location.hash = '#/' + el.dataset.id; });
  });

  $('#backBtn').addEventListener('click', () => { location.hash = '#/'; });
  $('#backBtn2').addEventListener('click', () => { location.hash = '#/'; });
  $('#brandLink').addEventListener('click', (e) => {
    if (!location.hash || location.hash === '#' || location.hash === '#/') return;
    e.preventDefault();
    location.hash = '#/';
  });

  addEventListener('hashchange', route);

  /* ══ 玻璃：跟着指针走的镜面反射 ══════════════════════════════════ */
  let lastX = 0, lastY = 0, hot = null, hotRaf = false;
  if (!reduceMotion && matchMedia('(hover:hover)').matches) {
    addEventListener('pointermove', (e) => {
      lastX = e.clientX; lastY = e.clientY;
      hot = e.target && e.target.closest ? e.target.closest('.glass') : null;
      if (hotRaf) return;
      hotRaf = true;
      requestAnimationFrame(() => {
        hotRaf = false;
        if (!hot) return;
        const r = hot.getBoundingClientRect();
        if (!r.width) return;
        hot.style.setProperty('--mx', ((lastX - r.left) / r.width * 100).toFixed(1) + '%');
        hot.style.setProperty('--my', ((lastY - r.top) / r.height * 100).toFixed(1) + '%');
      });
    }, { passive: true });
  }

  /* ══ 顶栏 + 背景流动 ═════════════════════════════════════════════
     --p = 页面滚动进度 0 → 1。背景各层在 CSS 里用各自的 --travel
     乘上它换算成位移，所以滚动时每一层的速度都不一样（视差），
     而且位移始终有界，不会滚出画面。
     ══════════════════════════════════════════════════════════════ */
  const hud = $('#hud');
  const root = document.documentElement;
  let sRaf = false;

  const scrollProgress = () => {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    return Math.min(1, Math.max(0, scrollY / max));
  };

  function onScroll() {
    hud.classList.toggle('stuck', scrollY > 8);
    if (sRaf) return;
    sRaf = true;
    requestAnimationFrame(() => {
      root.style.setProperty('--p', scrollProgress().toFixed(4));
      sRaf = false;
    });
  }
  onScroll();
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });

  /* ══ 时钟 ════════════════════════════════════════════════════════ */
  function tickClock() {
    const el = $('#clock');
    if (!el) return;
    const d = new Date();
    el.textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  tickClock();
  setInterval(tickClock, 20000);

  /* ══ 复制邮箱 ════════════════════════════════════════════════════ */
  $('#copyBtn').addEventListener('click', async () => {
    const ok = await copyText(state.email);
    const b = $('#copyBtn');
    b.textContent = ok ? '已复制 ✓' : '请手动复制';
    b.classList.toggle('done', ok);
    setTimeout(() => { b.textContent = '复制'; b.classList.remove('done'); }, 1800);
  });

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const t = document.createElement('textarea');
      t.value = text;
      t.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(t);
      t.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      t.remove();
      return ok;
    }
  }

  /* ══ 大图 ════════════════════════════════════════════════════════ */
  const lightbox = $('#lightbox');

  function openLightbox(p) {
    if (!p || !p.src) return;
    $('#lbImg').src = p.src;
    $('#lbImg').alt = p.title || '';
    $('#lbTitle').textContent = p.title || '';
    $('#lbCaption').textContent = p.caption || '';
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox() {
    lightbox.hidden = true;
    document.body.style.overflow = '';
  }

  $('#lbClose').addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lightbox.hidden) closeLightbox();
  });

  /* ══ 出场动画 ════════════════════════════════════════════════════ */
  let io = null;
  function observeReveals() {
    const items = $$('.reveal:not(.in)');
    if (!items.length) return;
    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('in'));
      return;
    }
    if (!io) {
      io = new IntersectionObserver((entries) => {
        let n = 0;
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.style.transitionDelay = Math.min(n++, 5) * 65 + 'ms';
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -10% 0px', threshold: .08 });
    }
    items.forEach((el) => io.observe(el));
  }

  /* ══ 启动 ════════════════════════════════════════════════════════ */
  renderHome();
  route();
})();
