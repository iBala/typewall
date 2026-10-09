// Per-site time rules, shared by the service worker and the extension pages.
//
// rules[domain] = {
//   schedule: null | { days: [0..6] (0 = Sunday), start: 'HH:MM', end: 'HH:MM' },
//   dailyMinutes: null | number,   // free minutes per day before blocking
//   unlockMinutes: null | number,  // how long a typed passage unlocks; null = until the tab closes
// }
//
// schedule null means always blocked. A window whose end is before its start
// runs overnight, and belongs to the day it starts on.

export const DEFAULT_RULE = { schedule: null, dailyMinutes: null, unlockMinutes: null };
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function getRule(rules, domain) {
  return { ...DEFAULT_RULE, ...(rules?.[domain] || {}) };
}

export function hostMatches(host, domain) {
  return host === domain || host.endsWith('.' + domain);
}

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export function isScheduledAt(schedule, day, minute) {
  if (!schedule) return true;
  const { days, start, end } = schedule;
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === e) return days.includes(day);
  if (s < e) return days.includes(day) && minute >= s && minute < e;
  return (days.includes(day) && minute >= s) || (days.includes((day + 6) % 7) && minute < e);
}

const dayAndMinute = (date) => [date.getDay(), date.getHours() * 60 + date.getMinutes()];

export function todayKey(now = new Date()) {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

export function usedMinutesToday(usage, domain, now = new Date()) {
  return usage?.date === todayKey(now) ? usage.minutes?.[domain] || 0 : 0;
}

// Returns why a domain is blocked right now, or null if it's open.
// 'always' and 'schedule' mean the block window applies; 'allowance' means the
// window applies and today's free minutes are used up.
export function inBlockWindow(schedule, now = new Date()) {
  return isScheduledAt(schedule, ...dayAndMinute(now));
}

export function blockReason(domain, rules, usage, now = new Date()) {
  const rule = getRule(rules, domain);
  if (!inBlockWindow(rule.schedule, now)) return null;
  if (rule.dailyMinutes && usedMinutesToday(usage, domain, now) < rule.dailyMinutes) return null;
  if (rule.dailyMinutes) return 'allowance';
  return rule.schedule ? 'schedule' : 'always';
}

// When the current block window ends, or null if it never does.
export function windowEnd(schedule, now = new Date()) {
  if (!schedule) return null;
  const t = new Date(now);
  t.setSeconds(0, 0);
  for (let i = 0; i < 7 * 24 * 60; i++) {
    t.setMinutes(t.getMinutes() + 1);
    if (!isScheduledAt(schedule, ...dayAndMinute(t))) return t;
  }
  return null;
}

// A change is "looser" if it blocks less at any moment of the week, gives
// more free minutes, or unlocks for longer. Those need a passage.
export function isLoosening(oldRule, newRule) {
  for (let day = 0; day < 7; day++) {
    for (let minute = 0; minute < 24 * 60; minute++) {
      if (isScheduledAt(oldRule.schedule, day, minute) && !isScheduledAt(newRule.schedule, day, minute)) return true;
    }
  }
  if ((newRule.dailyMinutes || 0) > (oldRule.dailyMinutes || 0)) return true;
  const unlock = (r) => r.unlockMinutes ?? Infinity;
  return unlock(newRule) > unlock(oldRule);
}

function formatDays(days) {
  const sorted = [...days].sort((a, b) => a - b);
  const key = sorted.join('');
  if (key === '0123456') return 'Every day';
  if (key === '12345') return 'Mon to Fri';
  if (key === '06') return 'Weekends';
  return sorted.map((d) => DAY_NAMES[d]).join(', ');
}

export function describeRule(rule) {
  const parts = [];
  parts.push(rule.schedule
    ? `Blocked ${formatDays(rule.schedule.days)}, ${rule.schedule.start} to ${rule.schedule.end}`
    : 'Always blocked');
  if (rule.dailyMinutes) parts.push(`${rule.dailyMinutes} free min a day`);
  parts.push(rule.unlockMinutes ? `unlocks for ${rule.unlockMinutes} min` : 'unlocks until the tab closes');
  return parts.join(' · ');
}

export function formatTime(date, now = new Date()) {
  const hhmm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return date.toDateString() === now.toDateString() ? hhmm : `${DAY_NAMES[date.getDay()]} ${hhmm}`;
}
