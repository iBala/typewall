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

// Custom passages. Short ones would make unlocking trivial, so there's a
// minimum length. Removing one is free because that only makes unlocking harder.
const MIN_WORDS = 20;
const customForm = document.getElementById('custom-form');
const customInput = document.getElementById('custom-input');
const customCount = document.getElementById('custom-count');
const customError = document.getElementById('custom-error');
const customList = document.getElementById('custom-list');
document.getElementById('min-words').textContent = MIN_WORDS;

// Smart quotes, dashes and line breaks from pasted text would be awkward or
// impossible to type back, so reduce them to plain keyboard characters.
function normalizePassage(raw) {
  return raw
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

const wordCount = (s) => (s ? s.split(' ').length : 0);

async function getCustom() {
  const { customPassages = [] } = await chrome.storage.local.get('customPassages');
  return customPassages;
}

async function renderCustom() {
  const passages = await getCustom();
  customList.innerHTML = '';
  passages.forEach((p, i) => {
    const li = document.createElement('li');
    const text = document.createElement('span');
    text.textContent = p;
    const btn = document.createElement('button');
    btn.className = 'secondary';
    btn.textContent = 'Delete';
    btn.addEventListener('click', async () => {
      const current = await getCustom();
      await chrome.storage.local.set({ customPassages: current.filter((_, j) => j !== i) });
    });
    li.append(text, btn);
    customList.append(li);
  });
}

function updateCount() {
  const n = wordCount(normalizePassage(customInput.value));
  customCount.textContent = `${n} / ${MIN_WORDS} words`;
}

customInput.addEventListener('input', updateCount);
customForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  customError.textContent = '';
  const passage = normalizePassage(customInput.value);
  if (wordCount(passage) < MIN_WORDS) {
    customError.textContent = `Make it at least ${MIN_WORDS} words.`;
    return;
  }
  const passages = await getCustom();
  if (!passages.includes(passage)) await chrome.storage.local.set({ customPassages: [...passages, passage] });
  customInput.value = '';
  updateCount();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.domains) render();
  if (changes.customPassages) renderCustom();
});
render();
renderCustom();
updateCount();
