// Blocking is a single persistent dynamic rule that redirects any main-frame
// request to a currently blocked domain (or its subdomains) to blocked.html.
// Which domains are "currently blocked" depends on each site's time rules
// (see rules.js), so a tick every 30 seconds re-evaluates them, counts daily
// allowance usage, and sends open tabs to the block page when a window starts.
//
// Unlocks are session rules scoped to one tab + one domain, with a higher
// priority "allow". They are removed when the tab closes, when Chrome
// restarts, or when the site's unlock time limit runs out.

import { blockReason, getRule, hostMatches, inBlockWindow, todayKey } from './rules.js';

const BLOCK_RULE_ID = 1;
const UNLOCK_PRIORITY = 2;
const TICK = 'tick';
const TICK_MINUTES = 0.5;
const UNLOCK_ALARM = 'unlock:';

async function getState() {
  const { domains = [], rules = {}, usage = {} } = await chrome.storage.local.get(['domains', 'rules', 'usage']);
  return { domains, rules, usage };
}

const blockedDomains = ({ domains, rules, usage }) => domains.filter((d) => blockReason(d, rules, usage));

async function syncBlockRule(state) {
  const blocked = blockedDomains(state).sort();
  const [current] = await chrome.declarativeNetRequest.getDynamicRules({ ruleIds: [BLOCK_RULE_ID] });
  const currentDomains = [...(current?.condition.requestDomains || [])].sort();
  if (currentDomains.join() === blocked.join()) return;
  const addRules = blocked.length
    ? [{
        id: BLOCK_RULE_ID,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: { regexSubstitution: chrome.runtime.getURL('blocked.html') + '#\\0' },
        },
        condition: {
          regexFilter: '^https?://.*$',
          requestDomains: blocked,
          resourceTypes: ['main_frame'],
        },
      }]
    : [];
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [BLOCK_RULE_ID], addRules });
}

async function isUnlocked(tabId, domain) {
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  return rules.some((r) => r.condition.tabIds?.includes(tabId) && r.condition.requestDomains?.includes(domain));
}

// The network rule never sees navigations that a site's own service worker
// answers from cache (x.com does this), and doesn't touch pages that are
// already open when a block starts, so also enforce at the tab level.
async function enforce(tabId, url, state) {
  if (tabId < 0 || !/^https?:/.test(url)) return;
  state ??= await getState();
  const host = new URL(url).hostname;
  const domain = state.domains.find((d) => hostMatches(host, d));
  if (!domain || !blockReason(domain, state.rules, state.usage)) return;
  if (await isUnlocked(tabId, domain)) return;
  chrome.tabs.update(tabId, { url: chrome.runtime.getURL('blocked.html') + '#' + url });
}

async function enforceAllTabs(state) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) if (tab.url) enforce(tab.id, tab.url, state);
}

async function refresh() {
  const state = await getState();
  await syncBlockRule(state);
  await enforceAllTabs(state);
}

// Counts time toward a site's daily allowance while it's the active tab of a
// focused Chrome window, and only during that site's block window.
async function countUsage() {
  const win = await chrome.windows.getLastFocused({ populate: true }).catch(() => null);
  const tab = win?.focused && win.tabs?.find((t) => t.active);
  if (!tab?.url || !/^https?:/.test(tab.url)) return;
  const { domains, rules, usage } = await getState();
  const domain = domains.find((d) => hostMatches(new URL(tab.url).hostname, d));
  if (!domain) return;
  const rule = getRule(rules, domain);
  if (!rule.dailyMinutes || !inBlockWindow(rule.schedule)) return;
  const today = todayKey();
  const next = usage.date === today ? usage : { date: today, minutes: {} };
  next.minutes[domain] = (next.minutes[domain] || 0) + TICK_MINUTES;
  await chrome.storage.local.set({ usage: next });
}

// Usage changes trigger a refresh through storage.onChanged; the tick's own
// refresh catches schedule windows opening and closing.
async function tick() {
  await countUsage();
  await refresh();
}

async function ensureTick() {
  if (!(await chrome.alarms.get(TICK))) chrome.alarms.create(TICK, { periodInMinutes: TICK_MINUTES });
}

async function unlockTab(tabId, domain) {
  // Ids only ever increase within a browser session, so a stale alarm can
  // never remove a newer unlock that happened to reuse an id.
  const { nextUnlockId = 1 } = await chrome.storage.session.get('nextUnlockId');
  await chrome.storage.session.set({ nextUnlockId: nextUnlockId + 1 });
  await chrome.declarativeNetRequest.updateSessionRules({
    addRules: [{
      id: nextUnlockId,
      priority: UNLOCK_PRIORITY,
      action: { type: 'allow' },
      condition: { requestDomains: [domain], tabIds: [tabId], resourceTypes: ['main_frame'] },
    }],
  });
  const { unlockMinutes } = getRule((await getState()).rules, domain);
  if (unlockMinutes) chrome.alarms.create(UNLOCK_ALARM + nextUnlockId, { when: Date.now() + unlockMinutes * 60000 });
}

async function removeUnlocks(ruleIds) {
  if (!ruleIds.length) return;
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: ruleIds });
  for (const id of ruleIds) chrome.alarms.clear(UNLOCK_ALARM + id);
}

async function removeDomain(domain) {
  const { domains, rules, usage } = await getState();
  delete rules[domain];
  if (usage.minutes) delete usage.minutes[domain];
  await chrome.storage.local.set({ domains: domains.filter((d) => d !== domain), rules, usage });
}

chrome.runtime.onInstalled.addListener(() => { ensureTick(); refresh(); });
chrome.runtime.onStartup.addListener(async () => {
  // Session rules are gone after a restart, so their expiry alarms are stale.
  for (const a of await chrome.alarms.getAll()) if (a.name.startsWith(UNLOCK_ALARM)) chrome.alarms.clear(a.name);
  ensureTick();
  refresh();
});
ensureTick();

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === TICK) return tick();
  if (alarm.name.startsWith(UNLOCK_ALARM)) {
    await removeUnlocks([Number(alarm.name.slice(UNLOCK_ALARM.length))]);
    await enforceAllTabs();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.domains || changes.rules || changes.usage)) refresh();
});

chrome.webNavigation.onBeforeNavigate.addListener((d) => {
  if (d.frameId === 0 && d.documentLifecycle !== 'prerender') enforce(d.tabId, d.url);
});
// Backstop for anything that changes the tab URL without a regular navigation,
// such as an omnibox prerender being activated.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.url) enforce(tabId, info.url);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  await removeUnlocks(rules.filter((r) => r.condition.tabIds?.includes(tabId)).map((r) => r.id));
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'unlock' && sender.tab) {
    unlockTab(sender.tab.id, msg.domain).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'removeDomain') {
    removeDomain(msg.domain).then(() => sendResponse({ ok: true }));
    return true;
  }
});
