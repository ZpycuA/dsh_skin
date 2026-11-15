// dsh-praze-skin — DeepSeek Harness 皮肤插件（Praze 主题）
// 静态 Host 插件：无客户端 bundle、无构建步骤。
// 通过 webServer.register 提供 JSON/静态资源路由，通过 tapIndex 向 Web 壳注入
// 纯 vanilla JS 挂件（右下角鲸鱼娘桌宠 + 余额/峰谷面板 + 思考强度滑条 + Praze 特效）。
//
// 设计参考社区范例 dsh-token-monitor（MIT）的正规接入通道：
//   - session/event 持久用量统计（去重的 provider TokenUsage）
//   - llm/stream 瀑布钩子：在途调用可见性 + 思考强度(reasoningEffort)注入
//   - credentials 解析 DEEPSEEK_API_KEY，node 子进程请求官方 API（密钥不出本机、不进浏览器）
//
// 安装：dsh plugin --profile web add file:/path/to/dsh-praze-skin
// 卸载：dsh plugin --profile web remove dsh-praze-skin

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

export const name = 'praze-skin'
export const inject = ['webServer']

const VERSION = '1.2.0'
const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url))
const BALANCE_TTL_MS = 60000
const MODELS_TTL_MS = 3600000

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// ---------------------------------------------------------------------------
// 峰谷时段（北京时间）。官方规则（2026-11 口径）：
// 周一至周五（不含中国法定节假日）9:00-12:00、14:00-18:00 为高峰；
// 其余时段（含周末与法定节假日全天，调休上班的周末仍按周末）为空闲，价格减半。
// ---------------------------------------------------------------------------

const HOLIDAYS_2026 = [
  '2026-01-01', '2026-01-02', '2026-01-03',
  '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
  '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
  '2026-04-04', '2026-04-05', '2026-04-06',
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  '2026-06-19', '2026-06-20', '2026-06-21',
  '2026-09-25', '2026-09-26', '2026-09-27',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
  '2026-10-06', '2026-10-07',
]
const HOLIDAYS_2027 = [
  '2027-01-01', '2027-01-02', '2027-01-03',
  '2027-02-05', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09',
  '2027-02-10', '2027-02-11', '2027-02-12', '2027-02-13',
  '2027-04-03', '2027-04-04', '2027-04-05',
  '2027-05-01', '2027-05-02', '2027-05-03', '2027-05-04', '2027-05-05',
  '2027-06-09',
  '2027-09-15',
  '2027-10-01', '2027-10-02', '2027-10-03', '2027-10-04', '2027-10-05',
  '2027-10-06', '2027-10-07',
]

// 官方价格（元/百万 tokens，2026-11-14 官方「模型 & 价格」页口径，可在设置中编辑）
const DEFAULT_PRICES = {
  flash: { off: { hit: 0.02, miss: 1, out: 4 }, peak: { hit: 0.04, miss: 2, out: 8 } },
  pro: { off: { hit: 0.15, miss: 4.5, out: 13.5 }, peak: { hit: 0.3, miss: 9, out: 27 } },
}

const DEFAULT_SETTINGS = {
  bg: { enabled: true, show: 0.32, veil: 0.30 },
  focusMode: false,
  theme: 'noble', // noble=崇高蓝 sacred=神圣金 calling=感召青 illusory=虚妄紫
  effects: { particles: true, planTree: true, maxBurst: true },
  pet: { visible: true, name: '小鲸', userName: 'ZpycuA', scale: 1, right: 18, bottom: 18 },
  auto: { refresh: true, refreshSec: 60, priceAlign: true, peakAlert: true },
  thinking: { effort: 'auto' },
  welcome: true, // 进入工作台时展示欢迎页
  prices: DEFAULT_PRICES,
  holidays: HOLIDAYS_2026.concat(HOLIDAYS_2027),
}

function storageDir() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return path.join(home, 'storages', 'dsh-praze-skin')
}

function loadSettings() {
  try {
    const file = path.join(storageDir(), 'settings.json')
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    return mergeSettings(DEFAULT_SETTINGS, raw)
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
  }
}

function deepMerge(base, patch) {
  const out = JSON.parse(JSON.stringify(base))
  if (!patch || typeof patch !== 'object') return out
  for (const key of Object.keys(out)) {
    if (!(key in patch)) continue
    const v = patch[key]
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof out[key] === 'object' && !Array.isArray(out[key])) {
      out[key] = deepMerge(out[key], v)
    } else if (Array.isArray(out[key])) {
      if (Array.isArray(v)) out[key] = v.filter((x) => typeof x === 'string').slice(0, 800)
    } else if (typeof out[key] === typeof v) {
      out[key] = v
    }
  }
  return out
}

function mergeSettings(base, patch) {
  const out = deepMerge(base, patch)
  // 数值边界（仅在顶层执行一次）
  out.bg.show = clamp(num(out.bg.show), 0, 0.85)
  out.bg.veil = clamp(num(out.bg.veil), 0, 0.9)
  out.pet.scale = clamp(num(out.pet.scale), 0.6, 1.6)
  out.pet.right = clamp(num(out.pet.right), 0, 4000)
  out.pet.bottom = clamp(num(out.pet.bottom), 0, 4000)
  out.auto.refreshSec = clamp(Math.round(num(out.auto.refreshSec)), 15, 600)
  if (!['noble', 'sacred', 'calling', 'illusory'].includes(out.theme)) out.theme = 'noble'
  if (typeof out.thinking.effort !== 'string') out.thinking.effort = 'auto'
  if (typeof out.pet.name !== 'string' || !out.pet.name) out.pet.name = '小鲸'
  if (typeof out.pet.userName !== 'string' || !out.pet.userName) out.pet.userName = 'ZpycuA'
  out.pet.name = out.pet.name.slice(0, 20)
  out.pet.userName = out.pet.userName.slice(0, 30)
  out.welcome = !!out.welcome
  return out
}

function saveSettings(settings) {
  try {
    const dir = storageDir()
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(settings, null, 2), 'utf8')
  } catch (e) {
    // 存储失败不致命
  }
}

// ---- 北京时间与峰谷判定 ----
function bjParts(ts) {
  const d = new Date(ts + 8 * 3600 * 1000)
  const p = (x) => String(x).padStart(2, '0')
  return {
    y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, day: d.getUTCDate(),
    h: d.getUTCHours(), min: d.getUTCMinutes(), wd: d.getUTCDay(),
    key: d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()),
  }
}

function isPeakAt(ts, holidaySet) {
  const p = bjParts(ts)
  if (p.wd === 0 || p.wd === 6) return false
  if (holidaySet.has(p.key)) return false
  return (p.h >= 9 && p.h < 12) || (p.h >= 14 && p.h < 18)
}

function periodInfo(settings, ts) {
  const holidaySet = new Set(settings.holidays || [])
  const now = ts || Date.now()
  const peak = isPeakAt(now, holidaySet)
  // 向前扫描下一个状态切换点（分钟粒度，最多 8 天）
  let next = null
  const minute = 60000
  const start = Math.floor(now / minute) * minute
  for (let t = start + minute; t <= start + 8 * 24 * 60 * minute; t += minute) {
    if (isPeakAt(t, holidaySet) !== peak) { next = t; break }
  }
  const p = bjParts(now)
  return {
    isPeak: peak,
    label: peak ? '高峰时段' : '空闲时段',
    factor: peak ? 1 : 0.5,
    nextChangeAt: next,
    bjTime: p.key + ' ' + String(p.h).padStart(2, '0') + ':' + String(p.min).padStart(2, '0'),
    rule: '工作日 9:00-12:00 / 14:00-18:00 为高峰（北京时间），其余含周末与法定节假日为空闲，空闲价格为高峰一半。',
  }
}

function priceFor(settings, model, peak) {
  const table = settings.prices || DEFAULT_PRICES
  const kind = /pro/i.test(String(model || '')) ? 'pro' : 'flash'
  const t = table[kind] || DEFAULT_PRICES[kind]
  return (peak ? t.peak : t.off) || DEFAULT_PRICES[kind].off
}

function estimateCost(settings, usage, model, ts) {
  const peak = isPeakAt(ts || Date.now(), new Set(settings.holidays || []))
  const p = priceFor(settings, model, peak)
  const input = num(usage.inputTokens)
  const cacheRead = num(usage.cacheReadTokens)
  const output = num(usage.outputTokens)
  const miss = input > cacheRead ? input - cacheRead : input
  return (cacheRead * p.hit + miss * p.miss + output * p.out) / 1e6
}

// ---------------------------------------------------------------------------
// 子进程脚本（密钥只经环境变量传递，不进命令行/日志/浏览器）
// ---------------------------------------------------------------------------

const HTTP_SCRIPT = [
  "const base = (process.env.PRAZE_API_BASE || 'https://api.deepseek.com').replace(/\\/+$/, '');",
  "const key = process.env.DEEPSEEK_API_KEY;",
  "const method = process.env.PRAZE_METHOD || 'GET';",
  "const route = process.env.PRAZE_ROUTE || '/user/balance';",
  "const payload = process.env.PRAZE_PAYLOAD || '';",
  "const ctrl = new AbortController();",
  "const t = setTimeout(() => ctrl.abort(), 20000);",
  "const headers = { Authorization: 'Bearer ' + key, Accept: 'application/json' };",
  "const opts = { method, headers, signal: ctrl.signal };",
  "if (method === 'POST') { headers['Content-Type'] = 'application/json'; opts.body = payload; }",
  "fetch(base + route, opts)",
  "  .then(async (r) => { const body = await r.text(); process.stdout.write(JSON.stringify({ status: r.status, body })); })",
  "  .catch((e) => { process.stdout.write(JSON.stringify({ error: String((e && e.message) || e) })); })",
  "  .finally(() => clearTimeout(t));",
].join('\n')

export function apply(ctx) {
  let settings = loadSettings()

  const state = {
    perSession: new Map(),
    total: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, calls: 0 },
    cost: { total: 0, today: 0, todayKey: null, perSession: new Map() },
    sessionModel: new Map(),
    activeSessionId: null,
    lastCall: null,
    live: null,
  }

  // ---- 持久用量：assistant/message 携带 provider TokenUsage（去重累计） ----
  ctx.on('session/event', (session, event) => {
    if (!event || event.type !== 'assistant/message') return
    const data = event.data
    if (!data || !data.usage) return
    const sid = session && session.id
    if (!sid) return
    const u = data.usage
    const input = num(u.inputTokens)
    const output = num(u.outputTokens)
    const cacheRead = num(u.cacheReadTokens)
    const cacheWrite = num(u.cacheWriteTokens)
    const reasoning = num(u.reasoningTokens)
    if (input + output + cacheRead + cacheWrite + reasoning === 0) return
    let bucket = state.perSession.get(sid)
    if (!bucket) {
      bucket = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, calls: 0 }
      state.perSession.set(sid, bucket)
    }
    bucket.input += input; bucket.output += output
    bucket.cacheRead += cacheRead; bucket.cacheWrite += cacheWrite
    bucket.reasoning += reasoning; bucket.calls += 1
    const t = state.total
    t.input += input; t.output += output
    t.cacheRead += cacheRead; t.cacheWrite += cacheWrite
    t.reasoning += reasoning; t.calls += 1

    // 费用估算（按事件发生时刻的峰谷价格对齐；仅供参考，以官方账单为准）
    const now = Date.now()
    const model = state.sessionModel.get(sid) || (state.lastCall && state.lastCall.model) || 'deepseek-flash'
    const c = estimateCost(settings, u, model, now)
    state.cost.total += c
    const key = bjParts(now).key
    if (state.cost.todayKey !== key) { state.cost.todayKey = key; state.cost.today = 0 }
    state.cost.today += c
    state.cost.perSession.set(sid, (state.cost.perSession.get(sid) || 0) + c)
  }, { global: true })

  // ---- llm/stream：在途可见性 + 思考强度注入 ----
  const startLive = (options, next) => {
    // 思考强度滑条：仅在 DeepSeek 路由上覆盖 reasoningEffort；auto 时不干预
    try {
      const eff = settings.thinking && settings.thinking.effort
      const isDeepSeek = /deepseek/i.test(String((options && (options.provider || options.model)) || ''))
      if (eff && eff !== 'auto' && isDeepSeek && options && typeof options === 'object') {
        options.reasoningEffort = eff
      }
    } catch (e) { /* 不干预宿主 */ }

    const call = {
      sessionId: options && options.sessionId ? options.sessionId : null,
      provider: (options && options.provider) || null,
      model: (options && options.model) || null,
      purpose: (options && options.purpose) || null,
      input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0,
      at: Date.now(),
    }
    state.live = call
    if (call.sessionId) {
      state.activeSessionId = call.sessionId
      if (call.model) state.sessionModel.set(call.sessionId, call.model)
    }
    return (async function* () {
      const source = await next()
      try {
        for await (const chunk of source) {
          if (chunk && chunk.type === 'usage' && chunk.usage) {
            call.input = num(chunk.usage.inputTokens)
            call.output = num(chunk.usage.outputTokens)
            call.cacheRead = num(chunk.usage.cacheReadTokens)
            call.cacheWrite = num(chunk.usage.cacheWriteTokens)
            call.reasoning = num(chunk.usage.reasoningTokens)
          }
          yield chunk
        }
        state.lastCall = {
          sessionId: call.sessionId, provider: call.provider, model: call.model,
          purpose: call.purpose, input: call.input, output: call.output,
          cacheRead: call.cacheRead, cacheWrite: call.cacheWrite,
          reasoning: call.reasoning, at: call.at,
        }
      } finally {
        if (state.live === call) state.live = null
      }
    })()
  }
  ctx.on('llm/stream', (options, next) => startLive(options, next), { global: true })

  // ---- 通用：解析 base URL / key / node ----
  const resolveBaseURL = () => {
    try {
      const s = ctx.get('settings')
      if (s) {
        const ns = s.get('llm-deepseek')
        if (ns && typeof ns === 'object' && typeof ns.baseURL === 'string' && ns.baseURL) {
          return String(ns.baseURL).replace(/\/+$/, '')
        }
      }
    } catch (e) { /* ignore */ }
    return 'https://api.deepseek.com'
  }

  const resolveKey = async () => {
    const credentials = ctx.get('credentials')
    if (!credentials) return null
    try {
      const hit = await credentials.resolve('DEEPSEEK_API_KEY')
      if (hit && typeof hit.value === 'string' && hit.value) return hit.value
    } catch (e) { /* ignore */ }
    return null
  }

  const resolveNode = async () => {
    const subprocess = ctx.get('subprocess')
    if (!subprocess) return null
    try { return await subprocess.resolveExecutable('node') } catch (e1) {
      try { return await subprocess.resolveExecutable('node.exe') } catch (e2) { return null }
    }
  }

  // 通过 node 子进程发起官方 API 请求；返回 {status, body} 或 {error}
  const apiCall = async (method, route, payloadObj) => {
    const key = await resolveKey()
    if (!key) return { noKey: true, error: '未找到 DEEPSEEK_API_KEY 凭据（可在 设置→模型 页配置）' }
    const subprocess = ctx.get('subprocess')
    const nodePath = await resolveNode()
    if (!subprocess || !nodePath) return { error: 'subprocess/node 不可用' }
    const sandboxPolicy = ctx.get('sandboxPolicy')
    const cwd = (sandboxPolicy && sandboxPolicy.workspaceRoot) || os.homedir()
    let handle
    try {
      handle = subprocess.spawn({
        argv: [nodePath, '-e', HTTP_SCRIPT],
        cwd,
        stdio: { stdin: 'ignore', stdout: { maxBytes: 262144 }, stderr: { maxBytes: 4096 } },
        graceMs: 2000,
        env: {
          DEEPSEEK_API_KEY: key,
          PRAZE_API_BASE: resolveBaseURL(),
          PRAZE_METHOD: method,
          PRAZE_ROUTE: route,
          PRAZE_PAYLOAD: payloadObj ? JSON.stringify(payloadObj) : '',
        },
      })
    } catch (e) {
      return { error: 'spawn 失败: ' + String((e && e.message) || e) }
    }
    try {
      await handle.done
    } catch (e) {
      try { handle.terminate() } catch (e2) { /* ignore */ }
      return { error: '子进程失败: ' + String((e && e.message) || e) }
    }
    let text = ''
    try {
      const read = handle.collected.stdout.readFrom(0)
      if (read) text = read.text || ''
    } catch (e) { /* ignore */ }
    if (!text) return { error: '查询无输出' }
    try { return JSON.parse(text) } catch (e) { return { error: '响应解析失败' } }
  }

  // ---- 余额（60s 缓存）----
  let balanceCache = null
  let balancePromise = null
  const queryBalance = async () => {
    const now = Date.now()
    const r = await apiCall('GET', '/user/balance')
    if (r.noKey) return { status: 'no-key', message: r.error, fetchedAt: now }
    if (r.error) return { status: 'error', message: String(r.error).slice(0, 300), fetchedAt: now }
    if (r.status !== 200) return { status: 'error', message: 'HTTP ' + r.status + ': ' + String(r.body || '').slice(0, 200), fetchedAt: now }
    let data = null
    try { data = JSON.parse(r.body || '{}') } catch (e) { return { status: 'error', message: '余额 JSON 无效', fetchedAt: now } }
    const infos = Array.isArray(data.balance_infos)
      ? data.balance_infos.map((b) => ({
          currency: String(b.currency || ''),
          totalBalance: b.total_balance != null ? String(b.total_balance) : null,
          grantedBalance: b.granted_balance != null ? String(b.granted_balance) : null,
          toppedUpBalance: b.topped_up_balance != null ? String(b.topped_up_balance) : null,
        }))
      : []
    return { status: 'ok', isAvailable: data.is_available !== false, infos, fetchedAt: now }
  }
  const getBalance = async (force) => {
    const now = Date.now()
    if (!force && balanceCache && now - balanceCache.at < BALANCE_TTL_MS) return balanceCache.value
    if (balancePromise) return balancePromise
    balancePromise = queryBalance()
      .then((value) => { balanceCache = { at: Date.now(), value }; return value })
      .finally(() => { balancePromise = null })
    return balancePromise
  }

  // ---- 模型 effort 档位（官方 /models，1h 缓存）----
  let modelsCache = null
  let modelsPromise = null
  const queryModels = async () => {
    const now = Date.now()
    const fallback = {
      levels: [
        { id: 'low', name: 'low' }, { id: 'medium', name: 'medium' },
        { id: 'high', name: 'high' }, { id: 'max', name: 'max' },
      ],
      defaultLevel: null, source: 'fallback', fetchedAt: now,
    }
    const r = await apiCall('GET', '/models')
    if (r.error || r.status !== 200) return fallback
    try {
      const data = JSON.parse(r.body || '{}')
      const list = Array.isArray(data.data) ? data.data : []
      const pick = list.find((m) => m.id === 'deepseek-flash') || list.find((m) => /deepseek/i.test(m.id || '')) || list[0]
      const eff = pick && pick.effort
      if (eff && Array.isArray(eff.supported_levels) && eff.supported_levels.length) {
        return {
          levels: eff.supported_levels.map((id) => ({ id: String(id), name: String(id) })),
          defaultLevel: eff.default_level ? String(eff.default_level) : null,
          model: pick.id, source: 'api', fetchedAt: now,
        }
      }
      return fallback
    } catch (e) { return fallback }
  }
  const getModels = async (force) => {
    const now = Date.now()
    if (!force && modelsCache && now - modelsCache.at < MODELS_TTL_MS) return modelsCache.value
    if (modelsPromise) return modelsPromise
    modelsPromise = queryModels()
      .then((value) => { modelsCache = { at: Date.now(), value }; return value })
      .finally(() => { modelsPromise = null })
    return modelsPromise
  }

  // ---- HTTP 工具 ----
  const sendJson = (res, value, status = 200) => {
    try {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify(value))
    } catch (e) { /* client disconnected */ }
  }
  const sendFile = (res, file, type, cache) => {
    try {
      const buf = fs.readFileSync(file)
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache || 'no-cache', 'Content-Length': buf.length })
      res.end(buf)
    } catch (e) {
      try { res.writeHead(404); res.end('not found') } catch (e2) { /* ignore */ }
    }
  }
  const readBody = (req, limit) => new Promise((resolve) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) { resolve(null); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) } catch (e) { resolve(null) }
    })
    req.on('error', () => resolve(null))
  })

  const usagePayload = () => {
    const payload = {
      sessions: [],
      total: Object.assign({}, state.total),
      cost: {
        total: state.cost.total,
        today: state.cost.todayKey === bjParts(Date.now()).key ? state.cost.today : 0,
        currency: 'CNY',
        note: '按峰谷价格估算，仅供参考，以官方账单为准',
      },
      activeSessionId: state.activeSessionId,
      lastCall: state.lastCall,
      live: state.live,
      model: (state.lastCall && state.lastCall.model) || null,
    }
    for (const [sessionId, b] of state.perSession) {
      payload.sessions.push(Object.assign({
        sessionId,
        cost: state.cost.perSession.get(sessionId) || 0,
        model: state.sessionModel.get(sessionId) || null,
      }, b))
    }
    payload.sessions.sort((a, b) => (b.input + b.output + b.cacheRead) - (a.input + a.output + b.cacheRead))
    payload.sessions = payload.sessions.slice(0, 20)
    return payload
  }

  // ---- 路由 ----
  ctx.webServer.register({
    kind: 'exact', path: '/api/praze-skin/ping',
    handler: async (_req, res) => sendJson(res, { ok: true, name, version: VERSION }),
  })

  ctx.webServer.register({
    kind: 'exact', path: '/api/praze-skin/settings',
    handler: async (req, res) => {
      if (req.method === 'POST') {
        const body = await readBody(req, 65536)
        if (!body) return sendJson(res, { error: 'invalid body' }, 400)
        settings = mergeSettings(settings, body)
        saveSettings(settings)
        return sendJson(res, { ok: true, settings })
      }
      sendJson(res, { settings })
    },
  })

  ctx.webServer.register({
    kind: 'exact', path: '/api/praze-skin/meta',
    handler: async (_req, res) => {
      const models = await getModels(false)
      sendJson(res, {
        version: VERSION,
        period: periodInfo(settings),
        efforts: models,
        model: (state.lastCall && state.lastCall.model) || (models && models.model) || null,
        prices: settings.prices,
        defaults: { prices: DEFAULT_PRICES, holidays: DEFAULT_SETTINGS.holidays },
        themes: Object.keys({ noble: 1, sacred: 1, calling: 1, illusory: 1 }),
      })
    },
  })

  ctx.webServer.register({
    kind: 'exact', path: '/api/praze-skin/usage',
    handler: async (_req, res) => sendJson(res, usagePayload()),
  })

  ctx.webServer.register({
    kind: 'exact', path: '/api/praze-skin/balance',
    handler: async (req, res) => {
      const force = /[?&]force=1\b/.test(req.url || '')
      sendJson(res, await getBalance(force))
    },
  })

  // 静态资源（白名单）
  const ASSETS = {
    'background.png': 'image/png',
    'avatar.png': 'image/png',
    'avatar-happy.png': 'image/png',
    'icon.png': 'image/png',
  }
  ctx.webServer.register({
    kind: 'exact', path: '/api/praze-skin/client.js',
    handler: async (_req, res) => sendFile(res, path.join(PLUGIN_DIR, 'client', 'praze-skin.js'), 'text/javascript; charset=utf-8'),
  })
  ctx.webServer.register({
    kind: 'exact', path: '/api/praze-skin/client.css',
    handler: async (_req, res) => sendFile(res, path.join(PLUGIN_DIR, 'client', 'praze-skin.css'), 'text/css; charset=utf-8'),
  })
  for (const asset of Object.keys(ASSETS)) {
    ctx.webServer.register({
      kind: 'exact', path: '/api/praze-skin/assets/' + asset,
      handler: async (_req, res) => sendFile(res, path.join(PLUGIN_DIR, 'assets', asset), ASSETS[asset], 'public, max-age=86400'),
    })
  }

  // ---- index 注入 ----
  ctx.webServer.tapIndex((html) => {
    if (html.includes('__dshPrazeSkin__')) return html
    const tag = '<!--__dshPrazeSkin__-->' +
      '<link rel="stylesheet" href="/api/praze-skin/client.css">' +
      '<script defer src="/api/praze-skin/client.js"></script>'
    const marker = '</body>'
    if (html.includes(marker)) return html.replace(marker, tag + marker)
    return html + tag
  })
}
