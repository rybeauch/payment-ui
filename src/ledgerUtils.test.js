import { describe, expect, it } from 'vitest'
import {
  acceptNewEntries,
  balanceDelta,
  entriesFromMessage,
  entryKey,
} from './ledgerUtils.js'

describe('entriesFromMessage', () => {
  const credit = { id: 1, playerId: 'player-1', type: 'CREDIT', amount: 20 }

  it('accepts an array of ledger entries', () => {
    expect(entriesFromMessage([credit])).toEqual([credit])
  })

  it('accepts entries and single-entry envelopes', () => {
    expect(entriesFromMessage({ entries: [credit] })).toEqual([credit])
    expect(entriesFromMessage({ entry: credit })).toEqual([credit])
  })

  it('accepts a direct ledger entry and ignores unknown messages', () => {
    expect(entriesFromMessage(credit)).toEqual([credit])
    expect(entriesFromMessage({ event: 'heartbeat' })).toEqual([])
    expect(entriesFromMessage(null)).toEqual([])
  })
})

describe('entryKey', () => {
  it('uses the player and server entry ID when available', () => {
    expect(entryKey({ playerId: 'player-1', id: 12 })).toBe('player-1:12')
  })

  it('builds a stable fallback key without a server entry ID', () => {
    expect(entryKey({
      playerId: 'player-1',
      type: 'DEBIT',
      amount: -5,
      createdAt: '2026-10-01T12:00:00Z',
    })).toBe('player-1:DEBIT:-5:2026-10-01T12:00:00Z')
  })
})

describe('acceptNewEntries', () => {
  it('filters invalid entries and deduplicates repeated payment/socket events', () => {
    const existingKeys = new Set(['player-1:1'])
    const repeated = { id: 2, playerId: 'player-1', type: 'DEBIT', amount: -7 }
    const result = acceptNewEntries([
      { id: 1, playerId: 'player-1', type: 'CREDIT', amount: 10 },
      repeated,
      repeated,
      { playerId: 'player-2', type: 'REFUND', amount: 4 },
      { playerId: 'player-2', type: 'CREDIT', amount: 'not money' },
      { type: 'CREDIT', amount: 5 },
    ], existingKeys)

    expect(result.accepted).toEqual([repeated])
    expect([...result.seenEntryKeys]).toEqual(['player-1:1', 'player-1:2'])
    expect([...existingKeys]).toEqual(['player-1:1'])
  })
})

describe('balanceDelta', () => {
  it('adds credits even when the API amount is signed', () => {
    expect(balanceDelta({ type: 'CREDIT', amount: -12 })).toBe(12)
  })

  it('subtracts debits even when the API amount is already negative', () => {
    expect(balanceDelta({ type: 'DEBIT', amount: -12 })).toBe(-12)
    expect(balanceDelta({ type: 'DEBIT', amount: 12 })).toBe(-12)
  })
})