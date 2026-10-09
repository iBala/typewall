import { mountChallenge } from './challenge.js';
import { DAY_NAMES, DEFAULT_RULE, describeRule, getRule, isLoosening, usedMinutesToday } from './rules.js';

const form = document.getElementById('add-form');
const addInput = document.getElementById('add-input');
const addError = document.getElementById('add-error');
const list = document.getElementById('list');
const empty = document.getElementById('empty');
const gatePanel = document.getElementById('gate-panel');
const challengeRoot = document.getElementById('challenge');

async function getState() {
  const { domains = [], rules = {}, usage = {} } = await chrome.storage.local.get(['domains', 'rules', 'usage']);
  return { domains, rules, usage };
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

function summaryText(domain, rules, usage) {
  const rule = getRule(rules, domain);
  let text = describeRule(rule);
  if (rule.dailyMinutes) text += ` · ${Math.floor(usedMinutesToday(usage, domain))} of ${rule.dailyMinutes} used today`;
  return text;
}

async function render() {
  const { domains, rules, usage } = await getState();
  list.innerHTML = '';
  empty.hidden = domains.length > 0;
  for (const d of [...domains].sort()) {
    const li = document.createElement('li');
    li.className = 'site';
    const info = document.createElement('div');
    info.className = 'site-info';
    const name = document.createElement('span');
    name.className = 'site-name';
    name.textContent = d;
    const summary = document.createElement('span');
    summary.className = 'site-summary';
    summary.dataset.domain = d;
    summary.textContent = summaryText(d, rules, usage);
    info.append(name, summary);
    const edit = document.createElement('button');
    edit.className = 'secondary';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => openEditor(li, d));
    const remove = document.createElement('button');
    remove.className = 'secondary';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => openGate(`Unblock ${d}?`, () => chrome.runtime.sendMessage({ type: 'removeDomain', domain: d })));
    const actions = document.createElement('div');
    actions.className = 'site-actions';
    actions.append(edit, remove);
    li.append(info, actions);
    list.append(li);
  }
}

// Usage ticks every 30 seconds; only refresh the summaries so an open editor
// isn't thrown away.
async function renderSummaries() {
  const { rules, usage } = await getState();
  for (const el of list.querySelectorAll('.site-summary')) el.textContent = summaryText(el.dataset.domain, rules, usage);
}

// Days are shown Monday first.
const DAY_ORDER = [[1, 'M'], [2, 'T'], [3, 'W'], [4, 'T'], [5, 'F'], [6, 'S'], [0, 'S']];
const UNLOCK_CHOICES = [[null, 'Until the tab closes'], [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour']];

async function openEditor(li, domain) {
  list.querySelector('.rule-editor')?.remove();
  const { rules } = await getState();
  const rule = getRule(rules, domain);
  const sched = rule.schedule || { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' };

  const ed = document.createElement('form');
  ed.className = 'rule-editor';
  ed.innerHTML = `
    <div class="field">
      <div class="label">When is it blocked?</div>
      <label class="choice"><input type="radio" name="when" value="always"> All the time</label>
      <label class="choice"><input type="radio" name="when" value="schedule"> Only on certain days and times</label>
      <div class="schedule">
        <div class="days">
          ${DAY_ORDER.map(([d, l]) => `<label class="day" title="${DAY_NAMES[d]}"><input type="checkbox" name="day" value="${d}"><span>${l}</span></label>`).join('')}
        </div>
        <div class="times">From <input type="time" name="start" required> to <input type="time" name="end" required></div>
      </div>
    </div>
    <div class="field">
      <label class="choice"><input type="checkbox" name="allow"> Give me <input type="number" name="daily" min="1" max="1440" value="${rule.dailyMinutes || 30}"> free minutes a day before blocking</label>
    </div>
    <div class="field">
      <label class="choice">After I type a passage, unlock for
        <select name="unlock">${UNLOCK_CHOICES.map(([v, l]) => `<option value="${v ?? ''}">${l}</option>`).join('')}</select>
      </label>
    </div>
    <p class="error"></p>
    <div class="editor-actions">
      <button type="submit">Save</button>
      <button type="button" class="secondary cancel">Cancel</button>
    </div>
  `;
  const f = ed.elements;
  f.when.value = rule.schedule ? 'schedule' : 'always';
  for (const box of f.day) box.checked = sched.days.includes(Number(box.value));
  f.start.value = sched.start;
  f.end.value = sched.end;
  f.allow.checked = !!rule.dailyMinutes;
  f.unlock.value = rule.unlockMinutes ?? '';
  const scheduleEl = ed.querySelector('.schedule');
  const sync = () => {
    scheduleEl.hidden = f.when.value !== 'schedule';
    f.daily.disabled = !f.allow.checked;
  };
  ed.addEventListener('change', sync);
  sync();

  ed.querySelector('.cancel').addEventListener('click', () => ed.remove());
  ed.addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = ed.querySelector('.error');
    const days = [...f.day].filter((b) => b.checked).map((b) => Number(b.value));
    const daily = Number(f.daily.value);
    if (f.when.value === 'schedule' && !days.length) return (error.textContent = 'Pick at least one day.');
    if (f.allow.checked && !(daily >= 1 && daily <= 1440)) return (error.textContent = 'Free minutes must be between 1 and 1440.');
    const next = {
      schedule: f.when.value === 'schedule' ? { days, start: f.start.value, end: f.end.value } : null,
      dailyMinutes: f.allow.checked ? daily : null,
      unlockMinutes: f.unlock.value ? Number(f.unlock.value) : null,
    };
    const save = async () => {
      const state = await getState();
      if (JSON.stringify(next) === JSON.stringify(DEFAULT_RULE)) delete state.rules[domain];
      else state.rules[domain] = next;
      await chrome.storage.local.set({ rules: state.rules });
    };
    ed.remove();
    if (isLoosening(rule, next)) openGate(`Loosen the rule for ${domain}?`, save);
    else await save();
  });

  li.after(ed);
}

// Anything that weakens a block has to get past the typing challenge first.
function openGate(title, action) {
  document.getElementById('gate-title').textContent = title;
  gatePanel.hidden = false;
  challengeRoot.classList.remove('shake');
  mountChallenge(challengeRoot, {
    onSuccess: async () => {
      await action();
      closeGate();
    },
  });
  gatePanel.scrollIntoView({ behavior: 'smooth' });
}

function closeGate() {
  gatePanel.hidden = true;
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
  const { domains } = await getState();
  if (!domains.includes(domain)) await chrome.storage.local.set({ domains: [...domains, domain] });
  addInput.value = '';
});

document.getElementById('cancel-gate').addEventListener('click', closeGate);

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
  if (changes.domains || changes.rules) render();
  else if (changes.usage) renderSummaries();
  if (changes.customPassages) renderCustom();
});
render();
renderCustom();
updateCount();
