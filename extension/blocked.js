import { mountChallenge } from './challenge.js';

const url = location.hash.slice(1);
let host = '';
try { host = new URL(url).hostname; } catch {}

const { domains = [] } = await chrome.storage.local.get('domains');
const domain = domains.find((d) => host === d || host.endsWith('.' + d));

if (!domain) {
  // No longer blocked (removed in the meantime), so just continue.
  if (host) location.replace(url);
} else {
  document.getElementById('domain').textContent = domain;
  document.title = `${domain} is blocked`;
  mountChallenge(document.getElementById('challenge'), {
    onSuccess: async () => {
      await chrome.runtime.sendMessage({ type: 'unlock', domain });
      location.replace(url);
    },
  });
}
