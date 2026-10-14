/* ══════════════════════════════════════════════════════════════════════════
   water.js —— 一整页会流动、能被搅动的水面
   ──────────────────────────────────────────────────────────────────────────
   它是全页最底下的一层（在 .bg 里、所有内容之下），所以：
     · 玻璃卡片浮在水**上面**；
     · 卡片背后的水被 backdrop-filter 磨砂掉 —— 水从卡片底下穿过去，
       卡片不再是「糊在纸上的一块」，而是浮在水上的一层。
   水面由两样东西叠出来，缺一不可：

     ① 波动方程（height field）
          这一帧高度 = 四邻平均 ÷ 2 − 上一帧高度      （再乘阻尼）
        鼠标划过就沿途落下一串小水珠，水珠各自扩散成同心环、互相叠加。
        边界固定为 0，所以波会从画面边缘反射回来，像真的水池。

     ② 水底的光斑（caustics）
        一张一次生成的、有机的柔光纹理（三个倍频的值噪声）。
        渲染时按水面的**坡度**把采样点挪开 —— 波面越陡，光被折得越远。
        光斑于是随着水一起扭、一起流。

       这一条是「像水」和「像贴图」的分界线：
       只靠明暗灰雾永远是一块贴在纸上的图案；光被波面折射，才会活。
       同理，光斑自己还在缓慢漂移 + 水面一直有极轻的环境波，
       所以**不碰鼠标它也在动** —— 静态贴图是没有这一层的。

   渲染：对高度场求斜率 → 当作法线 → 打一盏左上的光 →
        迎光的面加白、背光的面加极淡的冷灰，再叠上被折射的光斑。
        写进一张很低分辨率（约 6.5px 一格）的 canvas，由浏览器放大 ——
        双线性插值自带平滑，所以涟漪天然就是「流动模糊」的。
   ══════════════════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const canvas = document.getElementById('water');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const CFG = {
    /* ── 仿真 ────────────────────────────────────────────────── */
    cell:      6.5,      /* 目标格子边长（CSS px）。越小越细腻，也越费电 */
    maxCols:   240,      /* 列数上限 —— 保住性能 */
    /* 每小步乘一次的衰减。它同时决定「多久平静」和「能传多远」——
       这是控制传播距离最直接的一环。
       2026-10-14：0.9872 → 0.9775。用户反馈「波纹传播太远」：
       0.9872 时波出去 5 秒还剩 2%，几乎横穿整页；
       0.9775 时 2 秒只剩 6%，一圈涟漪扩到三四百 px 就自己散完了。 */
    damping:   reduce ? 0.968 : 0.9775,
    maxSub:    5,        /* 一帧最多补几个仿真步（低帧率时保证衰减按真实时间走） */

    /* ── 光 ─────────────────────────────────────────────────────
       这里用的是「法线 · 光方向」，不是「斜率乘一个倍数再夹到 ±1」。
       后者在陡的地方会被夹平：大片区域一起变成纯白或纯灰，
       亮暗之间于是出现硬邦邦的台阶 —— 那正是「像贴图一样生硬」的来源。
       归一化的法线永远不会撞墙，陡到极限时它自己转过去变暗。
       粼光则是把「迎光的程度」取 3 次幂：只有真正对着光的波面才发白，
       于是水波上出现一圈又细又亮的边 —— 那是水面最像水的一笔。

       2026-10-14 调柔（用户：「波纹太大太多很难看很刺眼」）。
       刺眼的原因是**总光量太容易撞到 ±1 被夹平**：一片死白接着一片死灰，
       中间没有过渡。现在把三处一起收：
         · 底子 wDiff 1.00 → 0.72、亮边 wSpec 1.00 → 0.30、陡峭度 gain 10.5 → 7.5
         · 波峰的白 hiA 218 → 176，波谷的冷灰 loA 176 → 122、颜色本身也调亮
       于是仿真最陡处总光量也只到 ±0.85 上下，永远够不到那个夹平线。 */
    gain:      7.5,      /* 坡度 → 法线倾角 的放大倍数 */
    wDiff:     0.72,     /* 漫反射权重：水面明暗的底子（窄，但极平滑）*/
    wSpec:     0.30,     /* 粼光权重：波峰上那圈亮边 */
    hiA:       176,      /* 迎光的波面：最多加多少白 */
    loA:       122,      /* 背光的波面：最多加多少冷灰 */
    cold:      [176, 186, 198],   /* 极淡冷灰 —— 全站唯一一丝「水色」 */

    /* ── 水底的光斑 ──────────────────────────────────────────── */
    refr:      1.7,      /* 坡度 → 采样位移（格）。这就是「折射」的强度。
                            1.8 时涟漪一陡就把光斑搅出一片明暗，也是「刺眼」的一分子 */
    caMid:     0.52,     /* 光斑的基准线：高于它算亮、低于算暗 */
    /* 注意：把 hiA 压下去之后，光斑的最终透明度也会跟着变小，
       所以 caHi 要往上补 —— 平静时的水感全靠它，别让它一起变淡了。
       （实测：hiA 218→176 之后，caHi 停在 0.80 会让静置流动从 14% 掉到 7.7%，
         逼近「几乎看不出在动」的边界；补到 0.96 才把平静时的水光拉回来。）*/
    caHi:      reduce ? 0.70 : 0.96,   /* 亮侧权重（白）*/
    caLo:      reduce ? 0.26 : 0.36,   /* 暗侧权重（刻意比亮侧小：避免看着像污渍）*/
    bedMargin: 16,       /* 光斑纹理四周外扩多少格（给漂移和折射留余量）*/
    driftAmp:  6,        /* 光斑自身漂移幅度（格）*/
    /* 漂移周期：reduce 下放慢到 1.5 倍。
       这里有个实测的坑：一开始把 reduce 放慢到 3 倍、反差也压到 0.56，
       结果静置 4 秒全页只有 0.1% 的像素发生变化 —— 等于一张静止的贴图。
       而「一张静止的光斑贴图」恰恰是最难看的东西（用户的原话是「像贴图一样生硬」）。
       所以减少动态效果的正确做法是「慢一点、淡一点」，而不是「几乎不动」。
       实测（相隔 5 秒、逐像素比，超过 4 个灰阶的像素占比）：
         常规 ≈ 14~27%；reduce ≈ 2.4~6.8% —— 看得见在流，但远不到会引起不适的程度。 */
    tA:        reduce ? 40 : 26,   /* 漂移的 x 周期（秒）*/
    tB:        reduce ? 29 : 19,   /* 漂移的 y 周期（秒）—— 与 tA 不同，看着才不像钟摆 */

    /* ── 指针 ──────────────────────────────────────────────────
       2026-10-14 收敛（用户选的「方案 2」：划过保留，但大幅减少数量与幅度）。
       原来每 4.2 格（≈27px）就落一滴、一滴最高 6.0 幅度，划过一整条轨迹
       就是一长串连成片的波 —— 密、大、盖住半屏。
       现在 dropGap 4.2 → 11.5 格（≈75px 才落一滴），幅度整档压到约 40%，
       再配上面更快的衰减：划过只留下稀疏的几圈，各自散开就结束。 */
    dropGap:   11.5,     /* 指针每移动「这么多格」落一滴水 */
    ampMin:    0.62,     /* 一滴的基础幅度 */
    ampK:      0.42,     /* 再按指针速度（px/ms）加权 */
    ampMax:    reduce ? 1.5 : 2.4,
    clickAmp:  reduce ? 1.8 : 3.0,

    /* ── 环境（让水面在没人碰的时候也是活的）──────────────────
       间隔从 1.8~4.4 秒拉到 5~11 秒 —— 原来那个频率本身也是「太多」的一部分。
       但别拉得更长：静置的「水没死」只剩光斑漂移和这一层，
       拉到 6~14 秒时实测静置流动掉到 7.7%，开始逼近「几乎看不出在动」。 */
    breeze:    !reduce,  /* 偶尔自己泛一小圈 */
    breezeMin: 5,        /* 两道环境波之间的最短间隔（秒）*/
    breezeMax: 11        /* 最长间隔 */
  };

  let vw = 0, vh = 0;
  let W = 0, H = 0, cell = CFG.cell;
  let cur = null, prev = null, next = null, sm = null, img = null;
  let bed = null, BW = 0, BH = 0;
  const M = CFG.bedMargin;
  let energy = 0, frames = 0, workMs = 0, workN = 0;
  let raf = 0, lastFrame = 0, clock = 0, skipped = 0, lastTouch = 0;

  /* ══ 框在水面之上 ═══════════════════════════════════════════════════
     玻璃卡片的 backdrop-filter 会把背后的水一起磨砂 ——
     结果「水从框下面流过去」看起来就成了「波纹画在框上」。
     用户要的是「各种框在水波的上方」，所以最直接、也最不容易出错的做法是：
     **水面在框的位置干脆不画**。框里于是只剩光雾和网格，
     玻璃依旧是玻璃，但波纹永远不会出现在框上，框也永远纹丝不动。

     为什么不用「把玻璃调厚一点盖住」：那要靠透明度去糊，
     波纹总会从半透的白底下渗出来一点（这正是之前「面板里也能看到涟漪」的成因）。
     直接从源头挖掉，才是真的「在上方」。

     位置的采集：这些框是 app.js 运行时生成的、还会随滚动移动，
     所以不能只取一次。滚动（rAF 节流）、尺寸变化、切详情页各收一次，
     另外每 12 次绘制兜一次底 —— 布局变了最多 0.2 秒就跟上。 */
  /* 只收「真的有一层可见表面」的元素 —— 关键是别把没有背景的东西算进来：
     比如 .hud-inner 本身是透明的（真正带磨砂的是它外面那层 .hud，
     而且只在滚下去、加了 .stuck 之后才有底），
     照 .hud-inner 挖就会在顶部留下一整条「没有水」的带子。
     同理 .hud 只在 .stuck 时才要挖。 */
  const PANEL_SEL = '.glass,.hud.stuck,.photo,.link-card,.social,.chip,' +
                    '.back-btn,.icon-btn,.qr-pop,.lightbox';
  let panels = [];            /* 扁平存 [left, top, right, bottom, ...] */
  let paintN = 0;

  function collectPanels() {
    panels.length = 0;
    const list = document.querySelectorAll(PANEL_SEL);
    for (let i = 0; i < list.length; i++) {
      const r = list[i].getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;                    /* 隐藏的元素是 0×0 */
      if (r.bottom < -4 || r.top > vh + 4) continue;                 /* 屏幕外的不用管 */
      panels.push(r.left, r.top, r.right, r.bottom);
    }
  }

  /* 这个点是不是被某个框盖住了（环境波别落在框底下，不然白泛一圈没人看得见） */
  function covered(x, y) {
    for (let k = 0; k < panels.length; k += 4) {
      if (x >= panels[k] && x <= panels[k + 2] &&
          y >= panels[k + 1] && y <= panels[k + 3]) return true;
    }
    return false;
  }
  let lastX = null, lastY = null, lastAt = 0, acc = 0;

  /* ══ 值噪声：只用来生成那张光斑纹理（build 时跑一次）══════════════ */
  function hash2(ix, iy) {
    let h = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy), b = hash2(ix + 1, iy);
    const c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
    const ab = a + (b - a) * u, cd = c + (d - c) * u;
    return ab + (cd - ab) * v;
  }

  /* ── 生成水底光斑（一次）─────────────────────────────────────
     三个倍频：波长约 12.8 / 5.8 / 2.8 格 —— 换算到屏幕大约 85 / 38 / 18 px。
     跨度拉开，既有大片的光斑，也有细碎的粼光；波长太单一就会像花纹布。
     最细那一档刻意压得比较轻：18px 的细纹一旦太强、再一动得快，
     就会变成「电视雪花」那样的沸腾感，而不是水光。 */
  function makeBed() {
    BW = W + M * 2;
    BH = H + M * 2;
    bed = new Float32Array(BW * BH);
    const oct = [[1 / 12.8, 1.0], [1 / 5.8, 0.48], [1 / 2.8, 0.19]];
    let mn = Infinity, mx = -Infinity;
    for (let y = 0; y < BH; y++) {
      const row = y * BW;
      for (let x = 0; x < BW; x++) {
        let v = 0;
        for (let o = 0; o < 3; o++) v += oct[o][1] * vnoise(x * oct[o][0], y * oct[o][0]);
        bed[row + x] = v;
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
    }
    const k = 1 / ((mx - mn) || 1);
    for (let i = 0; i < bed.length; i++) {
      const v = (bed[i] - mn) * k;      /* 拉回 0..1 */
      bed[i] = v * v * (3 - 2 * v);     /* 再匀一下分布，两头更重、中间更平 */
    }
  }

  /* 双线性采样。要点：位移是小数格，用取整采样会让折射一格一格地跳。 */
  function bedAt(x, y) {
    if (x < 0 || y < 0 || x > BW - 2 || y > BH - 2) return CFG.caMid;
    const ix = x | 0, iy = y | 0;
    const fx = x - ix, fy = y - iy;
    const i0 = iy * BW + ix, i1 = i0 + BW;
    const ab = bed[i0] + (bed[i0 + 1] - bed[i0]) * fx;
    const cd = bed[i1] + (bed[i1 + 1] - bed[i1]) * fx;
    return ab + (cd - ab) * fy;
  }

  /* ── 建立 / 重建水面 ─────────────────────────────────────────── */
  function build() {
    vw = Math.max(320, innerWidth);
    vh = Math.max(240, innerHeight);
    cell = Math.max(CFG.cell, vw / CFG.maxCols);
    W = Math.max(32, Math.round(vw / cell));
    H = Math.max(24, Math.round(vh / cell));
    canvas.width = W;
    canvas.height = H;
    cur = new Float32Array(W * H);
    prev = new Float32Array(W * H);
    next = new Float32Array(W * H);
    sm = new Float32Array(W * H);       /* 渲染前平滑一道，见 diffuse() */
    img = ctx.createImageData(W, H);
    ctx.clearRect(0, 0, W, H);
    energy = 0;
    makeBed();
    collectPanels();
  }

  /* ── 推进一帧波动 ─────────────────────────────────────────────── */
  function step() {
    const w = W, h = H, damp = CFG.damping;
    let e = 0;
    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      for (let x = 1; x < w - 1; x++) {
        const i = row + x;
        let v = (cur[i - 1] + cur[i + 1] + cur[i - w] + cur[i + w]) * 0.5 - prev[i];
        v *= damp;
        next[i] = v;
        const av = v < 0 ? -v : v;
        if (av > e) e = av;
      }
    }
    /* 三块缓冲轮转：prev ← cur ← next ← 旧的 prev */
    const t = prev; prev = cur; cur = next; next = t;
    energy = e;
  }

  /* ── 渲染前平滑一道 ────────────────────────────────────────────
     波动方程会留下细密的高频噪声（画面上一格一格的「毛刺」），而渲染是拿
     相邻格子的高度差当斜率用的 —— 高频正好被放大，于是涟漪看起来像「刷痕」
     而不是水波。用 4:1:1:1:1 的核走一遍，能把这个频率几乎完全抹掉。
     注意不能走两遍：平滑同样会削弱涟漪本身，两遍之后水就淡到看不见了。 */
  function diffuse(from, to) {
    const w = W, h = H;
    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      for (let x = 1; x < w - 1; x++) {
        const i = row + x;
        to[i] = (from[i] * 4 + from[i - 1] + from[i + 1] + from[i - w] + from[i + w]) * 0.125;
      }
    }
  }

  /* 光从左上方来。渲染用的常量：光方向 L（已归一化），以及把「比平面多迎了多少光」
     换算成 0..1 的 LINV —— 平面时为 0、正对光时为 1。 */
  const LX = -0.545, LY = -0.685, LZ = 0.483;
  const DK = 1.55;                 /* 漫反射的缩放：把 ±0.5 的窄范围拉到 ±0.8 左右 */
  const LINV = 1 / (1 - LZ);

  /* ── 把高度画成水光 ─────────────────────────────────────────────
     每个格子算三样东西，合成一个带符号的「光量」 q：
       · 漫反射 —— 法线（由坡度得来）与光方向的点积。负责水面明暗的底子，
         范围窄、但极平滑，所以不会出现硬台阶。
       · 粼光 —— 真正对着光的那一小撮波面取 3 次幂再发白，
         于是亮线又细又亮，水波上那圈亮边就是它。
       · 光斑 —— 被坡度折射后采样的水底光，跟着水一起扭、一起流。
     q > 0 往「白」上叠，q < 0 往「冷灰」上叠。一正一负来回，水面就有体积。 */
  function paint(t) {
    const w = W, h = H, d = img.data;
    const g = CFG.gain, wD = CFG.wDiff, wS = CFG.wSpec;
    const hiA = CFG.hiA, loA = CFG.loA;
    const refr = CFG.refr, caMid = CFG.caMid, caHi = CFG.caHi, caLo = CFG.caLo;
    const c0 = CFG.cold[0], c1 = CFG.cold[1], c2 = CFG.cold[2];
    const K = 2 * Math.PI;
    const ox = M + CFG.driftAmp * Math.sin(K * t / CFG.tA);
    const oy = M + CFG.driftAmp * Math.cos(K * t / CFG.tB);

    diffuse(cur, sm);

    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      const by = oy + y;
      for (let x = 1; x < w - 1; x++) {
        const i = row + x;
        const dxs = sm[i + 1] - sm[i - 1];
        const dys = sm[i + w] - sm[i - w];
        const gx = dxs * g, gy = dys * g;

        /* 法线 = (-gx, -gy, 1) 归一化 */
        const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
        const nx = -gx * inv, ny = -gy * inv, nz = inv;

        /* 法线与光方向的点积。平面时正好等于 LZ，减掉它之后
           ndl 就代表「比平面多迎了多少光」：正 = 迎光那面，负 = 背光那面。 */
        const ndl = nx * LX + ny * LY + nz * LZ - LZ;

        /* ① 漫反射：水面明暗的底子。范围窄，但极平滑 —— 不会出现硬台阶。 */
        let q = ndl * DK * wD;

        /* ② 粼光：只有真正对着光的那一小撮波面才发白。
              取 3 次幂，亮线于是又细又亮 —— 水波上那圈亮边就是它。 */
        const lit = ndl * LINV;                 /* 0..1，1 = 正对光 */
        if (lit > 0) {
          const l2 = lit * lit;
          q += (l2 > 1 ? lit : l2 * lit) * wS;
        }

        /* ③ 水底的光斑：按坡度把采样点挪开 —— 波面越陡，光被折得越远 */
        const cc = bedAt(ox + x + dxs * refr, by + dys * refr) - caMid;
        q += cc > 0 ? cc * caHi : cc * caLo;

        if (q > 1) q = 1; else if (q < -1) q = -1;

        const p = i << 2;
        if (q >= 0) {
          d[p] = 255; d[p + 1] = 255; d[p + 2] = 255;
          d[p + 3] = (q * hiA) | 0;
        } else {
          d[p] = c0; d[p + 1] = c1; d[p + 2] = c2;
          d[p + 3] = (-q * loA) | 0;
        }
      }
    }

    /* 最外一圈直接复制邻格：不然放大之后屏幕边上会有一圈没水的缝 */
    for (let x = 1; x < w - 1; x++) {
      let a = (1 * w + x) << 2, b = (2 * w + x) << 2;
      d[a] = d[b]; d[a + 1] = d[b + 1]; d[a + 2] = d[b + 2]; d[a + 3] = d[b + 3];
      a = ((h - 2) * w + x) << 2; b = ((h - 3) * w + x) << 2;
      d[a] = d[b]; d[a + 1] = d[b + 1]; d[a + 2] = d[b + 2]; d[a + 3] = d[b + 3];
    }
    for (let y = 1; y < h - 1; y++) {
      let a = (y * w + 1) << 2, b = (y * w + 2) << 2;
      d[a] = d[b]; d[a + 1] = d[b + 1]; d[a + 2] = d[b + 2]; d[a + 3] = d[b + 3];
      a = (y * w + w - 2) << 2; b = (y * w + w - 3) << 2;
      d[a] = d[b]; d[a + 1] = d[b + 1]; d[a + 2] = d[b + 2]; d[a + 3] = d[b + 3];
    }

    /* ── 挖掉框底下的水：框在水面之上，波纹不该出现在框里 ──────────
       做法是把这些格子的 alpha 直接抹 0（画布是低分辨率、由浏览器放大，
       所以边界会自然糊开约一格 ≈ 6px；再往外多留一格，
       让过渡正好躲在框自己的描边和投影里，看不见接缝）。 */
    for (let k = 0; k < panels.length; k += 4) {
      let x0 = Math.floor(panels[k] / vw * w) - 1;
      let x1 = Math.ceil(panels[k + 2] / vw * w) + 1;
      let y0 = Math.floor(panels[k + 1] / vh * h) - 1;
      let y1 = Math.ceil(panels[k + 3] / vh * h) + 1;
      if (x0 < 0) x0 = 0;
      if (y0 < 0) y0 = 0;
      if (x1 > w - 1) x1 = w - 1;
      if (y1 > h - 1) y1 = h - 1;
      for (let y = y0; y <= y1; y++) {
        let p = ((y * w + x0) << 2) | 3;
        for (let x = x0; x <= x1; x++, p += 4) d[p] = 0;
      }
    }

    if (++paintN % 12 === 0) collectPanels();   /* 兜底：布局变了也能跟上 */

    ctx.putImageData(img, 0, 0);
  }

  function frame(now) {
    /* 按真实时间补步：帧率低的时候一帧多算几步，衰减速度才不会跟着帧率跑偏。
       （踩过的坑：衰减只跟「帧」挂钩，结果低帧率下水面十几秒都静不下来。） */
    const dt = lastFrame ? Math.min(120, now - lastFrame) : 16.7;
    lastFrame = now;
    frames++;

    /* 时间与仿真永远按真实时间推进 —— 省电档只该省「画」，
       不能把 clock 和 step() 一起省掉。
       （踩过的坑：跳帧时直接 return，待机时水面速度和涟漪扩散都只有一半，
         低帧率/省电环境下看着就像一张静止贴图。） */
    const n = Math.max(1, Math.min(CFG.maxSub, Math.round(dt / 16.667)));
    for (let k = 0; k < n; k++) step();
    clock += dt / 1000;

    /* 省电档：指针停手 2 秒之后隔帧渲染 —— 水面依旧在流，只是少画一半帧 */
    if (now - lastTouch > 2000) {
      skipped ^= 1;
      if (skipped) { raf = requestAnimationFrame(frame); return; }
    } else {
      skipped = 0;
    }

    const t0 = performance.now();
    paint(clock);
    workMs += performance.now() - t0;
    workN++;
    raf = requestAnimationFrame(frame);
  }

  /* ── 在某处落一滴水 ─────────────────────────────────────────────
     形状要「紧」：太宽的扰动只会推出一团慢慢挪的低频包，看着像一片灰渍。
     这里用 3×3 的小凸起（中间最高）+ 外面一圈很轻的反向坎 ——
     高频成分够，水才会自己散成一圈一圈的同心环。 */
  const KER = [
    [0.18, 0.42, 0.18],
    [0.42, 1.00, 0.42],
    [0.18, 0.42, 0.18]
  ];

  function splash(x, y, amp) {
    if (!cur || !amp) return;
    const cx = Math.round(x / vw * W);
    const cy = Math.round(y / vh * H);
    if (cx < 5 || cy < 5 || cx > W - 6 || cy > H - 6) return;

    for (let j = -1; j <= 1; j++) {
      const row = (cy + j) * W;
      const kr = KER[j + 1];
      for (let k = -1; k <= 1; k++) {
        const i = row + cx + k;
        const nv = cur[i] + amp * kr[k + 1];
        cur[i] = nv > 12 ? 12 : nv < -12 ? -12 : nv;
      }
    }
    /* 外圈一圈很轻的反向坎：水被压下去的「坑沿」，波纹扩散得更干净 */
    const r1 = amp * -0.07;
    const base = cy * W + cx;
    cur[base - 2] += r1; cur[base + 2] += r1;
    cur[base - W * 2] += r1; cur[base + W * 2] += r1;
  }

  /* ── 「有人在用」的信号 ──────────────────────────────────────────
     只有**用户真的碰了页面**才调它。
     环境波（breeze）和欢迎涟漪都只注入、不调它 ——
     否则每 1.8~4.4s 一次的自发涟漪会把省电档刚进入就打断，
     页面明明没人碰却一直满帧跑。 */
  function wake() {
    lastTouch = performance.now();
    if (!raf) { lastFrame = 0; raf = requestAnimationFrame(frame); }
  }

  /* ── 指针：划过一路滴水 ────────────────────────────────────────
     不是沿着轨迹每一格都注入（那样脊会连成一片、糊成一道灰带），
     而是每移动 dropGap 格才落一滴。一串各自扩散的涟漪互相叠，
     看起来才像水面，而不是被抹了一道。
     幅度按指针速度走（px/ms），所以慢慢划是轻点，甩一下是重击。 */
  function onMove(e) {
    const x = e.clientX, y = e.clientY;
    const now = performance.now();
    wake();

    /* 隔了一会儿没动，就当作重新入水，避免拉出一条直线 */
    if (lastX === null || now - lastAt > 320) {
      lastX = x; lastY = y; lastAt = now; acc = 0;
      splash(x, y, CFG.ampMin);
      return;
    }
    const ddt = Math.max(1, now - lastAt);
    lastAt = now;

    const dx = x - lastX, dy = y - lastY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.8) return;

    const speed = dist / ddt;                             /* px / ms */
    const amp = Math.min(CFG.ampMax, CFG.ampMin + speed * CFG.ampK);
    const gap = cell * CFG.dropGap;
    const ux = dx / dist, uy = dy / dist;

    acc += dist;
    let n = 0;
    while (acc >= gap && n < 20) {
      acc -= gap;
      splash(x - ux * acc, y - uy * acc, amp);            /* 落点在当前点「往回 acc 像素」处 */
      n++;
    }
    if (n >= 20) acc = 0;

    lastX = x; lastY = y;
  }

  addEventListener('pointermove', onMove, { passive: true });

  addEventListener('pointerdown', (e) => {
    lastX = e.clientX; lastY = e.clientY; lastAt = performance.now();
    wake();
    splash(e.clientX, e.clientY, CFG.clickAmp);
  }, { passive: true });

  /* ── 进页面先泛两圈：让人知道这里可以摸 ─────────────────────────
     一次泛五圈（原来是 4+2）在浅色底上会连成一片，反而像水渍 ——
     现在只在正中轻轻落两滴（一正一负，像同一滴水荡开的两道），
     再在偏右补一滴。幅度也压到原来的六成。 */
  function welcome() {
    const cx = innerWidth * 0.5, cy = innerHeight * 0.40;
    [[0, 1.05], [280, -0.62]]
      .forEach(([d, a]) => setTimeout(() => splash(cx, cy, a), d));
    setTimeout(() => splash(innerWidth * 0.72, innerHeight * 0.62, 0.72), 560);
  }

  /* ── 环境波 ────────────────────────────────────────────────────
     每隔 5～11 秒在随机位置落一滴很轻的水。
     这一层是「灵气」的来源：水面一直有细碎的波光在淌，
     而不是一张等着被鼠标惊动的静止贴图。
     幅度刻意压得很小（约划过时的 7%），远看只是光在游。
     2026-10-14：间隔从 1.8~4.4s 拉到 5~11s、幅度再降三成 ——
     原来那个频率本身就是用户说的「波纹太多」的一部分。 */
  function breezeLoop() {
    if (!CFG.breeze) return;
    setTimeout(() => {
      if (CFG.breeze && !document.hidden) {
        /* 落点躲开框：落在框底下等于白泛一圈，谁都看不见 */
        let bx = 0, by = 0;
        for (let k = 0; k < 6; k++) {
          bx = innerWidth * (0.06 + Math.random() * 0.88);
          by = innerHeight * (0.10 + Math.random() * 0.80);
          if (!covered(bx, by)) break;
        }
        splash(bx, by, 0.09 + Math.random() * 0.13);
      }
      breezeLoop();
    }, (CFG.breezeMin + Math.random() * (CFG.breezeMax - CFG.breezeMin)) * 1000);
  }

  /* ── 框的位置：滚动 / 换页时重收 ────────────────────────────────
     框随滚动移动，挖洞的位置也必须跟着走，否则滚到一半就会看到
     「水面从框上重新长出来」。rAF 节流 = 每帧最多收一次。 */
  let ct = 0;
  function scheduleCollect() {
    if (ct) return;
    ct = requestAnimationFrame(() => { ct = 0; collectPanels(); });
  }
  addEventListener('scroll', scheduleCollect, { passive: true });
  addEventListener('hashchange', () => {
    scheduleCollect();
    setTimeout(collectPanels, 120);      /* app.js 重渲染之后再兜两次 */
    setTimeout(collectPanels, 600);
  });

  /* ── 尺寸变化 ────────────────────────────────────────────────── */
  let rt = 0;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { build(); }, 180);
  }, { passive: true });

  /* ── 标签页切走就停，回来再续（别在后台烧电）────────────────── */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    } else if (!raf) {
      lastFrame = 0;
      raf = requestAnimationFrame(frame);
    }
  });

  /* ── 启动 ────────────────────────────────────────────────────── */
  build();
  lastTouch = performance.now();
  raf = requestAnimationFrame(frame);
  if (!reduce) setTimeout(welcome, 260);
  breezeLoop();

  /* 方便验收：window.__water.stats() 给出水面当前状态。
     avgMs = 每帧实际花在仿真 + 渲染上的毫秒数 ——
     它和 fps 一起看，就能分清「慢在我这儿」还是「慢在页面合成上」。 */
  window.__water = {
    config: CFG,
    splash: (x, y, a) => splash(x, y, a == null ? 2 : a),
    stats: () => ({
      W, H, cell: +cell.toFixed(2), energy: +energy.toFixed(4), frames,
      paints: workN,
      clockMs: Math.round(clock * 1000),
      avgMs: workN ? +(workMs / workN).toFixed(2) : 0,
      running: !!raf
    })
  };
})();
