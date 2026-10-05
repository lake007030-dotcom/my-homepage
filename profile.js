/* ══════════════════════════════════════════════════════════════════════════
   profile.js —— 你的全部个人资料与分类内容
   ══════════════════════════════════════════════════════════════════════════

   两种改法：
   ▶ 方式 A（推荐）用浏览器打开 index.html → 点右下角 ✎ →
        面板里填资料、传照片、加分类、加社交账号 → 点「下载 profile.js」→
        用它覆盖本文件即可。
   ▶ 方式 B 直接改这个文件，照着下面的注释填。

   ⚠️ 三个容易踩的坑
     1. 每行结尾的逗号不能少（最后一项可加可不加）。
     2. 英文双引号要用 \" 转义，或改写成中文引号「」。
     3. 图片路径用正斜杠：assets/photos/a.jpg ✅   assets\photos\a.jpg ❌
   ══════════════════════════════════════════════════════════════════════════ */

window.PROFILE = {

  /* ─── 一、你是谁 ──────────────────────────────────────────────────── */
  name:      "你的名字",
  brand:     "你的名字",                    // 左上角显示（可写简称）
  monogram:  "Y",                           // 没有头像照片时显示的字母
  role:      "产品设计师 · 独立开发者",
  location:  "上海 · GMT+8",
  available: "开放合作 · 2025",
  avatar:    "assets/photos/avatar.svg",    // 留空 "" 就用上面的字母

  /* 一句话主张：建议 12–20 字 */
  statement: "以最少的元素，交付最确定的体验。",
  accent:    "交付最确定的体验",             // 想高亮的部分（不想要就写 ""）

  /* 控制台里滚动的几行小信息（显示在首屏右侧） */
  facts: [
    { k: "方向", v: "产品体验 / 前端" },
    { k: "状态", v: "可接洽新项目" },
    { k: "回复", v: "24 小时内" },
    { k: "坐标", v: "上海 · GMT+8" }
  ],

  /* 首屏底部的三个数字 */
  stats: [
    { n: "8 年", l: "产品与设计实践" },
    { n: "30+",  l: "从零到一交付的项目" },
    { n: "12",   l: "长期合作团队" }
  ],

  /* 标签 */
  focus: [
    "产品策略", "交互设计", "设计系统", "前端工程",
    "动效与质感", "信息架构", "可访问性", "AI 工作流"
  ],

  /* ─── 二、我的几面（首页那一排等大的入口，点进去看详细内容） ───────
     每个分类 = 一个入口窗口，里面有若干「内容块」。
     内容块支持 8 种 type，随便混搭、随便排序：

       { type: "text",     title: "小标题", body: "一段文字，可换行" }
       { type: "list",     title: "小标题", items: ["第一件事", "第二件事"] }
       { type: "tags",     title: "小标题", items: ["标签A", "标签B"] }
       { type: "stats",    title: "小标题", items: [{ n: "8 年", l: "说明" }] }
       { type: "timeline", title: "小标题", items: [{ time: "2021", title: "标题", desc: "描述" }] }
       { type: "links",    title: "小标题", items: [{ name: "平台", url: "https://…", note: "备注" }] }
       { type: "photos",   title: "小标题", items: [{ src: "assets/photos/x.jpg", title: "标题", caption: "简介" }] }
       { type: "albums",   title: "小标题", items: [            // 相册集合：照片再分类
           { name: "旅行", desc: "相册说明",
             photos: [{ src: "assets/photos/x.jpg", title: "标题", caption: "简介" }] }
       ] }
     ────────────────────────────────────────────────────────────────── */
  categories: [

    /* ── 节点 01 ── */
    {
      id: "about",
      glyph: "01",
      name: "关于我",
      en: "ABOUT ME",
      summary: "我是谁，我在意什么，我如何工作。",
      blocks: [
        {
          type: "text",
          title: "我是谁",
          body: "我做产品与界面，关注一件事：让用户在最短路径上得到想要的结果。\n八年间从零到一做过工具型产品，也重构过千万级用户的成熟系统。相信克制胜于堆叠——少一个按钮，往往比多一个功能更难，也更值得。"
        },
        {
          type: "list",
          title: "我的工作方式",
          items: [
            "先问「不做会怎样」，再问「怎么做」",
            "用可点击的原型代替长篇文档",
            "把设计系统当成产品来维护",
            "上线之后继续看数据，而不是交付即结束"
          ]
        },
        { type: "tags", title: "关键词", items: ["克制", "结构化", "手感", "长期主义"] }
      ]
    },

    /* ── 节点 02：人生记录（内部再分相册） ── */
    {
      id: "life",
      glyph: "02",
      name: "人生记录",
      en: "LIFE LOG",
      summary: "按相册归档的照片，记录我走过的路、做过的事、身边的人。",
      blocks: [
        {
          type: "text",
          title: "",
          body: "比起「作品」，我更想留下一些**真实发生过的时刻**。\n照片按相册分好了，点上面的相册名可以只看某一类。点任意一张可以看大图和完整说明。"
        },
        {
          type: "albums",
          title: "",
          items: [
            {
              name: "旅行 · 2024",
              desc: "去过的地方，以及路上遇到的人。",
              photos: [
                { src: "assets/photos/album-1.svg", title: "海边那天", caption: "风很大，我坐了三个小时没走。" },
                { src: "assets/photos/photo-1.svg", title: "第一张旅行照", caption: "换成你自己的照片和故事。" }
              ]
            },
            {
              name: "工作现场",
              desc: "白板、原型、上线前的那杯咖啡。",
              photos: [
                { src: "assets/photos/album-2.svg", title: "一次复盘会", caption: "把问题写在墙上，比写在文档里诚实。" },
                { src: "assets/photos/photo-2.svg", title: "深夜的屏幕", caption: "上线前的最后一遍检查。" }
              ]
            },
            {
              name: "日常碎片",
              desc: "路上随手拍的，没什么理由。",
              photos: [
                { src: "assets/photos/album-3.svg", title: "某个下午", caption: "光刚好落在桌角，就拍了下来。" },
                { src: "assets/photos/photo-3.svg", title: "第三张", caption: "想加更多照片，就点右下角 ✎ 添加。" }
              ]
            },
            {
              name: "家人与朋友",
              desc: "比工作更重要的那些人。",
              photos: [
                { src: "assets/photos/album-4.svg", title: "一起吃饭的人", caption: "这张必须留着。" }
              ]
            }
          ]
        }
      ]
    },

    /* ── 节点 03 ── */
    {
      id: "work",
      glyph: "03",
      name: "我在做",
      en: "NOW",
      summary: "此刻手上的事，和最近在想的问题。",
      blocks: [
        {
          type: "text",
          title: "当前状态",
          body: "正在做一款给独立创作者用的工具，负责从需求梳理到前端实现的全流程。\n同时整理一套自己的设计系统方法论，准备写成系列文章。"
        },
        {
          type: "stats",
          title: "近一年读数",
          items: [
            { n: "4", l: "交付的项目" },
            { n: "2", l: "长期合作团队" },
            { n: "18", l: "写下的复盘笔记" }
          ]
        },
        {
          type: "list",
          title: "最近在做",
          items: [
            "把一款内部工具重做成用户可自助配置的产品",
            "写一套面向小团队的轻量设计系统",
            "研究 AI 在真实工作流里到底省下了什么"
          ]
        }
      ]
    },

    /* ── 节点 04 ── */
    {
      id: "timeline",
      glyph: "04",
      name: "经历",
      en: "TIMELINE",
      summary: "一路走来的几个关键节点。",
      blocks: [
        {
          type: "timeline",
          title: "",
          items: [
            { time: "2023 — 现在", title: "独立开发 / 设计顾问", desc: "为不同团队做产品设计与前端实现，同时打磨自己的产品。" },
            { time: "2020 — 2023", title: "某科技公司 · 高级产品设计师", desc: "负责核心产品的体验重构，把关键流程的完成率提升了三成。" },
            { time: "2018 — 2020", title: "某互联网公司 · 产品设计师", desc: "从零到一参与两款工具型产品的设计与上线。" },
            { time: "2017", title: "开始做设计", desc: "从一张海报开始，后来发现更喜欢解决系统性的问题。" }
          ]
        }
      ]
    },

    /* ── 节点 05 ── */
    {
      id: "contact",
      glyph: "05",
      name: "联系我",
      en: "CONTACT",
      summary: "有想法，随时聊聊。",
      blocks: [
        { type: "text", title: "", body: "合作、咨询、或者只是想聊聊某个想法，都欢迎直接找我。我通常 24 小时内回复。" },
        {
          type: "links",
          title: "在这里找到我",
          items: [
            { name: "邮箱",     url: "mailto:hello@example.com", note: "hello@example.com" },
            { name: "微信",     url: "",                          note: "your-wechat-id" },
            { name: "小红书",   url: "https://xiaohongshu.com/",  note: "@yourname" },
            { name: "GitHub",   url: "https://github.com/",       note: "@yourname" }
          ]
        }
      ]
    }

  ],

  /* ─── 三、社交平台（显示在首页底部） ───────────────────────────────
     name 随便写；url 留空 "" 则不可点击；qr 填二维码图片路径，
     鼠标移上去会弹出二维码。
     ────────────────────────────────────────────────────────────────── */
  socials: [
    { name: "微信",     url: "",                          note: "your-wechat-id",    badge: "微", qr: "" },
    { name: "小红书",   url: "https://xiaohongshu.com/",  note: "@yourname",         badge: "红", qr: "" },
    { name: "知乎",     url: "https://zhihu.com/",        note: "@yourname",         badge: "知", qr: "" },
    { name: "GitHub",   url: "https://github.com/",       note: "@yourname",         badge: "G",  qr: "" },
    { name: "Bilibili", url: "https://bilibili.com/",     note: "@yourname",         badge: "B",  qr: "" },
    { name: "邮箱",     url: "mailto:hello@example.com",  note: "hello@example.com", badge: "✉",  qr: "" }
  ],

  /* ─── 四、其他 ────────────────────────────────────────────────────── */
  email:      "hello@example.com",
  emailLabel: "有想法，随时聊聊。",
  copyright:  "© 2025 你的名字 · 保留所有权利"

};
