// Blocking is a single persistent dynamic rule that redirects any main-frame
// request to a blocked domain (or its subdomains) to blocked.html.
// Unlocks are session rules scoped to one tab + one domain, with a higher
// priority "allow". Session rules vanish on browser restart, and we remove
// them when the tab closes, so an unlock lasts exactly as long as the tab.

const BLOCK_RULE_ID = 1;
const UNLOCK_PRIORITY = 2;

async function getDomains() {
  const { domains = [] } = await chrome.storage.local.get('domains');
  return domains;
}

async function syncBlockRule() {
  const domains = await getDomains();
  const addRules = domains.length
    ? [{
        id: BLOCK_RULE_ID,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: { regexSubstitution: chrome.runtime.getURL('blocked.html') + '#\\0' },
        },
        condition: {
          regexFilter: '^https?://.*$',
          requestDomains: domains,
          resourceTypes: ['main_frame'],
        },
      }]
    : [];
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [BLOCK_RULE_ID], addRules });
}

function hostMatches(host, domain) {
  return host === domain || host.endsWith('.' + domain);
}

// Tabs already sitting on a newly blocked domain wouldn't be affected by the
// network rule until they navigate, so reload them.
async function reloadNewlyBlockedTabs(added) {
  if (!added.length) return;
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.url) continue;
    let host;
    try { host = new URL(tab.url).hostname; } catch { continue; }
    if (added.some((d) => hostMatches(host, d))) chrome.tabs.reload(tab.id);
  }
}

async function unlockTab(tabId, domain) {
  const existing = await chrome.declarativeNetRequest.getSessionRules();
  const nextId = existing.reduce((max, r) => Math.max(max, r.id), 0) + 1;
  await chrome.declarativeNetRequest.updateSessionRules({
    addRules: [{
      id: nextId,
      priority: UNLOCK_PRIORITY,
      action: { type: 'allow' },
      condition: { requestDomains: [domain], tabIds: [tabId], resourceTypes: ['main_frame'] },
    }],
  });
}

async function removeDomain(domain) {
  const domains = await getDomains();
  await chrome.storage.local.set({ domains: domains.filter((d) => d !== domain) });
}

chrome.runtime.onInstalled.addListener(syncBlockRule);
chrome.runtime.onStartup.addListener(syncBlockRule);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.domains) return;
  const before = changes.domains.oldValue || [];
  const after = changes.domains.newValue || [];
  syncBlockRule().then(() => reloadNewlyBlockedTabs(after.filter((d) => !before.includes(d))));
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  const removeRuleIds = rules.filter((r) => r.condition.tabIds?.includes(tabId)).map((r) => r.id);
  if (removeRuleIds.length) await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds });
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
