/* dsh-praze-skin — 客户端挂件（vanilla JS，无第三方依赖）
 * 右下角鲸鱼娘桌宠 + 余额/峰谷面板 + Astra 风格思考强度滑条 + Praze 特效。
 * 所有数据来自本机 Host 路由 /api/praze-skin/*；API 密钥不会到达浏览器。
 * 面板互斥单开：默认只保留桌宠，点开一次只弹出一个浮层，不向上堆叠遮挡视野。
 */
(function () {
  if (window.__dshPrazeSkin__) return
  window.__dshPrazeSkin__ = true

  var API = '/api/praze-skin'
  var settings = null, meta = null, usage = null, balance = null
  var balanceBusy = false, menuOpen = false, activePanel = null
  var prevPeak = null, rootEl = null, appRootEl = null, appRootOrig = null
  var translucentChain = []
  var particleCv = null, particleCtx = null, particles = [], rafId = null
  var burstCv = null, burstCtx = null, burstParts = [], burstRaf = null
  var dark = true

  var THEMES = {
    noble: { name: '崇高·蓝', color: '#4c8dff' },
    sacred: { name: '神圣·金', color: '#d9a13b' },
    calling: { name: '感召·青', color: '#2fb7a6' },
    illusory: { name: '虚妄·紫', color: '#9a6cf0' }
  }
  // 官方档位中文名
  var EFFORT_ZH = { auto: '跟随', none: '关闭', minimal: '极简', low: '轻度', medium: '标准', high: '深度', xhigh: '超深', max: 'MAX' }
  // Astra（GPT-6 effort）风格别名
  var EFFORT_ASTRA = { auto: 'Auto', none: 'Off', minimal: 'Minimal', low: 'Instant', medium: 'Medium', high: 'High', xhigh: 'Extra High', max: 'Pro' }
  // Praze 耦合/借力档位副标题
  var EFFORT_PRAZE = {
    auto: '跟随会话默认耦合强度',
    none: '不借力，不消耗耦合能',
    minimal: '微量耦合，轻快回应',
    low: '轻度借力，常规推演',
    medium: '标准耦合，均衡输出',
    high: '深度耦合，多步推理',
    xhigh: '超深推演，长链分析',
    max: '耦合能全开，计划树满枝'
  }
  var PANELS = ['pz-balance', 'pz-think', 'pz-settings', 'pz-usage']
  var PAT_LINES = [
    '嘿嘿，耦合能补充完毕～',
    '耳朵不可以随便捏啦……好吧只给你捏。',
    '尾巴摇一摇，把好运分你一半！',
    'P空间今天也很平静，适合好好工作～',
    '摸头收到！计划树 +1 点灵感。',
    '呜哇……好痒！小鱼干要掉出来了啦。'
  ]
  var GREET_LINES = [
    '我是{name}，你的P空间搭档！今天也一起加油吧～',
    '{user}，欢迎回来！能量储备我已经帮你盯着啦。',
    '计划树已就绪，随时可以开工哦～'
  ]

  // ---------- 工具 ----------
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
  function fmt(n) { n = n || 0; if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'; if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'; if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k'; return String(Math.round(n)) }
  function money(n) { return '¥' + (Math.round((n || 0) * 10000) / 10000).toFixed(4) }
  function clock(ts) { if (!ts) return '—'; var d = new Date(ts), p = function (x) { return String(x).padStart(2, '0') }; return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) }
  function countdown(ts) {
    if (!ts) return ''
    var s = Math.max(0, Math.floor((ts - Date.now()) / 1000))
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60
    var p = function (x) { return String(x).padStart(2, '0') }
    return (h > 0 ? h + ':' : '') + p(m) + ':' + p(ss)
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }
  function deepMerge(base, patch) {
    var out = JSON.parse(JSON.stringify(base || {}))
    for (var k in patch) {
      if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k]) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = deepMerge(out[k], patch[k])
      else out[k] = patch[k]
    }
    return out
  }
  function postSettings(patch) {
    settings = deepMerge(settings, patch)
    applyTheme()
    fetch(API + '/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).catch(function () {})
  }
  function reducedMotion() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches }

  // ---------- 主题 / 明暗 ----------
  function detectDark() {
    try {
      var bg = getComputedStyle(document.body).backgroundColor
      var m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
      if (m) { var lum = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255; return lum < 0.5 }
    } catch (e) {}
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  function applyTheme() {
    if (!settings) return
    document.documentElement.setAttribute('data-pz-theme', settings.theme || 'noble')
    document.documentElement.setAttribute('data-pz-dark', dark ? '1' : '0')
    document.documentElement.setAttribute('data-pz-focus', settings.focusMode ? '1' : '0')
  }

  // ---------- 当前模型展示 ----------
  function currentModel() {
    if (usage && usage.live && usage.live.model) return usage.live.model
    if (usage && usage.lastCall && usage.lastCall.model) return usage.lastCall.model
    if (usage && usage.model) return usage.model
    if (meta && meta.model) return meta.model
    return null
  }

  // ---------- 背景层 ----------
  function ensureBg() {
    var el = document.getElementById('pz-bg')
    if (!settings.bg.enabled || settings.focusMode) { if (el) el.style.display = 'none'; restoreAppRoot(); stopParticles(); document.body.style.backgroundImage = ''; return }
    if (!el) {
      el = document.createElement('div')
      el.id = 'pz-bg'
      el.innerHTML = '<div class="pz-bg-img"></div><div class="pz-bg-veil"></div><canvas></canvas>'
      document.body.insertBefore(el, document.body.firstChild)
      particleCv = el.querySelector('canvas')
      particleCtx = particleCv.getContext('2d')
      window.addEventListener('resize', sizeParticleCanvas)
    }
    el.style.display = ''
    var imgUrl = API + '/assets/background.png'
    var bgImg = el.querySelector('.pz-bg-img')
    bgImg.style.backgroundImage = 'url(' + imgUrl + ')'
    el.style.setProperty('--pz-veil', String(settings.bg.veil))
    document.documentElement.style.setProperty('--pz-veil', String(settings.bg.veil))
    // 预加载：失败则回退到纯渐变背景，避免空白
    var probe = new Image()
    probe.onerror = function () {
      el.classList.add('fallback')
      document.body.style.backgroundImage = ''
    }
    probe.onload = function () {
      el.classList.remove('fallback')
      // body 底层兜底：宿主容器透明化后作为最底层叠底
      document.body.style.backgroundImage = 'url(' + imgUrl + ')'
      document.body.style.backgroundSize = 'cover'
      document.body.style.backgroundPosition = 'center'
      document.body.style.backgroundRepeat = 'no-repeat'
    }
    probe.src = imgUrl
    sizeParticleCanvas()
    makeAppTranslucent()
    if (settings.effects.particles && !reducedMotion()) startParticles(); else stopParticles()
  }
  function findAppRoots() {
    var out = []
    var ids = ['root', 'app', '__next', 'dsh-root', 'dsh-app', 'main']
    for (var t = 0; t < ids.length; t++) {
      var byId = document.getElementById(ids[t])
      if (byId && out.indexOf(byId) === -1) out.push(byId)
    }
    var kids = document.body.children
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i]
      if (k.id && k.id.indexOf('pz-') === 0) continue
      if (/^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(k.tagName)) continue
      var r = k.getBoundingClientRect()
      if (r.width >= window.innerWidth * 0.8 && r.height >= window.innerHeight * 0.8 && out.indexOf(k) === -1) out.push(k)
    }
    return out
  }
  function applyTranslucent(el) {
    try {
      var cs = getComputedStyle(el)
      var m = cs.backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
      if (!m) return
      var alpha = m[4] == null ? 1 : +m[4]
      if (alpha < 0.99) return // 已经透明则不干预
      var target = Math.max(0.15, 1 - settings.bg.show)
      translucentChain.push({ el: el, orig: el.style.backgroundColor || '' })
      el.style.backgroundColor = 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',' + target + ')'
    } catch (e) {}
  }
  function makeAppTranslucent() {
    // 只处理全屏宿主容器：把其不透明底色变为半透明，让背景图透出；
    // 内部卡片/消息气泡保持原样，保证文字阅读不受影响。
    restoreAppRoot()
    var roots = findAppRoots()
    for (var i = 0; i < roots.length; i++) {
      applyTranslucent(roots[i])
      // 下钻一层：若外层容器背景透明，定位内部铺满视口的不透明布局容器
      var kids = roots[i].children
      for (var j = 0; j < kids.length; j++) {
        var k = kids[j]
        if (k.id && k.id.indexOf('pz-') === 0) continue
        var r = k.getBoundingClientRect()
        if (r.width >= window.innerWidth * 0.8 && r.height >= window.innerHeight * 0.8) applyTranslucent(k)
      }
    }
  }
  function restoreAppRoot() {
    for (var i = 0; i < translucentChain.length; i++) {
      try { translucentChain[i].el.style.backgroundColor = translucentChain[i].orig } catch (e) {}
    }
    translucentChain = []
    if (appRootEl) { try { appRootEl.style.backgroundColor = appRootOrig } catch (e) {} }
  }

  // ---------- P空间粒子 ----------
  function sizeParticleCanvas() {
    if (!particleCv) return
    particleCv.width = window.innerWidth
    particleCv.height = window.innerHeight
  }
  function initParticles() {
    particles = []
    var n = Math.min(42, Math.floor(window.innerWidth / 34))
    for (var i = 0; i < n; i++) {
      particles.push({
        x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight,
        r: 0.8 + Math.random() * 1.8, vy: 0.08 + Math.random() * 0.22,
        sway: Math.random() * Math.PI * 2, swaySp: 0.002 + Math.random() * 0.004,
        a: 0.10 + Math.random() * 0.26
      })
    }
  }
  function startParticles() {
    if (rafId) return
    if (!particles.length) initParticles()
    var accent = (THEMES[settings.theme] || THEMES.noble).color
    var tick = function () {
      rafId = requestAnimationFrame(tick)
      if (document.hidden || !settings || !settings.bg.enabled || settings.focusMode || !settings.effects.particles) return
      var w = particleCv.width, h = particleCv.height
      particleCtx.clearRect(0, 0, w, h)
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i]
        p.y -= p.vy; p.sway += p.swaySp
        p.x += Math.sin(p.sway) * 0.18
        if (p.y < -6) { p.y = h + 6; p.x = Math.random() * w }
        particleCtx.globalAlpha = p.a
        particleCtx.fillStyle = accent
        particleCtx.beginPath()
        particleCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        particleCtx.fill()
      }
      particleCtx.globalAlpha = 1
    }
    rafId = requestAnimationFrame(tick)
  }
  function stopParticles() { if (rafId) { cancelAnimationFrame(rafId); rafId = null } if (particleCtx) particleCtx.clearRect(0, 0, particleCv.width, particleCv.height) }

  // ---------- MAX 粒子爆发 ----------
  function fireBurst() {
    if (!settings.effects.maxBurst || reducedMotion() || !burstCv) return
    var wrap = burstCv.parentElement
    burstCv.width = wrap.offsetWidth + 20
    burstCv.height = wrap.offsetHeight + 60
    var thumb = document.getElementById('pz-thumb')
    var cx = thumb ? thumb.offsetLeft + 10 : burstCv.width - 20
    var cy = 40
    burstParts = []
    for (var i = 0; i < 64; i++) {
      var ang = Math.random() * Math.PI * 2
      var sp = 0.6 + Math.random() * 2.6
      burstParts.push({
        x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 0.4,
        r: 0.8 + Math.random() * 2, life: 1, decay: 0.012 + Math.random() * 0.02,
        gold: Math.random() < 0.6
      })
    }
    if (burstRaf) cancelAnimationFrame(burstRaf)
    var tick = function () {
      burstCtx.clearRect(0, 0, burstCv.width, burstCv.height)
      var alive = false
      for (var i = 0; i < burstParts.length; i++) {
        var p = burstParts[i]
        if (p.life <= 0) continue
        alive = true
        p.x += p.vx; p.y += p.vy; p.vy += 0.015; p.life -= p.decay
        burstCtx.globalAlpha = Math.max(0, p.life)
        burstCtx.fillStyle = p.gold ? '#e8b34b' : (THEMES[settings.theme] || THEMES.noble).color
        burstCtx.beginPath()
        burstCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        burstCtx.fill()
      }
      burstCtx.globalAlpha = 1
      if (alive) burstRaf = requestAnimationFrame(tick); else burstRaf = null
    }
    burstRaf = requestAnimationFrame(tick)
  }

  // ---------- DOM 构建 ----------
  function build() {
    rootEl = document.createElement('div')
    rootEl.id = 'pz-root'
    rootEl.innerHTML =
      '<div id="pz-bubble"></div>' +
      '<div id="pz-pill" class="hidden"></div>' +
      '<div id="pz-balance" class="pz-card pz-drawer hidden"></div>' +
      '<div id="pz-think" class="pz-card pz-drawer hidden"></div>' +
      '<div id="pz-usage" class="pz-card pz-drawer hidden"></div>' +
      '<div id="pz-settings" class="pz-card pz-drawer hidden"></div>' +
      '<div id="pz-pet">' +
      '  <div id="pz-menu" class="hidden"></div>' +
      '  <div id="pz-avatar-wrap"><div id="pz-ring"></div><img id="pz-avatar" alt="桌宠" draggable="false"><div id="pz-hearts"></div></div>' +
      '</div>'
    document.body.appendChild(rootEl)
    positionRoot()
    renderBalance(); renderThink(); renderMenu(); renderAvatar()
    bindAvatarDrag()
    // 挂件内部点击不外泄到 document：菜单回调会清空菜单 DOM，
    // 若冒泡到外部关闭判断，已脱离文档的按钮会被误判为“点在挂件外”而关掉刚打开的面板。
    rootEl.addEventListener('click', function (e) { e.stopPropagation() })
    // 点击挂件外部关闭所有浮层与菜单
    document.addEventListener('click', function (e) {
      if (!rootEl) return
      if (!e.target || !document.contains(e.target)) return // 节点已被挂件回调移除，按内部操作处理
      if (!rootEl.contains(e.target)) closeAll()
    })
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAll()
    })
  }
  function positionRoot() {
    if (!rootEl || !settings) return
    rootEl.style.right = settings.pet.right + 'px'
    rootEl.style.bottom = settings.pet.bottom + 'px'
    var scale = settings.pet.scale || 1
    var av = document.getElementById('pz-avatar-wrap')
    if (av) { av.style.width = 92 * scale + 'px'; av.style.height = 92 * scale + 'px' }
  }
  function closeAll() {
    menuOpen = false; activePanel = null
    renderMenu()
    PANELS.forEach(function (id) { var el = document.getElementById(id); if (el) el.classList.add('hidden') })
  }
  function openPanel(id) {
    menuOpen = false; renderMenu()
    PANELS.forEach(function (elId) {
      var el = document.getElementById(elId)
      if (!el) return
      var on = elId === id
      el.classList.toggle('hidden', !on)
    })
    activePanel = id
    if (id === 'pz-balance') renderBalance()
    else if (id === 'pz-think') renderThink()
    else if (id === 'pz-usage') renderUsage()
    else if (id === 'pz-settings') renderSettings()
  }

  // ---------- 余额面板 ----------
  function balanceMain() {
    if (!balance) return { text: '加载中…', cls: 'pz-muted', sub: '', dot: 'idle' }
    if (balance.status === 'ok') {
      var info = balance.infos && balance.infos[0]
      var cur = info && info.currency === 'USD' ? '$' : '¥'
      if (info && info.totalBalance != null) {
        var parts = []
        if (info.toppedUpBalance != null) parts.push('充值 ' + info.toppedUpBalance)
        if (info.grantedBalance != null) parts.push('赠金 ' + info.grantedBalance)
        return { text: cur + ' ' + info.totalBalance, cls: balance.isAvailable ? 'pz-ok' : 'pz-warn', sub: parts.join(' · ') + ' · ' + clock(balance.fetchedAt) + ' 更新', dot: balance.isAvailable ? 'ok' : 'bad' }
      }
      return { text: balance.isAvailable ? '可用' : '不可用', cls: 'pz-muted', sub: clock(balance.fetchedAt), dot: balance.isAvailable ? 'ok' : 'bad' }
    }
    if (balance.status === 'no-key') return { text: '未配置密钥', cls: 'pz-warn', sub: '设置→模型 填入 DEEPSEEK_API_KEY', dot: 'idle' }
    return { text: '查询失败', cls: 'pz-err', sub: balance.message || '', dot: 'bad' }
  }
  function modelRowHtml() {
    var m = currentModel()
    if (!m) return ''
    return '<div class="pz-model-row"><span class="pz-live-dot"></span><span>当前模型</span><span class="pz-model">' + esc(m) + '</span></div>'
  }
  function renderBalance() {
    var card = document.getElementById('pz-balance')
    if (!card) return
    var b = balanceMain()
    var per = (meta && meta.period) || null
    var live = usage && usage.live
    var cost = usage && usage.cost
    var cur = null
    if (usage && usage.activeSessionId && usage.sessions) {
      for (var i = 0; i < usage.sessions.length; i++) if (usage.sessions[i].sessionId === usage.activeSessionId) { cur = usage.sessions[i]; break }
    }
    var h = '<div class="pz-head" id="pz-balance-head">' +
      '<span class="pz-title"><svg class="pz-tree' + (live && settings.effects.planTree ? ' grow' : '') + '" viewBox="0 0 24 24"><path d="M12 22 V10 M12 14 L7 9 M12 12 L17 7 M7 9 L5 6 M7 9 L9 5 M17 7 L15 4 M17 7 L20 5"/><circle cx="5" cy="6" r="1.4"/><circle cx="9" cy="5" r="1.4"/><circle cx="15" cy="4" r="1.4"/><circle cx="20" cy="5" r="1.4"/><circle cx="12" cy="10" r="1.4"/></svg>' +
      '<span>能量储备 · 余额</span></span>' +
      '<span class="pz-spacer"></span>' +
      '<button class="pz-iconbtn" id="pz-refresh" title="刷新余额">' + (balanceBusy ? '…' : '⟳') + '</button>' +
      '<button class="pz-iconbtn" data-close title="收起">✕</button>' +
      '</div><div class="pz-body">'
    h += modelRowHtml()
    h += '<div class="pz-row" style="margin-top:6px"><span class="pz-big pz-val ' + b.cls + '">' + esc(b.text) + '</span><span class="pz-dot ' + b.dot + '" style="margin-top:8px"></span></div>'
    if (b.sub) h += '<div class="pz-muted" style="font-size:11px">' + esc(b.sub) + '</div>'
    if (per) {
      h += '<div class="pz-row" style="margin-top:7px"><span class="pz-period ' + (per.isPeak ? 'peak' : 'off') + '">' +
        (per.isPeak ? '⚡ 高峰 · 全价' : '🌙 空闲 · 半价') + '</span>' +
        '<span class="pz-muted pz-val" id="pz-countdown" style="font-size:11px">' + (per.nextChangeAt ? countdown(per.nextChangeAt) + ' 后切换' : '') + '</span></div>'
    }
    if (cost) {
      h += '<div class="pz-row" style="margin-top:7px;font-size:11px"><span class="pz-muted">当前会话 ≈ <span class="pz-val pz-accent">' + money(cur ? cur.cost : 0) + '</span></span>' +
        '<span class="pz-muted">今日 ≈ <span class="pz-val">' + money(cost.today) + '</span></span></div>'
    }
    if (live) h += '<div class="pz-accent" style="font-size:11px;margin-top:4px">▶ 计划树推演中 · ' + esc(live.model || '') + ' · 输出 ' + fmt(live.output) + '</div>'
    h += '<div class="pz-chiprow">' +
      '<span class="pz-chip ' + (settings.auto.refresh ? 'on' : '') + '" data-auto="refresh">自动刷新</span>' +
      '<span class="pz-chip ' + (settings.auto.priceAlign ? 'on' : '') + '" data-auto="priceAlign">峰谷对齐</span>' +
      '<span class="pz-chip ' + (settings.auto.peakAlert ? 'on' : '') + '" data-auto="peakAlert">峰谷提醒</span>' +
      '</div>'
    h += '<div class="pz-row" style="margin-top:8px">' +
      '<button class="pz-btn" id="pz-topup">去充值</button>' +
      '<button class="pz-btn" id="pz-usage-btn">用量详情</button>' +
      '</div>'
    h += '</div>'
    card.innerHTML = h
    var closeBtn = card.querySelector('[data-close]')
    if (closeBtn) closeBtn.onclick = closeAll
    document.getElementById('pz-refresh').onclick = function () { loadBalance(true) }
    document.getElementById('pz-topup').onclick = function () { window.open('https://platform.deepseek.com/usage', '_blank', 'noopener') }
    document.getElementById('pz-usage-btn').onclick = function () { openPanel('pz-usage'); renderUsage() }
    var chips = card.querySelectorAll('[data-auto]')
    for (var j = 0; j < chips.length; j++) {
      chips[j].onclick = function () {
        var k = this.getAttribute('data-auto')
        var patch = { auto: {} }; patch.auto[k] = !settings.auto[k]
        postSettings(patch)
        renderBalance()
        if (k === 'refresh') restartBalancePoll()
      }
    }
  }

  // ---------- 思考强度滑条（Astra effort 风格） ----------
  function effortStops() {
    var levels = (meta && meta.efforts && meta.efforts.levels) || [{ id: 'low' }, { id: 'medium' }, { id: 'high' }, { id: 'max' }]
    return [{ id: 'auto' }].concat(levels)
  }
  function renderThink() {
    var card = document.getElementById('pz-think')
    if (!card) return
    var stops = effortStops()
    var cur = settings.thinking.effort || 'auto'
    var idx = 0
    for (var i = 0; i < stops.length; i++) if (stops[i].id === cur) idx = i
    var isMax = idx === stops.length - 1 && stops.length > 1
    var pct = stops.length > 1 ? idx / (stops.length - 1) * 100 : 0
    var zh = EFFORT_ZH[cur] || cur
    var astra = EFFORT_ASTRA[cur] || ''
    var praze = EFFORT_PRAZE[cur] || ''
    var src = meta && meta.efforts && meta.efforts.source === 'api' ? '官方档位' : '备用档位'
    var h = '<div class="pz-head"><span class="pz-title">✦ 思考强度</span><span class="pz-spacer"></span>' +
      '<span class="pz-muted" style="font-size:10px;font-weight:400">' + src + '</span>' +
      '<button class="pz-iconbtn" data-close title="收起">✕</button></div>'
    h += '<div class="pz-body" id="pz-think-body">' +
      modelRowHtml() +
      '<div class="pz-think-label" style="margin-top:6px"><span class="pz-muted">Astra effort · 耦合强度</span><span class="pz-think-level">' + esc(zh) + (astra ? ' · ' + esc(astra) : '') + '</span></div>' +
      '<div class="pz-slider-wrap' + (isMax ? ' max' : '') + '" id="pz-slider-wrap">' +
      '<canvas id="pz-burst"></canvas>' +
      '<div class="pz-slider-track" id="pz-track"><div class="pz-slider-fill" style="width:' + pct + '%"></div>' +
      '<div class="pz-slider-thumb" id="pz-thumb" style="left:' + pct + '%" tabindex="0" role="slider" aria-label="思考强度" aria-valuemin="0" aria-valuemax="' + (stops.length - 1) + '" aria-valuenow="' + idx + '"></div></div>' +
      '<div class="pz-stops">'
    for (var s = 0; s < stops.length; s++) {
      var sp = stops.length > 1 ? s / (stops.length - 1) * 100 : 0
      var label = EFFORT_ZH[stops[s].id] || stops[s].id
      h += '<span class="pz-stop' + (s === idx ? ' active' : '') + (s === stops.length - 1 ? ' maxstop' : '') + '" data-idx="' + s + '" style="left:' + sp + '%">' + esc(label) + '</span>'
    }
    h += '</div></div>' +
      '<div class="pz-think-sub" style="margin-top:2px">' + esc(praze) + '</div>' +
      '<div class="pz-muted" style="font-size:10px;margin-top:2px">' +
      (cur === 'auto' ? '跟随会话默认档位' : '下一次模型请求起生效 · reasoning_effort=' + esc(cur)) + '</div>' +
      '</div>'
    card.innerHTML = h
    var closeBtn = card.querySelector('[data-close]')
    if (closeBtn) closeBtn.onclick = closeAll
    burstCv = document.getElementById('pz-burst')
    burstCtx = burstCv.getContext('2d')
    var track = document.getElementById('pz-track')
    var thumb = document.getElementById('pz-thumb')
    var setIdx = function (ni, fire) {
      ni = Math.max(0, Math.min(stops.length - 1, ni))
      if (ni === idx && !fire) return
      var wasMax = idx === stops.length - 1
      idx = ni
      var id = stops[idx].id
      postSettings({ thinking: { effort: id } })
      renderThink()
      if (idx === stops.length - 1 && !wasMax) {
        fireBurst()
        say('MAX 档位！耦合能全开——粒子都溢出来了✨')
        cheer()
      }
    }
    var fromEvent = function (e) {
      var r = track.getBoundingClientRect()
      var x = (e.clientX - r.left) / r.width
      return Math.round(x * (stops.length - 1))
    }
    var dragging = false
    thumb.addEventListener('pointerdown', function (e) { dragging = true; thumb.setPointerCapture(e.pointerId); e.preventDefault() })
    thumb.addEventListener('pointermove', function (e) { if (dragging) setIdx(fromEvent(e), false) })
    thumb.addEventListener('pointerup', function () { if (dragging) { dragging = false; setIdx(fromEvent(e), true) } })
    thumb.addEventListener('pointercancel', function () { dragging = false })
    track.addEventListener('pointerdown', function (e) { setIdx(fromEvent(e), true) })
    thumb.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { setIdx(idx + 1, true); e.preventDefault() }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { setIdx(idx - 1, true); e.preventDefault() }
    })
    var stopEls = card.querySelectorAll('.pz-stop')
    for (var q = 0; q < stopEls.length; q++) {
      stopEls[q].onclick = function () { setIdx(+this.getAttribute('data-idx'), true) }
    }
  }

  // ---------- 桌宠 ----------
  function renderAvatar() {
    var img = document.getElementById('pz-avatar')
    if (img) img.src = API + '/assets/avatar.png'
    var pet = document.getElementById('pz-pet')
    var pill = document.getElementById('pz-pill')
    if (settings.pet.visible) {
      if (pet) pet.style.display = ''
      if (pill) pill.classList.add('hidden')
      return
    }
    if (pet) pet.style.display = 'none'
    if (pill) {
      pill.classList.remove('hidden')
      pill.innerHTML = '<span>🐳</span><span class="pz-muted">召唤' + esc(settings.pet.name) + '</span>'
      pill.onclick = function () { postSettings({ pet: { visible: true } }); renderAvatar() }
    }
  }
  function cheer() {
    var img = document.getElementById('pz-avatar')
    if (!img) return
    img.src = API + '/assets/avatar-happy.png'
    setTimeout(function () { img.src = API + '/assets/avatar.png' }, 2200)
  }
  function spawnHearts() {
    var box = document.getElementById('pz-hearts')
    if (!box) return
    for (var i = 0; i < 4; i++) {
      var s = document.createElement('span')
      s.className = 'pz-heart'
      s.textContent = pick(['♥', '♡', '✦'])
      s.style.left = 25 + Math.random() * 50 + '%'
      s.style.animationDelay = i * 0.12 + 's'
      box.appendChild(s)
      setTimeout(function (el) { return function () { el.remove() } }(s), 1400)
    }
  }
  function bindAvatarDrag() {
    var wrap = document.getElementById('pz-avatar-wrap')
    if (!wrap) return
    var sx = 0, sy = 0, sr = 0, sb = 0, dragging = false, moved = false
    wrap.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return
      dragging = true; moved = false
      sx = e.clientX; sy = e.clientY
      sr = settings.pet.right; sb = settings.pet.bottom
      try { wrap.setPointerCapture(e.pointerId) } catch (err) {}
      wrap.classList.add('dragging')
    })
    wrap.addEventListener('pointermove', function (e) {
      if (!dragging) return
      var dx = e.clientX - sx, dy = e.clientY - sy
      if (!moved && Math.abs(dx) + Math.abs(dy) > 5) moved = true
      if (!moved) return
      var nr = Math.max(0, Math.min(window.innerWidth - 100, sr - dx))
      var nb = Math.max(0, Math.min(window.innerHeight - 60, sb - dy))
      rootEl.style.right = nr + 'px'; rootEl.style.bottom = nb + 'px'
    })
    function endDrag() {
      if (!dragging) return
      dragging = false
      wrap.classList.remove('dragging')
    }
    wrap.addEventListener('pointerup', function () {
      if (moved) {
        postSettings({ pet: { right: parseInt(rootEl.style.right, 10) || 18, bottom: parseInt(rootEl.style.bottom, 10) || 18 } })
      }
      endDrag()
    })
    wrap.addEventListener('pointercancel', endDrag)
    // 点击（非拖动）：上半摸头，下半开关菜单。点击判定放在 click 阶段，
    // 与拖动分离，避免 pointer capture 的事件重定向把点击误判成拖拽/摸头。
    wrap.addEventListener('click', function (e) {
      if (moved) { moved = false; return }
      var r = wrap.getBoundingClientRect()
      var y = (e.clientY - r.top) / r.height
      if (y < 0.45) {
        wrap.classList.remove('pat'); void wrap.offsetWidth; wrap.classList.add('pat')
        spawnHearts(); cheer()
        say(pick(PAT_LINES))
      } else {
        menuOpen = !menuOpen
        renderMenu()
      }
    })
  }
  function renderMenu() {
    var menu = document.getElementById('pz-menu')
    if (!menu) return
    menu.className = menuOpen ? '' : 'hidden'
    if (!menuOpen) { menu.innerHTML = ''; return }
    var items = [
      ['💰 余额储备', function () { openPanel('pz-balance') }],
      ['✦ 思考强度', function () { openPanel('pz-think') }],
      ['📊 用量详情', function () { openPanel('pz-usage'); renderUsage() }],
      ['⚙ 设置', function () { openPanel('pz-settings') }],
      ['🙈 隐藏桌宠', function () { postSettings({ pet: { visible: false } }); menuOpen = false; renderMenu(); renderAvatar() }]
    ]
    menu.innerHTML = ''
    for (var i = 0; i < items.length; i++) {
      var b = document.createElement('button')
      b.className = 'pz-menu-btn'
      b.textContent = items[i][0]
      b.onclick = items[i][1]
      menu.appendChild(b)
    }
  }

  // ---------- 气泡 ----------
  function say(text, ms) {
    var b = document.getElementById('pz-bubble')
    if (!b) return
    b.textContent = text
    b.classList.add('show')
    if (b._timer) clearTimeout(b._timer)
    b._timer = setTimeout(function () { b.classList.remove('show') }, ms || 4200)
  }

  // ---------- 用量详情 ----------
  function renderUsage() {
    var el = document.getElementById('pz-usage')
    if (!el) return
    var h = '<div class="pz-head"><span class="pz-title">📊 用量与费用估算</span><span class="pz-spacer"></span><button class="pz-iconbtn" data-close>✕</button></div><div class="pz-body">'
    var closeBtn = el.querySelector('[data-close]')
    if (!usage) { h += '<div class="pz-muted">加载中…</div>' }
    else {
      var t = usage.total, c = usage.cost || {}
      var m = currentModel()
      if (m) h += '<div class="pz-model-row"><span class="pz-live-dot"></span><span>当前模型</span><span class="pz-model">' + esc(m) + '</span></div>'
      h += '<div class="pz-sec-title">全部会话（本次运行）</div>'
      h += '<div class="pz-row pz-val"><span>输入 ' + fmt(t.input) + ' · 输出 ' + fmt(t.output) + '</span><span>缓存 ' + fmt(t.cacheRead) + '</span></div>'
      h += '<div class="pz-row pz-val"><span>调用 ' + t.calls + ' 次' + (t.reasoning ? ' · 推理 ' + fmt(t.reasoning) : '') + '</span><span class="pz-accent">累计 ≈ ' + money(c.total) + '</span></div>'
      h += '<div class="pz-muted" style="font-size:10px">' + esc(c.note || '') + '</div>'
      h += '<div class="pz-sec-title">分会话 Top ' + Math.min(usage.sessions.length, 8) + '</div>'
      if (!usage.sessions.length) h += '<div class="pz-muted">暂无记录</div>'
      for (var i = 0; i < Math.min(usage.sessions.length, 8); i++) {
        var s = usage.sessions[i]
        h += '<div class="pz-usage-row"><div class="pz-row"><span class="pz-muted">' + esc(String(s.sessionId).slice(0, 12)) + '…' + (s.model ? ' · ' + esc(s.model) : '') + '</span><span class="pz-val pz-accent">' + money(s.cost) + '</span></div>' +
          '<div class="pz-muted" style="font-size:11px">in ' + fmt(s.input) + ' / out ' + fmt(s.output) + ' / cache ' + fmt(s.cacheRead) + ' · ' + s.calls + ' 次</div></div>'
      }
    }
    h += '</div>'
    el.innerHTML = h
    var cb = el.querySelector('[data-close]')
    if (cb) cb.onclick = closeAll
  }

  // ---------- 设置 ----------
  var settingsTab = 'look'
  function renderSettings() {
    var el = document.getElementById('pz-settings')
    if (!el) return
    var tabs = [['look', '外观'], ['fx', '特效'], ['pet', '桌宠'], ['price', '价格'], ['about', '关于']]
    var h = '<div class="pz-head"><span class="pz-title">⚙ 插件设置</span><span class="pz-spacer"></span><button class="pz-iconbtn" data-close>✕</button></div><div class="pz-tabs">'
    for (var i = 0; i < tabs.length; i++) h += '<span class="pz-tab' + (settingsTab === tabs[i][0] ? ' active' : '') + '" data-tab="' + tabs[i][0] + '">' + tabs[i][1] + '</span>'
    h += '</div><div class="pz-body" id="pz-set-body"></div>'
    el.innerHTML = h
    var cb = el.querySelector('[data-close]'); if (cb) cb.onclick = closeAll
    var tabEls = el.querySelectorAll('.pz-tab')
    for (var j = 0; j < tabEls.length; j++) tabEls[j].onclick = function () { settingsTab = this.getAttribute('data-tab'); renderSettings() }
    var body = document.getElementById('pz-set-body')
    if (settingsTab === 'look') renderLook(body)
    else if (settingsTab === 'fx') renderFx(body)
    else if (settingsTab === 'pet') renderPet(body)
    else if (settingsTab === 'price') renderPrice(body)
    else renderAbout(body)
  }
  function checkRow(label, checked, cb) {
    var l = document.createElement('label'); l.className = 'pz-check'
    var c = document.createElement('input'); c.type = 'checkbox'; c.checked = checked
    c.onchange = function () { cb(c.checked) }
    l.appendChild(c); l.appendChild(document.createTextNode(label))
    return l
  }
  function rangeRow(label, val, min, max, step, cb) {
    var d = document.createElement('div'); d.className = 'pz-field'
    var l = document.createElement('label'); l.textContent = label
    var r = document.createElement('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = val
    r.oninput = function () { cb(+r.value) }
    d.appendChild(l); d.appendChild(r)
    return d
  }
  function renderLook(body) {
    body.appendChild(checkRow('启用背景图（不影响文字阅读）', settings.bg.enabled, function (v) { postSettings({ bg: { enabled: v } }); ensureBg() }))
    body.appendChild(rangeRow('背景透出程度 ' + Math.round(settings.bg.show * 100) + '%', settings.bg.show, 0, 0.85, 0.01, function (v) { postSettings({ bg: { show: v } }); ensureBg() }))
    body.appendChild(rangeRow('背景柔化纱罩 ' + Math.round(settings.bg.veil * 100) + '%', settings.bg.veil, 0, 0.9, 0.01, function (v) { postSettings({ bg: { veil: v } }); ensureBg() }))
    body.appendChild(checkRow('专注模式（隐藏背景与全部特效）', settings.focusMode, function (v) { postSettings({ focusMode: v }); ensureBg(); applyTheme() }))
    body.appendChild(checkRow('进入工作台时显示欢迎页', !!settings.welcome, function (v) { postSettings({ welcome: v }) }))
    var t = document.createElement('div'); t.className = 'pz-field'
    var l = document.createElement('label'); l.textContent = '投射主题（Praze 四象限）'
    t.appendChild(l)
    var row = document.createElement('div'); row.className = 'pz-theme-row'
    for (var k in THEMES) {
      var dot = document.createElement('span')
      dot.className = 'pz-theme-dot' + (settings.theme === k ? ' active' : '')
      dot.style.background = THEMES[k].color
      dot.title = THEMES[k].name
      dot.setAttribute('data-theme', k)
      dot.onclick = function () { postSettings({ theme: this.getAttribute('data-theme') }); renderSettings(); startParticles() }
      row.appendChild(dot)
    }
    t.appendChild(row); body.appendChild(t)
  }
  function renderFx(body) {
    body.appendChild(checkRow('P空间粒子背景（低干扰漂浮微粒）', settings.effects.particles, function (v) { postSettings({ effects: { particles: v } }); ensureBg() }))
    body.appendChild(checkRow('计划树推演指示（模型工作时金色枝桠生长）', settings.effects.planTree, function (v) { postSettings({ effects: { planTree: v } }); renderBalance() }))
    body.appendChild(checkRow('MAX 档位粒子爆发', settings.effects.maxBurst, function (v) { postSettings({ effects: { maxBurst: v } }) }))
    var note = document.createElement('div'); note.className = 'pz-muted'; note.style.fontSize = '10px'
    note.textContent = '遵循系统「减弱动态效果」设置；页面切到后台时粒子自动暂停。'
    body.appendChild(note)
  }
  function renderPet(body) {
    var f1 = document.createElement('div'); f1.className = 'pz-field'
    f1.innerHTML = '<label>桌宠名字</label>'
    var i1 = document.createElement('input'); i1.type = 'text'; i1.value = settings.pet.name; i1.maxLength = 20
    i1.onchange = function () { postSettings({ pet: { name: i1.value || '小鲸' } }) }
    f1.appendChild(i1); body.appendChild(f1)
    var f2 = document.createElement('div'); f2.className = 'pz-field'
    f2.innerHTML = '<label>对你的称呼</label>'
    var i2 = document.createElement('input'); i2.type = 'text'; i2.value = settings.pet.userName; i2.maxLength = 30
    i2.onchange = function () { postSettings({ pet: { userName: i2.value || 'ZpycuA' } }) }
    f2.appendChild(i2); body.appendChild(f2)
    body.appendChild(rangeRow('大小 ' + Math.round(settings.pet.scale * 100) + '%', settings.pet.scale, 0.6, 1.6, 0.05, function (v) { postSettings({ pet: { scale: v } }); positionRoot() }))
    body.appendChild(checkRow('显示桌宠', settings.pet.visible, function (v) { postSettings({ pet: { visible: v } }); renderAvatar(); renderBalance() }))
    var b = document.createElement('button'); b.className = 'pz-btn'; b.textContent = '重置位置到右下角'
    b.onclick = function () { postSettings({ pet: { right: 18, bottom: 18 } }); positionRoot() }
    body.appendChild(b)
  }
  function renderPrice(body) {
    var note = document.createElement('div'); note.className = 'pz-muted'; note.style.fontSize = '10px'
    note.textContent = '单位：元/百万 tokens。默认值来自 DeepSeek 官方价格页（2026-11-14 口径），官方调价后请在此更新。费用为估算，以官方账单为准。'
    body.appendChild(note)
    var kinds = [['flash', 'deepseek-flash'], ['pro', 'deepseek-v4-pro']]
    var periods = [['off', '空闲'], ['peak', '高峰']]
    var fields = [['hit', '输入·缓存命中'], ['miss', '输入·未命中'], ['out', '输出']]
    for (var a = 0; a < kinds.length; a++) {
      for (var bIdx = 0; bIdx < periods.length; bIdx++) {
        var title = document.createElement('div'); title.className = 'pz-sec-title'
        title.textContent = kinds[a][1] + ' · ' + periods[bIdx][1]
        body.appendChild(title)
        for (var c = 0; c < fields.length; c++) {
          var f = document.createElement('div'); f.className = 'pz-field'
          var lb = document.createElement('label'); lb.textContent = fields[c][1]
          var inp = document.createElement('input'); inp.type = 'number'; inp.step = '0.01'; inp.min = '0'
          inp.value = settings.prices[kinds[a][0]][periods[bIdx][0]][fields[c][0]]
          inp.setAttribute('data-k', kinds[a][0]); inp.setAttribute('data-p', periods[bIdx][0]); inp.setAttribute('data-f', fields[c][0])
          inp.onchange = function () {
            var patch = { prices: {} }
            var kk = this.getAttribute('data-k'), pp = this.getAttribute('data-p'), ff = this.getAttribute('data-f')
            patch.prices[kk] = {}; patch.prices[kk][pp] = {}
            patch.prices[kk][pp][ff] = Math.max(0, +this.value || 0)
            postSettings(patch)
          }
          f.appendChild(lb); f.appendChild(inp); body.appendChild(f)
        }
      }
    }
    var ht = document.createElement('div'); ht.className = 'pz-field'
    ht.innerHTML = '<label>法定节假日（每行一个 YYYY-MM-DD，影响峰谷判定）</label>'
    var ta = document.createElement('textarea'); ta.value = (settings.holidays || []).join('\n')
    ta.onchange = function () {
      var list = ta.value.split(/\n+/).map(function (s) { return s.trim() }).filter(function (s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) })
      postSettings({ holidays: list })
    }
    ht.appendChild(ta); body.appendChild(ht)
    var rb = document.createElement('button'); rb.className = 'pz-btn'; rb.textContent = '恢复默认价格与节假日'
    rb.onclick = function () {
      if (meta && meta.defaults) postSettings({ prices: meta.defaults.prices, holidays: meta.defaults.holidays })
      renderSettings()
    }
    body.appendChild(rb)
  }
  function renderAbout(body) {
    var h = '<div class="pz-sec-title">dsh-praze-skin v' + (meta ? meta.version : '1.1.0') + '</div>' +
      '<div class="pz-muted" style="font-size:11px">Praze 主题皮肤插件：背景、鲸鱼娘桌宠、余额/峰谷面板、思考强度滑条与 P空间特效。非官方社区插件，与深度求索无隶属关系。</div>' +
      '<div class="pz-sec-title">开源与素材署名</div>' +
      '<div class="pz-muted" style="font-size:11px">' +
      '· 接入范式参考 dsh-token-monitor（MIT, chencmb2077-ui）<br>' +
      '· 宿主框架 DeepSeek Harness / Cordis（MIT, DeepSeek-AI）<br>' +
      '· 背景图：ZpycuA 提供（© ZpycuA）<br>' +
      '· Q版鲸鱼娘头像：本项目 AI 生成原创素材，参考社区「DeepSeek娘」同人形象特征（蓝发女仆+鲸鱼尾），非官方素材；原始角色形象致谢 上善 / ZipZipPipe<br>' +
      '· Praze 世界观设定：© 2026 ZpycuA（CC BY-NC 4.0）<br>' +
      '· 价格与节假日数据：DeepSeek 官方文档 / 国务院办公厅通知<br>' +
      '· 本插件代码：MIT。详见包内 NOTICE.md' +
      '</div>' +
      '<div class="pz-sec-title">链接</div>' +
      '<div style="font-size:11px"><a href="https://github.com/deepseek-ai/deepseek-harness" target="_blank" rel="noopener" style="color:var(--pz-accent)">DeepSeek Harness</a> · ' +
      '<a href="https://zpycua.github.io/Praze_Site/" target="_blank" rel="noopener" style="color:var(--pz-accent)">Praze 设定集</a> · ' +
      '<a href="https://api-docs.deepseek.com/zh-cn/quick_start/pricing" target="_blank" rel="noopener" style="color:var(--pz-accent)">官方价格</a></div>'
    body.innerHTML = h
  }

  // ---------- 欢迎页 ----------
  function ensureWelcome() {
    var w = document.getElementById('pz-welcome')
    if (w) return w
    w = document.createElement('div')
    w.id = 'pz-welcome'
    document.body.appendChild(w)
    return w
  }
  function showWelcome() {
    if (!settings.welcome) return
    var w = ensureWelcome()
    var m = currentModel()
    var eff = settings.thinking.effort || 'auto'
    var effZh = EFFORT_ZH[eff] || eff
    var b = balanceMain()
    var per = meta && meta.period
    var theme = THEMES[settings.theme] || THEMES.noble
    w.innerHTML =
      '<div class="pz-w-card">' +
      '<div class="pz-w-mark"><svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M12 3l7.5 4.3v8.6L12 20.2 4.5 15.9V7.3L12 3z" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 8l3 1.7v3.4l-3 1.7-3-1.7V9.7L12 8z" fill="#fff" opacity=".85"/></svg></div>' +
      '<div class="pz-w-title">Praze Skin</div>' +
      '<div class="pz-w-sub">Praze 主题 · DeepSeek Harness 皮肤插件 v' + (meta ? meta.version : '1.1.0') + '</div>' +
      '<div class="pz-w-meta">' +
      '<div class="pz-row"><span class="pz-muted">投射主题</span><b>' + esc(theme.name) + '</b></div>' +
      '<div class="pz-row"><span class="pz-muted">当前模型</span><b>' + (m ? esc(m) : '未接入') + '</b></div>' +
      '<div class="pz-row"><span class="pz-muted">思考强度</span><b>' + esc(effZh) + '</b></div>' +
      '<div class="pz-row"><span class="pz-muted">能量储备</span><b class="' + b.cls + '">' + esc(b.text) + '</b></div>' +
      (per ? '<div class="pz-row"><span class="pz-muted">峰谷状态</span><b>' + esc(per.label) + '</b></div>' : '') +
      '</div>' +
      '<div class="pz-w-actions"><button class="pz-btn primary" id="pz-w-enter">进入工作台</button></div>' +
      '</div>'
    w.classList.add('show')
    var enter = function () { w.classList.remove('show') }
    w.querySelector('#pz-w-enter').onclick = enter
    w.addEventListener('click', function (e) { if (e.target === w) enter() })
    // 3.2s 后自动进入（不强制停留）
    setTimeout(function () { w.classList.remove('show') }, 3200)
  }

  // ---------- 数据轮询 ----------
  function loadUsage() {
    fetch(API + '/usage').then(function (r) { return r.json() }).then(function (v) {
      usage = v
      renderBalance()
      var u = document.getElementById('pz-usage')
      if (u && !u.classList.contains('hidden')) renderUsage()
    }).catch(function () {})
  }
  function loadBalance(force) {
    if (balanceBusy) return
    balanceBusy = true; renderBalance()
    fetch(API + '/balance' + (force ? '?force=1' : '')).then(function (r) { return r.json() }).then(function (v) {
      balance = v; balanceBusy = false; renderBalance()
    }).catch(function () { balanceBusy = false; renderBalance() })
  }
  function loadMeta() {
    fetch(API + '/meta').then(function (r) { return r.json() }).then(function (v) {
      var oldPeak = meta && meta.period ? meta.period.isPeak : null
      meta = v
      renderThink()
      renderBalance()
      var per = v.period
      if (per && oldPeak !== null && oldPeak !== per.isPeak && settings.auto.peakAlert) {
        say(per.isPeak ? '⚡ 高峰时段开始了，API 恢复全价。大任务可以挪到空闲时段哦～' : '🌙 空闲时段来啦，API 半价！适合跑批量任务～', 6500)
        if (!per.isPeak) cheer()
      }
    }).catch(function () {})
  }
  var balanceTimer = null
  function restartBalancePoll() {
    if (balanceTimer) clearInterval(balanceTimer)
    if (settings.auto.refresh) balanceTimer = setInterval(function () { loadBalance(false) }, (settings.auto.refreshSec || 60) * 1000)
  }

  // ---------- 启动 ----------
  function boot() {
    Promise.all([
      fetch(API + '/settings').then(function (r) { return r.json() }),
      fetch(API + '/meta').then(function (r) { return r.json() }),
      fetch(API + '/balance').then(function (r) { return r.json() }),
      fetch(API + '/usage').then(function (r) { return r.json() })
    ]).then(function (rs) {
      settings = rs[0].settings
      meta = rs[1]
      balance = rs[2]
      usage = rs[3]
      dark = detectDark()
      applyTheme()
      build()
      ensureBg()
      restartBalancePoll()
      setInterval(loadUsage, 2500)
      setInterval(loadMeta, 60000)
      setInterval(function () {
        dark = detectDark(); applyTheme()
        if (settings.bg.enabled && !settings.focusMode) makeAppTranslucent()
        var cd = document.getElementById('pz-countdown')
        if (cd && meta && meta.period && meta.period.nextChangeAt) cd.textContent = countdown(meta.period.nextChangeAt) + ' 后切换'
      }, 5000)
      showWelcome()
      setTimeout(function () {
        var g = pick(GREET_LINES).replace('{name}', settings.pet.name).replace('{user}', settings.pet.userName)
        say(g, 5200)
      }, 1400)
    }).catch(function () {
      // Host 未就绪时静默重试
      setTimeout(boot, 3000)
    })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
  else boot()
})()
