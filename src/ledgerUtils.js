export function entriesFromMessage(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.entries)) return data.entries
  if (data?.entry) return [data.entry]
  return data?.playerId && data?.type ? [data] : []
}

export function entryKey(entry) {
  return entry.id != null
    ? `${entry.playerId}:${entry.id}`
    : `${entry.playerId}:${entry.type}:${entry.amount}:${entry.createdAt || ''}`
}

export function acceptNewEntries(incoming, previouslySeen = new Set()) {
  const seenEntryKeys = new Set(previouslySeen)
  const accepted = []

  for (const entry of incoming) {
    if (
      !entry?.playerId ||
      !['CREDIT', 'DEBIT'].includes(entry.type) ||
      !Number.isFinite(Number(entry.amount))
    ) {
      continue
    }

    const key = entryKey(entry)
    if (seenEntryKeys.has(key)) continue
    seenEntryKeys.add(key)
    accepted.push(entry)
  }

  return { accepted, seenEntryKeys }
}

export function balanceDelta(entry) {
  const amount = Math.abs(Number(entry.amount))
  if (!Number.isFinite(amount)) return 0
  if (entry.type === 'CREDIT') return amount
  if (entry.type === 'DEBIT') return -amount
  return 0
}