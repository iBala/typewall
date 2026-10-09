import { mountChallenge } from './challenge.js';

const form = document.getElementById('add-form');
const addInput = document.getElementById('add-input');
const addError = document.getElementById('add-error');
const list = document.getElementById('list');
const empty = document.getElementById('empty');
const removePanel = document.getElementById('remove-panel');
const challengeRoot = document.getElementById('challenge');

async function getDomains() {
  const { domains = [] } = await chrome.storage.local.get('domains');
  return domains;
}

// Accepts "YouTube.com", "https://www.youtube.com/watch?v=x", "*.reddit.com"
// and reduces it to a bare lowercase (punycode) domain.
function normalize(raw) {
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z]+:\/\//, '').replace(/^\*\./, '');
  let host;
  try { host = new URL('http://' + s).hostname; } catch { return null; }
  host = host.replace(/^www\./, '').replace(/\.$/, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(host)) return null;
  return host;
}

async function render() {
  const domains = await getDomains();
  list.innerHTML = '';
  empty.hidden = domains.length > 0;
  for (const d of [...domains].sort()) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = d;
    const btn = document.createElement('button');
    btn.className = 'secondary';
    btn.textContent = 'Remove';
    btn.addEventListener('click', () => startRemove(d));
    li.append(name, btn);
    list.append(li);
  }
}

function startRemove(domain) {
  document.getElementById('remove-domain').textContent = domain;
  removePanel.hidden = false;
  challengeRoot.classList.remove('shake');
  mountChallenge(challengeRoot, {
    onSuccess: async () => {
      await chrome.runtime.sendMessage({ type: 'removeDomain', domain });
      closeRemove();
    },
  });
  removePanel.scrollIntoView({ behavior: 'smooth' });
}

function closeRemove() {
  removePanel.hidden = true;
  challengeRoot.innerHTML = '';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  addError.textContent = '';
  const domain = normalize(addInput.value);
  if (!domain) {
    addError.textContent = 'That does not look like a domain.';
    return;
  }
  const domains = await getDomains();
  if (!domains.includes(domain)) await chrome.storage.local.set({ domains: [...domains, domain] });
  addInput.value = '';
});

document.getElementById('cancel-remove').addEventListener('click', closeRemove);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.domains) render();
});
render();
