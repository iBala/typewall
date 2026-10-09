import { mountChallenge } from './challenge.js';
import { blockReason, formatTime, getRule, hostMatches, windowEnd } from './rules.js';

const url = location.hash.slice(1);
let host = '';
try { host = new URL(url).hostname; } catch {}

const { domains = [], rules = {}, usage = {} } = await chrome.storage.local.get(['domains', 'rules', 'usage']);
const domain = domains.find((d) => hostMatches(host, d));
const reason = domain && blockReason(domain, rules, usage);

if (!reason) {
  // Not blocked any more (removed, or outside its block window), so continue.
  if (host) location.replace(url);
} else {
  const rule = getRule(rules, domain);
  document.getElementById('domain').textContent = domain;
  document.title = `${domain} is blocked`;

  const end = windowEnd(rule.schedule);
  const reasonText = {
    allowance: `You've used today's ${rule.dailyMinutes} free minutes.`,
    schedule: end && `Blocked until ${formatTime(end)}.`,
    always: '',
  }[reason];
  if (reasonText) {
    const el = document.getElementById('reason');
    el.textContent = reasonText;
    el.hidden = false;
  }
  if (rule.unlockMinutes) {
    document.getElementById('unlock-for').textContent = `for ${rule.unlockMinutes} minutes in this tab`;
  }

  mountChallenge(document.getElementById('challenge'), {
    onSuccess: async () => {
      await chrome.runtime.sendMessage({ type: 'unlock', domain });
      location.replace(url);
    },
  });
}
