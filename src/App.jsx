import { useEffect, useRef, useState } from 'react'
import { acceptNewEntries, balanceDelta, entriesFromMessage, entryKey } from './ledgerUtils.js'
import './App.css'

const players = [
  { id: 'player-1', name: 'Alex', color: 'green', initial: 120 },
  { id: 'player-2', name: 'Jordan', color: 'coral', initial: 85 },
  { id: 'player-3', name: 'Sam', color: 'blue', initial: 50 },
]

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
const WS_URL = import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`
const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

async function request(path, options) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const body = await response.text()
  let data = null
  if (body) {
    try {
      data = JSON.parse(body)
    } catch {
      data = body
    }
  }
  if (!response.ok) {
    throw new Error(
      (typeof data === 'string' ? data : data?.message) ||
        `${response.status} ${response.statusText}`,
    )
  }
  return data
}

function applyLedgerEntries(incoming, seenEntries, setLedger, setBalances) {
  const result = acceptNewEntries(incoming, seenEntries.current)
  const { accepted } = result
  if (!accepted.length) return
  seenEntries.current = result.seenEntryKeys

  setLedger((current) => {
    const next = { ...current }
    for (const entry of accepted) {
      next[entry.playerId] = [entry, ...(next[entry.playerId] || [])]
    }
    return next
  })
  setBalances((current) => {
    const next = { ...current }
    for (const entry of accepted) {
      next[entry.playerId] = Number(next[entry.playerId] || 0) + balanceDelta(entry)
    }
    return next
  })
}

function App() {
  const seenEntries = useRef(new Set())
  const [startingBalances, setStartingBalances] = useState(
    Object.fromEntries(players.map((player) => [player.id, player.initial])),
  )
  const [gameId, setGameId] = useState('')
  const [balances, setBalances] = useState({})
  const [ledger, setLedger] = useState({})
  const [fromPlayerId, setFromPlayerId] = useState(players[0].id)
  const [toPlayerId, setToPlayerId] = useState(players[1].id)
  const [amount, setAmount] = useState('10')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [socketState, setSocketState] = useState('Waiting for simulation')

  useEffect(() => {
    if (!gameId) return undefined
    let socket
    let reconnectTimer
    let stopped = false

    const connect = () => {
      if (stopped) return
      setSocketState('Connecting')
      socket = new WebSocket(WS_URL)
      socket.onopen = () => setSocketState('Live')
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          if (message.gameId && message.gameId !== gameId) return
          applyLedgerEntries(entriesFromMessage(message), seenEntries, setLedger, setBalances)
        } catch {
          setSocketState('Invalid event')
        }
      }
      socket.onerror = () => setSocketState('Unavailable')
      socket.onclose = () => {
        if (!stopped) {
          setSocketState('Reconnecting')
          reconnectTimer = window.setTimeout(connect, 2500)
        }
      }
    }

    connect()
    return () => {
      stopped = true
      window.clearTimeout(reconnectTimer)
      socket?.close()
    }
  }, [gameId])

  async function setupGame(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    seenEntries.current.clear()
    try {
      const result = await request('/api/game/setup', {
        method: 'POST',
        body: JSON.stringify({
          startingBalances: Object.fromEntries(
            players.map((player) => [player.id, Number(startingBalances[player.id])]),
          ),
        }),
      })
      setGameId(result.gameId)
      setBalances(result.balances || startingBalances)
      setLedger(Object.fromEntries(players.map((player) => [player.id, []])))
      setNotice('Simulation created. Players are ready to pay.')
      await Promise.all(
        players.map(async (player) => {
          try {
            const [ledgerResult, balanceResult] = await Promise.all([
              request(`/api/games/${result.gameId}/players/${player.id}/ledger`),
              request(`/api/games/${result.gameId}/players/${player.id}/balance`),
            ])
            for (const entry of ledgerResult.entries || []) {
              seenEntries.current.add(entryKey(entry))
            }
            setLedger((current) => ({
              ...current,
              [player.id]: ledgerResult.entries || [],
            }))
            setBalances((current) => ({
              ...current,
              [player.id]: balanceResult.balance,
            }))
          } catch {
            // The setup response remains usable if ledger reads are not available.
          }
        }),
      )
    } catch (requestError) {
      setError(`Could not set up simulation: ${requestError.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function makePayment(event) {
    event.preventDefault()
    if (!gameId || fromPlayerId === toPlayerId || Number(amount) <= 0) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await request('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          gameId,
          fromPlayerId,
          toPlayerId,
          amount: Number(amount),
        }),
      })
      applyLedgerEntries(result?.entries || [], seenEntries, setLedger, setBalances)
      setNotice(`${currency.format(Number(amount))} sent successfully.`)
      setAmount('')
    } catch (requestError) {
      setError(`Payment failed: ${requestError.message}`)
    } finally {
      setBusy(false)
    }
  }

  const totalBalance = players.reduce(
    (total, player) => total + Number(balances[player.id] || 0),
    0,
  )
  const transactionCount = Object.values(ledger).reduce(
    (total, entries) => total + entries.length,
    0,
  )

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="Common Ground home">
          <span className="wordmark-mark">cg</span>
          <span>common ground</span>
        </a>
        <div className="topbar-meta">
          <span className="eyebrow">PAYMENT SIMULATOR</span>
          <span className={`connection connection-${socketState.toLowerCase().replaceAll(' ', '-')}`}>
            <i /> {socketState}
          </span>
        </div>
      </header>

      <section className="intro" id="top">
        <div>
          <p className="eyebrow">A SHARED TAB, SETTLED</p>
          <h1>Money moves.<br /><em>Everyone sees.</em></h1>
        </div>
        <div className="intro-note">
          <span className="note-index">01 / 03</span>
          <p>Set the table, send a payment, and watch every player’s ledger update in real time.</p>
        </div>
      </section>

      <section className="summary-strip" aria-label="Simulation summary">
        <div className="summary-item">
          <span className="eyebrow">ACTIVE SIMULATION</span>
          <strong>{gameId ? `${gameId.slice(0, 8)}…` : 'Not started'}</strong>
        </div>
        <div className="summary-item">
          <span className="eyebrow">PLAYERS</span>
          <strong>03 <small>people</small></strong>
        </div>
        <div className="summary-item">
          <span className="eyebrow">TOTAL IN PLAY</span>
          <strong>{currency.format(totalBalance)}</strong>
        </div>
        <div className="summary-item">
          <span className="eyebrow">LEDGER ENTRIES</span>
          <strong>{String(transactionCount).padStart(2, '0')}</strong>
        </div>
      </section>

      <section className="control-deck">
        <form className="setup-panel" onSubmit={setupGame}>
          <div className="panel-heading">
            <span className="step-number">01</span>
            <div><p className="eyebrow">START HERE</p><h2>Set up the simulation</h2></div>
          </div>
          <p className="panel-copy">Three players, three starting balances. Create a fresh simulation whenever you’re ready.</p>
          <div className="starting-list">
            {players.map((player) => (
              <label className="starting-row" key={player.id}>
                <span className={`player-dot ${player.color}`} />
                <span className="player-name">{player.name}</span>
                <span className="money-input"><span>$</span><input
                  aria-label={`${player.name} starting balance`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={startingBalances[player.id]}
                  onChange={(event) => setStartingBalances((current) => ({
                    ...current,
                    [player.id]: event.target.value,
                  }))}
                /></span>
              </label>
            ))}
          </div>
          <button className="button button-dark" type="submit" disabled={busy || players.some((player) => startingBalances[player.id] === '' || Number(startingBalances[player.id]) < 0)}>
            {busy && !gameId ? 'Creating simulation…' : gameId ? 'Start a new simulation' : 'Create simulation'} <span aria-hidden="true">↗</span>
          </button>
        </form>

        <form className="payment-panel" onSubmit={makePayment}>
          <div className="panel-heading">
            <span className="step-number step-coral">02</span>
            <div><p className="eyebrow">MOVE MONEY</p><h2>Make a payment</h2></div>
          </div>
          <p className="panel-copy">Choose who pays whom. Both sides of the transaction land in the ledger.</p>
          <div className="transfer-fields">
            <label className="field-label">FROM
              <select value={fromPlayerId} onChange={(event) => setFromPlayerId(event.target.value)}>
                {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
              </select>
            </label>
            <span className="transfer-arrow" aria-hidden="true">→</span>
            <label className="field-label">TO
              <select value={toPlayerId} onChange={(event) => setToPlayerId(event.target.value)}>
                {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
              </select>
            </label>
            <label className="field-label amount-label">AMOUNT
              <span className="amount-input"><span>$</span><input
                aria-label="Payment amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              /></span>
            </label>
          </div>
          <button className="button button-coral" type="submit" disabled={!gameId || busy || fromPlayerId === toPlayerId || Number(amount) <= 0}>
            {!gameId ? 'Create a simulation first' : busy ? 'Sending…' : 'Send payment'} <span aria-hidden="true">↗</span>
          </button>
        </form>
      </section>

      {(error || notice) && <div className={`feedback ${error ? 'feedback-error' : ''}`} role="status">{error || notice}</div>}

      <section className="ledger-section">
        <div className="section-heading">
          <div><p className="eyebrow">THE WHOLE PICTURE</p><h2>Player ledgers</h2></div>
          <span className="live-label"><i /> {socketState === 'Live' ? 'UPDATING LIVE' : socketState.toUpperCase()}</span>
        </div>
        {!gameId && <div className="empty-state"><span className="empty-mark">↘</span><p>Your table is waiting.</p><span>Create a simulation to open the ledgers.</span></div>}
        <div className="player-grid">
          {players.map((player, index) => (
            <article className={`player-card card-${player.color}`} key={player.id}>
              <div className="player-card-top">
                <div className="identity"><span className={`avatar avatar-${player.color}`}>{player.name[0]}</span><div><h3>{player.name}</h3><span className="player-tag">PLAYER 0{index + 1}</span></div></div>
                <span className="entry-count">{(ledger[player.id] || []).length} ENTRIES</span>
              </div>
              <div className="balance-block"><span className="eyebrow">CURRENT BALANCE</span><strong>{currency.format(Number(balances[player.id] || 0))}</strong></div>
              <div className="ledger-list">
                <div className="ledger-list-head"><span>ACTIVITY</span><span>AMOUNT</span></div>
                {!gameId && <p className="ledger-placeholder">Waiting for simulation setup</p>}
                {gameId && !(ledger[player.id] || []).length && <p className="ledger-placeholder">No entries yet</p>}
                {(ledger[player.id] || []).map((entry, entryIndex) => (
                  <div className="ledger-entry" key={entry.id ?? `${entry.type}-${entry.createdAt}-${entryIndex}`}>
                    <span className={`entry-symbol ${entry.type === 'CREDIT' ? 'entry-credit' : 'entry-debit'}`}>{entry.type === 'CREDIT' ? '+' : '−'}</span>
                    <span className="entry-detail"><strong>{entry.type === 'CREDIT' ? 'Received' : 'Sent'}</strong><small>{entry.createdAt ? new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}</small></span>
                    <strong className={`entry-amount ${entry.type === 'CREDIT' ? 'positive' : ''}`}>{entry.type === 'CREDIT' ? '+' : '−'}{currency.format(Math.abs(Number(entry.amount)))}</strong>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="footer"><span>COMMON GROUND <span className="footer-dot">/</span> PAYMENT SIMULATOR</span><span>{gameId ? 'SESSION IN PROGRESS' : 'READY WHEN YOU ARE'}</span></footer>
    </main>
  )
}

export default App
