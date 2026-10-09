import { PASSAGES } from './passages.js';

// Renders a random passage on a canvas (so it can't be selected or copied)
// and makes the user retype it. The first wrong character wipes the input and
// swaps in a different passage. Paste, drop, autocorrect and editing are
// blocked: the only accepted input is typing characters at the end.

const FONT = '20px Georgia, "Times New Roman", serif';
const LINE_HEIGHT = 32;
const PADDING = 20;

function pickPassage(exclude) {
  if (PASSAGES.length < 2) return PASSAGES[0];
  let p;
  do { p = PASSAGES[Math.floor(Math.random() * PASSAGES.length)]; } while (p === exclude);
  return p;
}

// Greedy word wrap that keeps track of each character's offset in the passage
// so the typed / untyped portions can be colored per character.
function layout(ctx, text, maxWidth) {
  const lines = [];
  const words = text.split(' ');
  let line = '';
  let lineStart = 0;
  let offset = 0;
  for (const word of words) {
    const candidate = line ? line + ' ' + word : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push({ text: line + ' ', start: lineStart });
      lineStart = offset;
      line = word;
    } else {
      line = candidate;
    }
    offset += word.length + 1;
  }
  lines.push({ text: line, start: lineStart });
  return lines;
}

export function mountChallenge(root, { onSuccess }) {
  root.innerHTML = `
    <canvas class="passage" aria-label="Passage to type"></canvas>
    <textarea class="typing" rows="4" spellcheck="false" autocomplete="off"
      autocorrect="off" autocapitalize="off" placeholder="Start typing the passage above..."></textarea>
    <div class="status"><span class="progress"></span><span class="message"></span></div>
  `;
  const canvas = root.querySelector('canvas');
  const input = root.querySelector('textarea');
  const progressEl = root.querySelector('.progress');
  const messageEl = root.querySelector('.message');
  const ctx = canvas.getContext('2d');

  let target = pickPassage();
  let done = false;

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    ctx.font = FONT;
    const lines = layout(ctx, target, width - PADDING * 2);
    const height = lines.length * LINE_HEIGHT + PADDING * 2;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = FONT;
    ctx.textBaseline = 'top';

    const typed = input.value.length;
    lines.forEach((line, i) => {
      const y = PADDING + i * LINE_HEIGHT + 6;
      let x = PADDING;
      for (let j = 0; j < line.text.length; j++) {
        const ch = line.text[j];
        const idx = line.start + j;
        const w = ctx.measureText(ch).width;
        if (idx === typed) {
          ctx.fillStyle = '#f5c542';
          ctx.fillRect(x, y + 24, Math.max(w, 6), 2);
        }
        ctx.fillStyle = idx < typed ? '#4ade80' : idx === typed ? '#ffffff' : '#9aa3b2';
        ctx.fillText(ch, x, y);
        x += w;
      }
    });

    const totalWords = target.split(' ').length;
    const typedWords = input.value.split(' ').length - 1;
    progressEl.textContent = `${typedWords} / ${totalWords} words`;
  }

  function fail() {
    target = pickPassage(target);
    input.value = '';
    messageEl.textContent = 'Wrong character. New passage. Start again.';
    root.classList.remove('shake');
    void root.offsetWidth;
    root.classList.add('shake');
    draw();
  }

  input.addEventListener('beforeinput', (e) => {
    if (done || e.inputType !== 'insertText') e.preventDefault();
  });
  for (const ev of ['paste', 'drop', 'cut', 'contextmenu']) {
    input.addEventListener(ev, (e) => e.preventDefault());
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') e.preventDefault();
  });

  input.addEventListener('input', () => {
    const v = input.value;
    if (!target.startsWith(v)) return fail();
    messageEl.textContent = '';
    draw();
    if (v === target) {
      done = true;
      input.disabled = true;
      messageEl.textContent = 'Correct.';
      onSuccess();
    }
  });

  new ResizeObserver(draw).observe(canvas);
  draw();
  input.focus();
}
