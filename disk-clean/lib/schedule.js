import { parseClock } from './util.js'

export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Saturday and Sunday use weekendAt, Monday to Friday use weekdaysAt. */
export function scheduleSlotFor(date, schedule) {
  const day = date.getDay()
  const weekend = day === 0 || day === 6
  return {
    slot: weekend ? 'weekend' : 'weekday',
    text: (weekend ? schedule?.weekendAt : schedule?.weekdaysAt) ?? '',
  }
}

/** The slot that is due at `now` and has not run today yet, or null. */
export function dueSchedule(now, schedule, lastScheduled) {
  const { slot, text } = scheduleSlotFor(now, schedule)
  const clock = parseClock(text)
  if (!clock) return null
  const key = dayKey(now)
  if (lastScheduled?.[slot] === key) return null
  const scheduled = new Date(now.getFullYear(), now.getMonth(), now.getDate(), clock.hours, clock.minutes, 0, 0)
  if (now.getTime() < scheduled.getTime()) return null
  return { slot, clock: clock.text, key, missedMs: now.getTime() - scheduled.getTime() }
}
