/* ══════════════════════════════════════════════════════════════════════════
   glow.js —— 鼠标「纤细线条拖尾」
   Canvas 2D + requestAnimationFrame，零依赖、零构建、不联网。

   ── 它是怎么做到「完全跟手、又圆滑、还不会拉出直线」的 ──────────────────
   ① 记录的是**鼠标真实走过的轨迹**：每个 pointermove 事件里再用
      getCoalescedEvents() 取出浏览器合并掉的高频采样（一次事件可能含 2~8 个
      点），逐个收进轨迹。所以点的密度跟着鼠标速度走，快甩也有细节。
      —— 上一版用的是「线头按半衰期追赶鼠标」，线头离得远时会沿
      「起点 → 鼠标」的**直线**补点，于是屏幕上出现一条从另一头拉过来的
      橡皮筋。这个设计已彻底去掉：线头永远就在鼠标位置上。
   ② 采样点之间用 Catmull-Rom 转三次贝塞尔，再按 step 像素重新加密
      （默认 2.5px）后才描边，所以路径本身是连续曲线，没有直段接缝。
   ③ 跳变就断笔（jumpPx / holdMs）：一次移动跨得太远、或隔太久又位移明显、
      或鼠标移出窗口再回来 —— 一律**另起一段**，两段之间不连线。
      于是「从屏幕一头拉一条直线到鼠标」这种情况在物理上不可能发生。
   ④ 颜色用「沿路径的渐变」，每个控制点按年龄取色标 —— 头亮尾淡连续过渡。
   ⑤ 描边只画整条路径两次（外发光 + 本体），不是每段各画一次。

   ┌─ 层级（两张 canvas）────────────────────────────────────────────────┐
   │ #glow（在 .bg 里，z-index:0）→ 柔光层，会被玻璃卡的磨砂糊开，       │
   │      在卡片上留一层朦胧光感（bloom 控制强弱）。                     │
   │ #glowTop（fixed，z-index:35）→ 锐利层，在正文与卡片之上、顶栏(40)   │
   │      与灯箱(90) 之下（线从顶栏底下穿过）。两张都 pointer-events:none│
   └──────────────────────────────────────────────────────────────────────┘

   ══════════════ 想改手感，只改下面 CFG 里的数字，别处都不用动 ══════════════

     ── 跟手程度 / 圆滑度 ──
     gap          每隔多少 px 记一个控制点。默认 6。
                  越小越细腻（4~6 很棒），越大越省性能但拐弯会钝一点。
     step         加密后的点间距 (px)。默认 2.5。越小越圆滑、越费一点点性能；
                  1.5 几乎完美，4 以上会重新看出直段。
     tension      Catmull-Rom 的张力（0.05~0.25）。默认 0.17。
                  大了拐弯更「甩」，小了更贴原轨迹。
     jumpPx       一次移动跨过多少 px 就断笔、不连线。默认 180。
                  这就是「不会拉出橡皮筋」的阈值。
     holdMs       隔多久（ms）再动、且位移明显，就断笔。默认 220。
                  鼠标移出窗口再回来也走这条。

     ── 外观 ──
     color        线条颜色 (r,g,b)。默认 (145,160,175) 冷灰蓝。
     lineAlpha    线头最高不透明度。默认 0.40。★ 深浅总开关。
     lineWidth    线条粗细 (px)。默认 1.8（1.5~2.5）。
     glowRatio    外发光的相对宽度（1.9 = 比本体宽 1.9 倍）。
     glowAlpha    外发光的相对透明度（0.30 = 本体的 30%）。
     bloom        底层柔光的强度 0~1（默认 0.30）。设 0 = 卡片上完全没有朦胧光。

     ── 存在感 / 消失 ──
     lifeMs       一个点从生到灭的总时长 (ms)，默认 950。★ 尾巴长短。
     idleMs       停手多久后开始「整条淡出」。默认 260。
     fadeMs       整条淡出用多久。默认 440。★ 消失快慢 = idleMs + fadeMs。
     maxPts       控制点数量上限（默认 26），防止极速甩动时尾巴无限长。

     验收：控制台里 window.__glow.stats()（看 runs / chord / maxTurn 三个指标：
           runs = 分了几段，chord = 段内最长的控制点间距，正常应远小于 jumpPx）。
     ══════════════════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const topC = document.getElementById('glowTop');
  const botC = document.getElementById('glow');
  if (!botC && !topC) return;

  const ctx = botC ? botC.getContext('2d', { alpha: true }) : null;
  const ctxTop = topC ? topC.getContext('2d', { alpha: true }) : null;
  if (!ctx && !ctxTop) return;

  let reduce = false;
  try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { reduce = false; }

  const CFG = {
    /* 颜色 / 深浅 / 粗细 */
    color: [145, 160, 175],
    lineAlpha: 0.40,
    lineWidth: 1.8,
    glowRatio: 1.9,
    glowAlpha: 0.30,
    bloom: 0.30,
    /* 跟手 / 圆滑 / 断笔 */
    gap: 6,
    step: 2.5,
    tension: 0.17,
    jumpPx: 180,
    holdMs: 220,
    /* 存在感 / 消失 */
    lifeMs: 950,
    maxPts: 26,
    idleMs: 260,
    fadeMs: 440,
    /* 旧调参名兼容：trailMs 就是尾巴长度 */
    trailMs: null
  };
  if (reduce) { CFG.lifeMs = 800; CFG.maxPts = 20; CFG.lineAlpha = 0.30; }

  try {
    Object.defineProperty(CFG, 'trailMs', {
      get() { return this.lifeMs; },
      set(v) { if (v) this.lifeMs = Number(v); }
    });
  } catch (e) { /* 老浏览器不支持也无所谓 */ }

  let W = 0, H = 0, dpr = 1;
  let running = false, raf = 0, hidden = false;
  let lastMove = 0;
  let lastSX = null, lastSY = null, lastST = 0, pendingBrk = true;

  /* 控制点 { x, y, born, brk } —— brk:true 表示「从这里另起一段」 */
  const pts = [];
  const stats = { frames: 0, paints: 0, clockMs: 0, points: 0, verts: 0, runs: 0,
                  chord: 0, alpha: 0, maxTurn: 0, running: false, reduce: reduce,
                  twoLayer: !!(ctxTop && ctx) };

  function fit(c, cx) {
    if (!c || !cx) return;
    const r = c.getBoundingClientRect();
    let w = r.width, h = r.height;
    if (w < 2 || h < 2) { w = innerWidth; h = innerHeight; }   /* 还隐藏着时的兜底 */
    W = Math.max(1, Math.round(w * dpr));
    H = Math.max(1, Math.round(h * dpr));
    c.width = W; c.height = H;
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    fit(botC, ctx);
    fit(topC, ctxTop);
  }

  function clearOne(cx) {
    if (!cx) return;
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.clearRect(0, 0, W, H);
  }
  function clearAll() { clearOne(ctx); clearOne(ctxTop); }

  /* ── Catmull-Rom（p1,p2 之间）→ 三次贝塞尔控制点 ────────────────────────
     控制点夹在两点之间、切线过长就缩到 1/3 以内（「带夹取的 Catmull-Rom」）。
     标准写法在只有 2~3 个点、或急转弯时会让曲线冲出去绕个小圈（端点没有
     邻居、切线取错），夹取之后就只剩圆弧，绝不会甩出去。 */
  function cm(x0, y0, x1, y1, x2, y2, x3, y3, out) {
    const ten = Math.min(0.25, Math.max(0.05, CFG.tension));
    const seg = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
    const cap = seg * 0.34;                     /* 控制臂长度上限 */

    let c1x = x1 + (x2 - x0) * ten, c1y = y1 + (y2 - y0) * ten;
    let adx = c1x - x1, ady = c1y - y1;
    let l = Math.sqrt(adx * adx + ady * ady);
    if (l > cap) { const f = cap / l; adx *= f; ady *= f; c1x = x1 + adx; c1y = y1 + ady; l = cap; }
    if (l !== 0) {                              /* 沿 p1→p2 方向拉回：保证控制点在两点之间 */
      const ux = (x2 - x1) / (seg || 1), uy = (y2 - y1) / (seg || 1);
      const proj = adx * ux + ady * uy;
      if (proj < 0) { adx -= proj * ux; ady -= proj * uy; c1x = x1 + adx; c1y = y1 + ady; }
      else if (proj > seg) { const d = proj - seg; adx -= d * ux; ady -= d * uy; c1x = x1 + adx; c1y = y1 + ady; }
      const bl = Math.sqrt(adx * adx + ady * ady);
      if (bl > cap) { const f = cap / bl; c1x = x1 + adx * f; c1y = y1 + ady * f; }
    }

    let c2x = x2 - (x3 - x1) * ten, c2y = y2 - (y3 - y1) * ten;
    let bdx = c2x - x2, bdy = c2y - y2;
    l = Math.sqrt(bdx * bdx + bdy * bdy);
    if (l > cap) { const f = cap / l; bdx *= f; bdy *= f; c2x = x2 + bdx; c2y = y2 + bdy; l = cap; }
    if (l !== 0) {
      const ux = (x1 - x2) / (seg || 1), uy = (y1 - y2) / (seg || 1);
      const proj = bdx * ux + bdy * uy;
      if (proj < 0) { bdx -= proj * ux; bdy -= proj * uy; c2x = x2 + bdx; c2y = y2 + bdy; }
      else if (proj > seg) { const d = proj - seg; bdx -= d * ux; bdy -= d * uy; c2x = x2 + bdx; c2y = y2 + bdy; }
      const bl = Math.sqrt(bdx * bdx + bdy * bdy);
      if (bl > cap) { const f = cap / bl; c2x = x2 + bdx * f; c2y = y2 + bdy * f; }
    }

    out[0] = c1x; out[1] = c1y; out[2] = c2x; out[3] = c2y;
  }

  /* ── 核心：把控制点变成「加密好的连续曲线」，并且按段（run）切开 ────────
     返回 { v:[x,y,...], from:[控制点下标], tp:[段内比例], runStart:[每段起点] }。
     被 brk 标记的点是本段第一个点 —— 它与前一个点之间不连线。 */
  function buildPath(now) {
    const n = pts.length;
    const v = [], from = [], tp = [], runStart = [];
    stats.runs = 0; stats.chord = 0; stats.maxTurn = 0;
    if (n < 2) return { v: v, from: from, tp: tp, runStart: runStart };

    const c = [0, 0, 0, 0];
    let s = 0, chord = 0, runs = 0;

    while (s < n) {
      let e = s;                                   /* 本段的最后一个控制点 */
      while (e + 1 < n && !pts[e + 1].brk) e++;
      runs++;
      runStart.push(v.length / 2);

      let curX = pts[s].x, curY = pts[s].y;
      v.push(curX, curY); from.push(s); tp.push(0);

      for (let i = s; i < e; i++) {
        const p0 = pts[i > s ? i - 1 : s];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2 <= e ? i + 2 : e];
        const segLen = Math.sqrt((p2.x - p1.x) * (p2.x - p1.x) + (p2.y - p1.y) * (p2.y - p1.y));
        if (segLen > chord) chord = segLen;
        cm(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y, c);

        const d1 = Math.max(1e-4, Math.sqrt((c[0] - p1.x) * (c[0] - p1.x) + (c[1] - p1.y) * (c[1] - p1.y)));
        const d2 = Math.max(1e-4, Math.sqrt((p2.x - c[2]) * (p2.x - c[2]) + (p2.y - c[3]) * (p2.y - c[3])));
        const est = (d1 + d2 + segLen) * 0.5 + 1e-3;

        const sp = Math.min(64, Math.max(2, Math.round(est / CFG.step)));
        const inv = 1 / sp;
        let px = curX, py = curY;
        for (let k = 1; k <= sp; k++) {
          const t = k * inv, it = 1 - t;
          const a = it * it * it, b = 3 * it * it * t, cc2 = 3 * it * t * t, dd = t * t * t;
          const x = a * p1.x + b * c[0] + cc2 * c[2] + dd * p2.x;
          const y = a * p1.y + b * c[1] + cc2 * c[3] + dd * p2.y;
          const sdx = x - px, sdy = y - py;
          if (sdx * sdx + sdy * sdy >= 0.30) {              /* 太密的丢一点，保持 ≈step */
            v.push(x, y); from.push(i + (t > 0.5 ? 1 : 0)); tp.push(t);
            px = x; py = y;
          }
        }
        curX = p2.x; curY = p2.y;
      }

      /* 补上本段终点，让线头正好落在最后一个控制点上 */
      const lx = v[v.length - 2], ly = v[v.length - 1];
      if ((lx - pts[e].x) * (lx - pts[e].x) + (ly - pts[e].y) * (ly - pts[e].y) > 0.09) {
        v.push(pts[e].x, pts[e].y); from.push(e); tp.push(1);
      } else { from[from.length - 1] = e; tp[tp.length - 1] = 1; }

      s = e + 1;
    }

    /* 最大转角只在同一段内部算（跨段的断口不参与），作为「够不够圆滑」的指标 */
    const nodes = v.length / 2;
    let maxTurn = 0;
    for (let r = 0; r < runStart.length; r++) {
      const a = runStart[r];
      const b = (r + 1 < runStart.length ? runStart[r + 1] : nodes) - 1;
      for (let i = a + 1; i < b; i++) {
        const ax = v[i * 2] - v[(i - 1) * 2], ay = v[i * 2 + 1] - v[(i - 1) * 2 + 1];
        const bx = v[(i + 1) * 2] - v[i * 2], by = v[(i + 1) * 2 + 1] - v[i * 2 + 1];
        const la = Math.sqrt(ax * ax + ay * ay), lb = Math.sqrt(bx * bx + by * by);
        if (la < 1e-6 || lb < 1e-6) continue;
        let cosT = (ax * bx + ay * by) / (la * lb);
        if (cosT > 1) cosT = 1; else if (cosT < -1) cosT = -1;
        const ang = Math.acos(cosT) * 57.29578;
        if (ang > maxTurn) maxTurn = ang;
      }
    }
    stats.chord = +chord.toFixed(1);
    stats.runs = runs;
    stats.maxTurn = +maxTurn.toFixed(2);
    return { v: v, from: from, tp: tp, runStart: runStart };
  }

  /* 控制点的「生命值」：年龄 / lifeMs，头 1 → 尾 0 */
  function normAge(born, now) {
    const t = (now - born) / CFG.lifeMs;
    return t <= 0 ? 1 : (t >= 1 ? 0 : 1 - t);
  }

  /* 停手后的「整条淡出」系数：1 = 正常，0 = 已经淡没了 */
  function stopFade(now) {
    if (lastMove <= 0) return 1;
    const d = now - lastMove - CFG.idleMs;
    if (d <= 0) return 1;
    const f = 1 - d / Math.max(1, CFG.fadeMs);
    return f <= 0 ? 0 : f;
  }

  /* 沿路径拿年龄取色标 —— 头亮尾淡，连续过渡 */
  function stops(path, now) {
    const { v, from } = path;
    const nodes = v.length / 2;
    const out = [];
    const sf = stopFade(now);
    for (let i = 0; i < nodes; i += 2) {
      const j = from[i], k = i / (nodes - 1 || 1);
      const a = normAge(pts[j] ? pts[j].born : now, now) * sf * (1 - k * 0.10);
      out.push({ k: k, a: a < 0 ? 0 : a });
    }
    const last = out[out.length - 1];
    if (!last || last.k < 1) out.push({ k: 1, a: 0 });
    return out;
  }

  /* 逐段描边：段与段之间不连笔，所以永远不会出现横跨屏幕的直线 */
  function strokePath(cx, path, width) {
    const { v, runStart } = path;
    const nodes = v.length / 2;
    if (nodes < 2) return 0;
    cx.lineCap = 'round';
    cx.lineJoin = 'round';
    cx.lineWidth = width;
    let drew = 0;
    for (let r = 0; r < runStart.length; r++) {
      const a = runStart[r];
      const b = (r + 1 < runStart.length ? runStart[r + 1] : nodes) - 1;
      if (b <= a) continue;                       /* 单点段不描边 */
      cx.beginPath();
      cx.moveTo(v[a * 2], v[a * 2 + 1]);
      for (let i = a + 1; i <= b; i++) cx.lineTo(v[i * 2], v[i * 2 + 1]);
      cx.stroke();
      drew = 1;
    }
    return drew;
  }

  function paint(now) {
    const path = buildPath(now);
    const nodes = path.v.length / 2;
    stats.verts = nodes;
    if (nodes < 2) { clearAll(); return; }

    const cc = CFG.color;
    const base = 'rgba(' + cc[0] + ',' + cc[1] + ',' + cc[2] + ',';
    const segs = stops(path, now);
    let peak = 0;
    for (let i = 0; i < segs.length; i++) if (segs[i].a > peak) peak = segs[i].a;
    stats.alpha = +peak.toFixed(3);

    const paths = [];
    if (ctxTop) paths.push({ cx: ctxTop, w: CFG.lineWidth, a: CFG.lineAlpha, blur: 4.6 });
    if (ctx && CFG.bloom > 0) paths.push({ cx: ctx, w: CFG.lineWidth * 2.6, a: CFG.lineAlpha * CFG.bloom, blur: 9 });
    if (!paths.length) return;

    for (let p = 0; p < paths.length; p++) {
      const L = paths[p];
      clearOne(L.cx);
      L.cx.setTransform(dpr, 0, 0, dpr, 0, 0);

      /* 外发光：宽一点、更淡，给线一条柔软的边 */
      L.cx.globalCompositeOperation = 'source-over';
      L.cx.shadowColor = base + (L.a * 0.55 * CFG.glowAlpha).toFixed(4) + ')';
      L.cx.shadowBlur = L.blur;
      L.cx.strokeStyle = base + (L.a * CFG.glowAlpha).toFixed(4) + ')';
      if (strokePath(L.cx, path, L.w * CFG.glowRatio)) stats.paints++;

      /* 本体：一条沿路径渐变的连续线 */
      const g = L.cx.createLinearGradient(path.v[0], path.v[1], path.v[(nodes - 1) * 2], path.v[(nodes - 1) * 2 + 1]);
      for (let i = 0; i < segs.length; i++) g.addColorStop(segs[i].k, base + (L.a * segs[i].a).toFixed(4) + ')');
      L.cx.shadowBlur = 0;
      L.cx.shadowColor = 'rgba(0,0,0,0)';
      L.cx.strokeStyle = g;
      if (strokePath(L.cx, path, L.w)) stats.paints++;
    }
  }

  function loop() {
    const t = frameNow();
    stats.clockMs = t;
    stats.frames++;

    /* 按真实时间衰减（不按帧）—— 高低帧率机器上「消失得多快」是一样的 */
    for (let i = pts.length - 1; i >= 0; i--) {
      if ((t - pts[i].born) / CFG.lifeMs >= 1) pts.splice(i, 1);
    }
    if (pts.length && stopFade(t) <= 0) pts.length = 0;      /* 停手后整条淡完 */

    stats.points = pts.length;

    if (pts.length === 0) {
      running = false; stats.running = false; stats.alpha = 0; stats.verts = 0;
      stats.runs = 0; stats.chord = 0;
      clearAll(); raf = 0;
      return;
    }

    paint(t);
    stats.running = true;
    raf = requestAnimationFrame(loop);
  }

  /* ── 时间源 ────────────────────────────────────────────────────────────
     正常浏览器里直接用 performance.now()。但无头浏览器 / 虚拟时间下它可能
     一直停在 0，那样「按时间衰减」就永远不发生，整条线看起来像焊死的。
     所以这里维护一个按帧推进的时钟：真实时间没走的时候，就自己加一帧。 */
  let frameNo = 0, perfAt = -1, virtBase = 0;
  function frameNow() {
    let p = -1;
    try { p = performance.now(); } catch (e) { p = -1; }
    const going = (p > 0 && perfAt >= 0 && p > perfAt);
    if (!going) frameNo++;
    if (p > 0) {
      if (going) { virtBase = p - frameNo * 16.7; return p; }     /* 真实时间正常走 */
      if (!virtBase) virtBase = p;
      perfAt = p;
      return p - virtBase + frameNo * 16.7;                       /* 真实时间停住：按帧推进 */
    }
    perfAt = p;
    return (++frameNo) * 16.7;                                    /* 连 performance 都没有 */
  }

  function wake() {
    if (hidden) return;
    if (!running) { running = true; stats.running = true; raf = requestAnimationFrame(loop); }
  }

  /* ── 收点 ──────────────────────────────────────────────────────────── */
  function addPoint(x, y, now, brk) {
    const n = pts.length;
    if (n && !brk) {
      const dx = x - pts[n - 1].x, dy = y - pts[n - 1].y;
      if (dx * dx + dy * dy < 0.9) return false;
    }
    pts.push({ x: x, y: y, born: now, brk: !!brk });
    if (pts.length > CFG.maxPts) pts.splice(0, pts.length - CFG.maxPts);
    lastSX = x; lastSY = y; lastST = now;
    return true;
  }

  /* 收一个真实指针样本。跨得太远 / 隔得太久 / 刚从窗口外回来 → 另起一段。 */
  function pushSample(x, y, now, force) {
    let brk = pendingBrk;
    pendingBrk = false;

    if (lastSX === null) {
      brk = true;                                  /* 第一笔、或离开窗口后回来 */
    } else {
      const dx = x - lastSX, dy = y - lastSY;
      const d2 = dx * dx + dy * dy;
      if (d2 > CFG.jumpPx * CFG.jumpPx) brk = true;                       /* 跳变 */
      else if (now - lastST > CFG.holdMs && d2 > 36) brk = true;          /* 隔太久又位移明显 */
      else if (!brk && !force && d2 < CFG.gap * CFG.gap) return false;    /* 太密，省一点 */
    }
    return addPoint(x, y, now, brk);
  }

  function onMove(e) {
    if (e.pointerType === 'touch') return;        /* 触摸屏不画 */
    if (typeof e.clientX !== 'number') return;

    let list = null;
    try { if (e.getCoalescedEvents) list = e.getCoalescedEvents(); } catch (err) { list = null; }
    if (!list || !list.length) list = [e];

    const now = frameNow();
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!s || typeof s.clientX !== 'number') continue;
      pushSample(s.clientX, s.clientY, now, i === list.length - 1);
    }
    lastMove = now;
    wake();
  }

  function onLeave() {
    pendingBrk = true;                            /* 回来时另起一段，不跨窗口连线 */
    lastSX = null; lastSY = null;
  }

  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch') return;
    const now = frameNow();
    pendingBrk = true;
    lastSX = null; lastSY = null;
    pushSample(e.clientX, e.clientY, now, true);
    pushSample(e.clientX, e.clientY + 0.12, now, true);      /* 点一下也留一个小点 */
    lastMove = now;
    wake();
  }, { passive: true });
  addEventListener('pointerleave', onLeave, { passive: true });
  addEventListener('blur', onLeave);

  /* ── 滚动页面时立刻收笔 ───────────────────────────────────────────────
     锐利层是 position: fixed 的：不这么做的话，那条线会「钉」在屏幕上，
     而页面内容在它底下滑走 —— 看起来就像一道浮在页面上的划痕。
     这里不硬清空（会闪一下），而是把每个点的剩余寿命压到 150ms 以内，
     让它顺着原有的淡出曲线在 0.15 秒里化掉，滚到哪儿都不留痕。 */
  let lastScrollAt = -1e9;
  addEventListener('scroll', function () {
    const t = frameNow();
    if (t - lastScrollAt < 60) return;          /* 滚动事件很密，隔开处理 */
    lastScrollAt = t;
    const cap = t - CFG.lifeMs + 150;           /* 剩余寿命最多 150ms */
    for (let i = 0; i < pts.length; i++) if (pts[i].born < cap) pts[i].born = cap;
    if (pts.length) wake();
  }, { passive: true });
  document.addEventListener('visibilitychange', function () {
    hidden = document.hidden;
    if (hidden) { pts.length = 0; running = false; clearAll(); }
    else wake();
  });

  let rt = 0;
  addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { resize(); if (pts.length) wake(); }, 150);
  });

  resize();

  /* ── 验收接口 ─────────────────────────────────────────────────────────
     stats()    frames / paints / points / verts / runs / chord / maxTurn / running
                runs  = 分了几段（跳变会+1）
                chord = 段内最长的控制点间距，正常应远小于 jumpPx
     config     当前配置，可现场改（例如 __glow.config.lineAlpha = 0.2）
     move(x,y)  模拟一次指针移动
     tick()     手动推一帧（无头测试用）
     clear()    立刻清空                                                  */
  window.__glow = {
    stats: function () {
      return {
        frames: stats.frames, paints: stats.paints, clockMs: Math.round(stats.clockMs),
        points: stats.points, verts: stats.verts, runs: stats.runs, chord: stats.chord,
        alpha: stats.alpha, maxTurn: stats.maxTurn,
        running: stats.running, reduce: stats.reduce, twoLayer: stats.twoLayer,
        width: CFG.lineWidth, lineAlpha: CFG.lineAlpha, gap: CFG.gap, step: CFG.step,
        jumpPx: CFG.jumpPx, lifeMs: CFG.lifeMs, idleMs: CFG.idleMs, fadeMs: CFG.fadeMs
      };
    },
    config: CFG,
    move: function (x, y) {
      const now = frameNow();
      pushSample(x, y, now, false);
      lastMove = now;
      wake();
      return pts.length;
    },
    tick: function () {
      const t = frameNow();
      stats.clockMs = t;
      stats.frames++;
      for (let i = pts.length - 1; i >= 0; i--) {
        if ((t - pts[i].born) / CFG.lifeMs >= 1) pts.splice(i, 1);
      }
      if (pts.length && stopFade(t) <= 0) pts.length = 0;
      stats.points = pts.length;
      paint(t);
    },
    clear: function () {
      pts.length = 0; lastSX = null; lastSY = null; pendingBrk = true; clearAll();
    }
  };
})();
