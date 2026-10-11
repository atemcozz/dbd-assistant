import { useEffect, useState, type CSSProperties } from 'react'
import {
  API_URL,
  SESSION_KEY,
  useGameStore,
  type Session,
} from '@/gameStore'

// Admin-only diagnostics screen. Deliberately plain (no design system):
// it is opened via ?debug / #debug when a player's client misbehaves
// during a live game. Shows connection/session facts, lets the admin
// inspect and repair localStorage (e.g. re-enter a session after an
// accidental leave when the token is known), and retry connectivity.
export function DebugPanel() {
  const session = useGameStore((store) => store.session)
  const state = useGameStore((store) => store.state)
  const connectionStatus = useGameStore((store) => store.connectionStatus)
  const error = useGameStore((store) => store.error)
  const restoreSession = useGameStore((store) => store.restoreSession)
  const refreshState = useGameStore((store) => store.refreshState)
  const connectRealtime = useGameStore((store) => store.connectRealtime)
  const disconnectRealtime = useGameStore((store) => store.disconnectRealtime)
  const clearSession = useGameStore((store) => store.clearSession)

  const [online, setOnline] = useState(() => navigator.onLine)
  const [ping, setPing] = useState<string | null>(null)
  const [pinging, setPinging] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [showToken, setShowToken] = useState(false)

  // Session editor fields, prefilled from localStorage.
  const [form, setForm] = useState({ gameCode: '', playerId: '', sessionToken: '' })
  // Raw localStorage inspector.
  const [keys, setKeys] = useState<string[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [rawValue, setRawValue] = useState('')

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  function refreshKeys() {
    const found: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) found.push(key)
    }
    setKeys(found.sort())
  }

  useEffect(() => {
    refreshKeys()
    loadSessionForm()
  }, [])

  function loadSessionForm() {
    try {
      const saved = localStorage.getItem(SESSION_KEY)
      if (!saved) {
        setForm({ gameCode: '', playerId: '', sessionToken: '' })
        setNotice('Сессии в localStorage нет')
        return
      }
      const parsed = JSON.parse(saved) as Partial<Session>
      setForm({
        gameCode: parsed.gameCode ?? '',
        playerId: parsed.playerId ?? '',
        sessionToken: parsed.sessionToken ?? '',
      })
      setNotice(null)
    } catch {
      setNotice('Сессия в localStorage битая (не JSON)')
    }
  }

  function openKey(key: string) {
    setSelectedKey(key)
    setRawValue(localStorage.getItem(key) ?? '')
  }

  function saveRawKey() {
    if (!selectedKey) return
    localStorage.setItem(selectedKey, rawValue)
    setNotice(`Ключ ${selectedKey} сохранён`)
  }

  function deleteRawKey() {
    if (!selectedKey) return
    localStorage.removeItem(selectedKey)
    setSelectedKey(null)
    setRawValue('')
    refreshKeys()
    setNotice(`Ключ ${selectedKey} удалён`)
  }

  async function saveSessionAndReconnect() {
    const next: Session = {
      gameCode: form.gameCode.trim(),
      playerId: form.playerId.trim(),
      sessionToken: form.sessionToken.trim(),
    }
    if (!next.gameCode || !next.playerId || !next.sessionToken) {
      setNotice('Заполни все три поля сессии')
      return
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(next))
    refreshKeys()
    await restoreSession()
    const storeError = useGameStore.getState().error
    setNotice(
      storeError
        ? `Сервер отклонил сессию: ${storeError}`
        : 'OK: сессия принята, состояние загружено',
    )
  }

  function handleClearSession() {
    clearSession()
    refreshKeys()
    loadSessionForm()
    setNotice('Сессия очищена — клиент вернулся на стартовый экран')
  }

  async function pingApi() {
    setPinging(true)
    setPing(null)
    const started = performance.now()
    try {
      const response = await fetch(`${API_URL}/health`)
      const ms = Math.round(performance.now() - started)
      const body = await response.text()
      setPing(`HTTP ${response.status} за ${ms} мс: ${body}`)
    } catch (err) {
      const ms = Math.round(performance.now() - started)
      setPing(
        `ОШИБКА за ${ms} мс: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setPinging(false)
    }
  }

  function reconnectSocket() {
    disconnectRealtime()
    connectRealtime()
    setNotice('Сокет переподключён (disconnect + connect)')
  }

  async function copyDiagnostics() {
    const text = buildDiagnosticsText()
    try {
      await navigator.clipboard.writeText(text)
      setNotice('Диагностика скопирована в буфер обмена')
    } catch {
      // Clipboard API may be unavailable on plain HTTP LAN — show text.
      setNotice('Буфер недоступен, скопируй текст вручную из блоков выше')
    }
  }

  function buildDiagnosticsText() {
    const player = state?.players.find((p) => p.id === session?.playerId)
    return [
      `time=${new Date().toISOString()}`,
      `apiUrl=${API_URL}`,
      `online=${online}`,
      `socket=${connectionStatus}`,
      `session=${session ? `${session.gameCode}/${session.playerId}` : 'none'}`,
      `game=${state ? `${state.id} status=${state.status}` : 'none'}`,
      `player=${player ? `${player.name} ${player.role} ${player.status} hp=${player.health}` : 'none'}`,
      `players=${state ? state.players.length : 0}`,
      `error=${error ?? 'none'}`,
      `ua=${navigator.userAgent}`,
    ].join('\n')
  }

  const player = state?.players.find((p) => p.id === session?.playerId)
  const storedToken = (() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY)
      if (!saved) return null
      return (JSON.parse(saved) as Partial<Session>).sessionToken ?? null
    } catch {
      return 'БИТОЕ ЗНАЧЕНИЕ (не JSON)'
    }
  })()

  return (
    <main style={styles.page}>
      <div style={styles.wrap}>
        <div style={styles.header}>
          <strong>DEBUG — диагностика (только для админа)</strong>
          <a href={window.location.pathname} style={styles.link}>
            назад
          </a>
        </div>
        {notice && <p style={styles.notice}>{notice}</p>}

        <section style={styles.section}>
          <h2 style={styles.h2}>1. Диагностика</h2>
          <dl style={styles.dl}>
            <Row k="API URL" v={API_URL || '(пусто — проверь VITE_API_URL)'} />
            <Row k="Браузер онлайн" v={online ? 'да' : 'НЕТ'} bad={!online} />
            <Row k="Socket.IO" v={connectionStatus} bad={connectionStatus === 'disconnected'} />
            <Row k="Сессия (стор)" v={session ? `${session.gameCode} / ${session.playerId}` : 'нет'} bad={!session} />
            <Row
              k="Токен (localStorage)"
              v={
                storedToken === null
                  ? 'нет'
                  : showToken
                    ? storedToken
                    : `${storedToken.slice(0, 8)}… (скрыт)`
              }
            />
            <Row k="Игра (стор)" v={state ? `${state.id} · ${state.status}` : 'нет'} bad={!state} />
            <Row k="Игроков" v={state ? String(state.players.length) : '—'} />
            <Row
              k="Текущий игрок"
              v={player ? `${player.name} · ${player.role} · ${player.status} · hp=${player.health}` : '—'}
            />
            <Row k="Последняя ошибка" v={error ?? 'нет'} bad={!!error} />
            <Row k="User agent" v={navigator.userAgent} />
            <Row k="Экран" v={`${window.innerWidth}x${window.innerHeight}`} />
          </dl>
          <div style={styles.btnRow}>
            <button type="button" style={styles.btn} onClick={() => setShowToken((v) => !v)}>
              {showToken ? 'скрыть токен' : 'показать токен'}
            </button>
            <button type="button" style={styles.btn} onClick={() => void copyDiagnostics()}>
              скопировать диагностику
            </button>
          </div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>2. Проверка связи с сервером</h2>
          <div style={styles.btnRow}>
            <button type="button" style={styles.btn} disabled={pinging} onClick={() => void pingApi()}>
              {pinging ? 'проверяю…' : 'пинг /health'}
            </button>
          </div>
          {ping && <p style={styles.mono}>{ping}</p>}
          <p style={styles.hint}>
            Если пинг не проходит, а браузер онлайн — проверь, что устройство в
            той же Wi-Fi сети и API_URL выше указывает на хост сервера.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>3. Сессия (случай «случайно вышел»)</h2>
          <p style={styles.hint}>
            Если игрок случайно вышел (сессия стёрта), а токен известен
            (скопирован с другого устройства или из базы сервера) — вставь три
            значения и нажми «сохранить и переподключиться».
          </p>
          <label style={styles.label}>
            gameCode
            <input
              style={styles.input}
              value={form.gameCode}
              onChange={(e) => setForm({ ...form, gameCode: e.target.value })}
              autoCapitalize="none"
              autoCorrect="off"
            />
          </label>
          <label style={styles.label}>
            playerId
            <input
              style={styles.input}
              value={form.playerId}
              onChange={(e) => setForm({ ...form, playerId: e.target.value })}
              autoCapitalize="none"
              autoCorrect="off"
            />
          </label>
          <label style={styles.label}>
            sessionToken
            <input
              style={styles.input}
              value={form.sessionToken}
              onChange={(e) => setForm({ ...form, sessionToken: e.target.value })}
              autoCapitalize="none"
              autoCorrect="off"
            />
          </label>
          <div style={styles.btnRow}>
            <button type="button" style={styles.btn} onClick={() => loadSessionForm()}>
              перечитать из localStorage
            </button>
            <button type="button" style={styles.btn} onClick={() => void saveSessionAndReconnect()}>
              сохранить и переподключиться
            </button>
            <button type="button" style={styles.btn} onClick={handleClearSession}>
              очистить сессию
            </button>
          </div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>4. localStorage целиком</h2>
          <div style={styles.btnRow}>
            <button type="button" style={styles.btn} onClick={refreshKeys}>
              обновить список
            </button>
          </div>
          {keys.length === 0 && <p style={styles.hint}>Пусто.</p>}
          <ul style={styles.list}>
            {keys.map((key) => (
              <li key={key}>
                <button type="button" style={styles.linkBtn} onClick={() => openKey(key)}>
                  {key}
                </button>
              </li>
            ))}
          </ul>
          {selectedKey && (
            <div>
              <p style={styles.mono}>{selectedKey}</p>
              <textarea
                style={{ ...styles.input, minHeight: 80, fontFamily: 'monospace' }}
                value={rawValue}
                onChange={(e) => setRawValue(e.target.value)}
              />
              <div style={styles.btnRow}>
                <button type="button" style={styles.btn} onClick={saveRawKey}>
                  сохранить значение
                </button>
                <button type="button" style={styles.btn} onClick={deleteRawKey}>
                  удалить ключ
                </button>
              </div>
            </div>
          )}
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>5. Действия</h2>
          <div style={styles.btnRow}>
            <button type="button" style={styles.btn} onClick={() => void refreshState()}>
              обновить состояние
            </button>
            <button type="button" style={styles.btn} onClick={reconnectSocket}>
              переподключить сокет
            </button>
            <button type="button" style={styles.btn} onClick={() => window.location.reload()}>
              перезагрузить страницу
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}

function Row({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return (
    <div style={styles.row}>
      <dt style={styles.dt}>{k}</dt>
      <dd style={{ ...styles.dd, ...(bad ? styles.bad : null) }}>{v}</dd>
    </div>
  )
}

// Deliberately unstyled-in-place: this screen must not look like part of
// the game UI, so plain inline styles instead of the design system.
const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: '#111', color: '#ccc', fontFamily: 'monospace', fontSize: 13, padding: 12 },
  wrap: { maxWidth: 720, margin: '0 auto', display: 'grid', gap: 12 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #444', paddingBottom: 8 },
  link: { color: '#888' },
  notice: { border: '1px solid #664', background: '#221', padding: 8, margin: 0, overflowWrap: 'anywhere' },
  section: { border: '1px solid #444', padding: 10, display: 'grid', gap: 8 },
  h2: { fontSize: 13, margin: 0 },
  dl: { margin: 0, display: 'grid', gap: 4 },
  row: { display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8 },
  dt: { color: '#888' },
  dd: { margin: 0, overflowWrap: 'anywhere' },
  bad: { color: '#f66', fontWeight: 'bold' },
  mono: { background: '#000', padding: 8, margin: 0, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' },
  hint: { color: '#888', margin: 0 },
  label: { display: 'grid', gap: 4 },
  input: { background: '#000', color: '#ccc', border: '1px solid #555', padding: 6, fontSize: 13, width: '100%', boxSizing: 'border-box' },
  btnRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  btn: { background: '#222', color: '#ccc', border: '1px solid #555', padding: '6px 10px', fontSize: 13, fontFamily: 'monospace', cursor: 'pointer' },
  linkBtn: { background: 'none', border: 'none', padding: 0, color: '#8af', fontSize: 13, fontFamily: 'monospace', cursor: 'pointer', textDecoration: 'underline' },
  list: { margin: 0, paddingLeft: 18, display: 'grid', gap: 4 },
}
