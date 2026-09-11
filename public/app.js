// ═══════════ ZapFamily — Frontend ═══════════
let ME = null;
let socket = null;
let friends = [];
let groups = [];
let requests = { received: [], sent: [] };
let topics = [];
let stickers = [];
let topicFilter = 'all'; // 'all' | 'unread' | <topicId>
let findResults = [];
let currentChat = null; // { kind:'dm', user } ou { kind:'group', group }
let currentMessages = [];
let currentSenders = {}; // p/ grupos: userId -> user
let onlineIds = new Set();
let mainTab = 'chats';
let typingTimer = null;
let peerTypingTimer = null;
let pendingAtt = null; // {kind,data,name,mime,size} anexo a enviar // dataURL da foto a enviar no chat
let groupInfoCache = null;
let peerCache = null;

const AVATARS = ['😀','😎','🤩','😺','🐶','🦊','🐼','🦁','🐸','👩','👨','👧','👦','🧑‍💻','👩‍🎨','🧙','🦸','👽','🤖','🐰','🦄','🐯','🐨','🐷'];
const COLORS = ['#25D366','#128C7E','#075E54','#34B7F1','#FF6B6B','#A855F7','#F59E0B','#EC4899','#6366F1','#14B8A6'];
const EMOJIS = ['😀','😂','😍','🥰','😎','🤔','😭','😡','👍','👎','👏','🙏','💪','🎉','❤️','💔','🔥','⭐','✅','❌','👋','🤝','☕','🍕','🎵','⚽','🚀','💡','🐶','🐱'];
const QUICK_REACT = ['❤️','😂','😮','😢','👍','👏','🔥'];
let regAvatar = AVATARS[0], regColor = COLORS[0], regPhoto = null;
let editAvatar = AVATARS[0], editColor = COLORS[0], editPhoto = null, editPhotoRemoved = false;
let grpPhoto = null;

// ---------- utils ----------
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toast(msg) {
  const d = document.createElement('div');
  d.className = 'toast';
  d.textContent = msg;
  $('toasts').appendChild(d);
  setTimeout(() => d.remove(), 3500);
}
function timeHM(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function dayLabel(iso) {
  const d = new Date(iso), now = new Date();
  const day = d.toDateString(), today = now.toDateString();
  const y = new Date(now); y.setDate(now.getDate()-1);
  if (day === today) return 'Hoje';
  if (day === y.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR');
}
function lastSeenLabel(u) {
  if (onlineIds.has(u.id)) return '🟢 online agora';
  if (!u.last_seen) return 'offline';
  const diff = Date.now() - new Date(u.last_seen).getTime();
  const min = Math.floor(diff/60000);
  if (min < 1) return 'visto agora mesmo';
  if (min < 60) return `visto há ${min} min`;
  const h = Math.floor(min/60);
  if (h < 24) return `visto há ${h}h`;
  return 'visto há ' + new Date(u.last_seen).toLocaleDateString('pt-BR');
}
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && ME) {
    ME = null;
    toast('🔑 Sua sessão expirou. Entre novamente.');
    setTimeout(() => location.reload(), 1500);
    throw new Error('Sessão expirada');
  }
  if (!res.ok) throw new Error(data.error || 'Erro inesperado');
  return data;
}

// ---------- som + título com contador + status de conexão ----------
let audioCtx = null;
function beep(freq) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = audioCtx || new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.frequency.value = freq || 880;
    o.type = 'sine';
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.start(t); o.stop(t + 0.3);
  } catch (e) {}
}
function updateTitle() {
  const n = friends.reduce((s, f) => s + (f.unread || 0), 0)
    + groups.reduce((s, g) => s + (g.unread || 0), 0)
    + requests.received.length;
  document.title = zfDocTitle(n);
}
function setConnStatus(st) {
  const el = $('conn-dot');
  if (!el) return;
  el.textContent = st === 'on' ? '🟢' : (st === 'wait' ? '🟡' : '🔴');
  el.title = st === 'on' ? 'Conectado' : (st === 'wait' ? 'Reconectando…' : 'Desconectado — tentando reconectar…');
}

// ═══════════ TEMAS (presets + editor profissional) ═══════════
const THEME_VARS = [
  ['bodybg', 'Fundo do app'], ['panel', 'Painéis'], ['panel2', 'Barras e campos'],
  ['line', 'Linhas'], ['ink', 'Texto'], ['muted', 'Texto apagado'],
  ['chatbg', 'Fundo do chat'], ['msg-me', 'Bolha enviada'], ['msg-them', 'Bolha recebida'],
  ['msg-me-ink', 'Texto enviado'], ['msg-them-ink', 'Texto recebido'],
  ['wa-dark', 'Cor principal'], ['wa-teal', 'Cor secundária'], ['wa-green', 'Destaque'],
  ['sidebg', 'Lateral'],
];
const THEME_EASY = [
  ['bodybg', 'Fundo'], ['panel', 'Painéis'], ['ink', 'Texto'],
  ['msg-me', 'Bolha enviada'], ['msg-them', 'Bolha recebida'], ['wa-dark', 'Cor principal'],
];
const FONT_STACKS = {
  system: "'Segoe UI', system-ui, sans-serif",
  rounded: "'Nunito', 'Quicksand', 'Segoe UI Rounded', cursive",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'Consolas', 'Courier New', monospace",
  fun: "'Trebuchet MS', 'Comic Sans MS', sans-serif",
};
const FONT_NAMES = { system: 'Sistema', rounded: 'Arredondada', serif: 'Clássica', mono: 'Monoespaçada', fun: 'Divertida' };
let currentFontfam = 'system';
let currentWin98 = false;
const THEME_PRESETS = [
  { name: 'Zap Claro', icon: '☀️', dark: false, radius: 10, font: 15, vars: { bodybg:'#d1d7db', panel:'#ffffff', panel2:'#f0f2f5', line:'#e9edef', ink:'#222222', muted:'#667781', chatbg:'#ECE5DD', 'msg-me':'#DCF8C6', 'msg-them':'#ffffff', 'msg-me-ink':'#222222', 'msg-them-ink':'#222222', 'wa-dark':'#075E54', 'wa-teal':'#128C7E', 'wa-green':'#25D366' } },
  { name: 'Zap Escuro', icon: '🌙', dark: true, radius: 10, font: 15, vars: { bodybg:'#0b141a', panel:'#111b21', panel2:'#1f2c33', line:'#2a3942', ink:'#e9edef', muted:'#8696a0', chatbg:'#0b141a', 'msg-me':'#005c4b', 'msg-them':'#1f2c33', 'msg-me-ink':'#e9edef', 'msg-them-ink':'#e9edef', 'wa-dark':'#075E54', 'wa-teal':'#128C7E', 'wa-green':'#25D366' } },
  { name: 'Meia-Noite Roxa', icon: '💜', dark: true, radius: 14, font: 15, vars: { bodybg:'#0f0a1e', panel:'#1a1333', panel2:'#251b4d', line:'#372a6b', ink:'#efe9ff', muted:'#9d8fd0', chatbg:'#0f0a1e', 'msg-me':'#6d28d9', 'msg-them':'#2a2148', 'msg-me-ink':'#ffffff', 'msg-them-ink':'#efe9ff', 'wa-dark':'#4c1d95', 'wa-teal':'#7c3aed', 'wa-green':'#a855f7' } },
  { name: 'Oceano', icon: '🌊', dark: true, radius: 12, font: 15, vars: { bodybg:'#04121f', panel:'#072032', panel2:'#0b2f47', line:'#14425f', ink:'#e3f2fd', muted:'#7fa8c4', chatbg:'#04121f', 'msg-me':'#0277bd', 'msg-them':'#10394f', 'msg-me-ink':'#ffffff', 'msg-them-ink':'#e3f2fd', 'wa-dark':'#014876', 'wa-teal':'#0288d1', 'wa-green':'#29b6f6' } },
  { name: 'Pôr do Sol', icon: '🌅', dark: false, radius: 16, font: 15, vars: { bodybg:'#f7d9c4', panel:'#fff6ef', panel2:'#fbe7d7', line:'#f0cdb4', ink:'#4a2c1a', muted:'#a3765e', chatbg:'#f3ddc9', 'msg-me':'#ffb74d', 'msg-them':'#ffffff', 'msg-me-ink':'#4a2c1a', 'msg-them-ink':'#4a2c1a', 'wa-dark':'#bf5b21', 'wa-teal':'#e07b39', 'wa-green':'#f2994a' } },
  { name: 'Floresta', icon: '🌲', dark: true, radius: 10, font: 15, vars: { bodybg:'#0a140f', panel:'#102019', panel2:'#1a3327', line:'#2a4d3a', ink:'#e6f4ea', muted:'#8fb69e', chatbg:'#0a140f', 'msg-me':'#1f7a4d', 'msg-them':'#1c3329', 'msg-me-ink':'#ffffff', 'msg-them-ink':'#e6f4ea', 'wa-dark':'#0d4d2b', 'wa-teal':'#178a50', 'wa-green':'#2fbf71' } },
  { name: 'Windows 98', icon: '🪟', secret: true, win98: true, dark: false, radius: 0, font: 14, vars: { bodybg:'#008080', panel:'#c0c0c0', panel2:'#dfdfdf', sidebg:'#c0c0c0', line:'#808080', ink:'#000000', muted:'#404040', chatbg:'#ffffff', 'msg-me':'#ffffe1', 'msg-them':'#ffffff', 'msg-me-ink':'#000000', 'msg-them-ink':'#000000', 'wa-dark':'#000080', 'wa-teal':'#1084d0', 'wa-green':'#008000' } }
];
for (const p of THEME_PRESETS) { p.vars.sidebg = p.vars.sidebg || p.vars.panel; if (!p.win98) p.vars.fontfam = 'system'; }
function cssVar(n) { return getComputedStyle(document.body).getPropertyValue(n).trim(); }
function applyThemeVars(vars, dark, radius, font, save, win98) {
  vars = Object.assign({}, vars);
  if (!vars.sidebg) vars.sidebg = vars.panel || '#ffffff';
  const ff = FONT_STACKS[vars.fontfam] ? vars.fontfam : 'system';
  currentFontfam = ff;
  for (const k of Object.keys(vars)) {
    if (k === 'fontfam') continue;
    document.body.style.setProperty('--' + k, vars[k]);
  }
  document.body.style.setProperty('--fontfam', FONT_STACKS[ff]);
  if (radius !== undefined) document.body.style.setProperty('--radius', radius + 'px');
  if (font !== undefined) document.body.style.setProperty('--chat-font', font + 'px');
  document.body.classList.toggle('dark', !!dark);
  currentWin98 = !!win98;
  document.body.classList.toggle('win98', currentWin98);
  if (save !== false) {
    try { localStorage.setItem('zf-theme-vars', JSON.stringify({ vars, dark: !!dark, radius, font, win98: !!win98 })); } catch (e) {}
  }
}
function applyTheme() {
  try {
    const saved = JSON.parse(localStorage.getItem('zf-theme-vars') || 'null');
    if (saved && saved.vars) { applyThemeVars(saved.vars, saved.dark, saved.radius, saved.font, false, !!saved.win98); return; }
  } catch (e) {}
  const oldDark = localStorage.getItem('zf-theme') === 'dark';
  const p = THEME_PRESETS[oldDark ? 1 : 0];
  applyThemeVars(p.vars, p.dark, p.radius, p.font);
}
function getCustomThemes() {
  try { return JSON.parse(localStorage.getItem('zf-custom-themes') || '[]'); } catch (e) { return []; }
}
function setCustomThemes(list) {
  try { localStorage.setItem('zf-custom-themes', JSON.stringify(list)); } catch (e) {}
}
function selectPreset(i) {
  const p = THEME_PRESETS[i];
  applyThemeVars({ ...p.vars }, p.dark, p.radius, p.font, true, !!p.win98);
  if (p.win98 && getWallpaper()) { try { localStorage.removeItem('zf-wallpaper'); } catch (e) {} applyWallpaper(); }
  try { localStorage.setItem('zf-theme-sel', 'p' + i); } catch (e) {}
  openThemeModal();
  toast(`🎨 Tema "${p.name}" aplicado!`);
}
function selectCustom(i) {
  const list = getCustomThemes();
  const t = list[i];
  if (!t) return;
  applyThemeVars({ ...t.vars }, t.dark, t.radius, t.font, true, !!t.win98);
  if (t.win98) { try { localStorage.removeItem('zf-wallpaper'); } catch (e) {} applyWallpaper(); } else if (t.wall) setWallpaper(t.wall, true);
  try { localStorage.setItem('zf-theme-sel', 'c' + i); } catch (e) {}
  openThemeModal();
  toast(`🎨 Tema "${t.name}" aplicado!`);
}
function deleteCustom(i, ev) {
  if (ev) ev.stopPropagation();
  if (!confirm('Apagar este tema?')) return;
  const list = getCustomThemes();
  list.splice(i, 1);
  setCustomThemes(list);
  openThemeModal();
}
function openThemeModal() {
  renderThemeModal();
  $('modal-theme').classList.remove('hidden');
}
function themeCardHTML(name, icon, vars, sel, onclick, delOnclick) {
  const dots = ['msg-me', 'msg-them', 'wa-green', 'panel2'].map(k =>
    `<span class="tcard-dot" style="background:${esc(vars[k] || '#888')}"></span>`).join('');
  return `<div class="tcard${sel ? ' sel' : ''}" onclick="${onclick}">${delOnclick ? `<button class="tcard-del" onclick="${delOnclick}">×</button>` : ''}
    <div class="tcard-name">${icon} ${esc(name)}</div><div class="tcard-dots">${dots}</div></div>`;
}function renderThemeModal() {
  let sel = '';
  try { sel = localStorage.getItem('zf-theme-sel') || ''; } catch (e) {}
  const w98 = win98Unlocked();
  $('theme-presets').innerHTML = THEME_PRESETS.map((p, i) =>
    (p.secret && !w98)
      ? `<div class="tcard" onclick="toast('🔒 Tema secreto! 🔍 Dica: pesquise um ano especial na lupa...')"><div class="tcard-name">🔒 ???</div><div class="tcard-dots"><span class="tcard-dot" style="background:#808080"></span></div></div>`
      : themeCardHTML(p.name, p.icon, p.vars, sel === 'p' + i, `selectPreset(${i})`, '')).join('');
  const customs = getCustomThemes();
  $('theme-customs').innerHTML = customs.length
    ? customs.map((t, i) => themeCardHTML(t.name, '🖌️', t.vars, sel === 'c' + i, `selectCustom(${i})`, `deleteCustom(${i},event)`)).join('')
    : `<p class="muted small">Nenhum ainda — crie no editor abaixo! 👇</p>`;
  const cur = {};
  for (const [k] of THEME_VARS) cur[k] = cssVar('--' + k) || '#888888';
  const rowHTML = ([k, label]) =>
    `<label class="tvar"><span>${label}</span><span class="tvar-in"><input type="color" data-var="${k}" value="${toHexColor(cur[k])}" oninput="themeDraftFromUI(this)"><code>${esc(cur[k])}</code></span></label>`;
  $('theme-easy').innerHTML = THEME_EASY.map(rowHTML).join('');
  $('theme-vars').innerHTML = THEME_VARS.map(rowHTML).join('');
  const r = parseInt(cssVar('--radius')) || 10;
  const f = parseInt(cssVar('--chat-font')) || 15;
  $('theme-radius').value = r;
  $('theme-font').value = f;
  $('theme-radius-v').textContent = r + 'px';
  $('theme-font-v').textContent = f + 'px';
  $('theme-dark').checked = document.body.classList.contains('dark');
  $('theme-fontfam').value = currentFontfam;
  $('theme-title').value = zfAppName() === 'ZapFamily' ? '' : zfAppName();
  renderWallInputs();
  renderIconChoices();
  renderThemeLocks();
  updateCRTBtn();
}
function toHexColor(c) {
  c = String(c).trim();
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return '#' + [1, 2, 3].map(i => Number(m[i]).toString(16).padStart(2, '0')).join('');
  return '#888888';
}function themeDraftFromUI(el) {
  if (el && el.dataset && el.dataset.var) {
    document.querySelectorAll('input[type=color][data-var="' + el.dataset.var + '"]').forEach(inp => { inp.value = el.value; });
  }
  const vars = {};
  document.querySelectorAll('#theme-easy input[type=color], #theme-vars input[type=color]').forEach(inp => { vars[inp.dataset.var] = inp.value; });
  vars.fontfam = $('theme-fontfam').value;
  currentFontfam = vars.fontfam;
  const r = Number($('theme-radius').value), f = Number($('theme-font').value);
  $('theme-radius-v').textContent = r + 'px';
  $('theme-font-v').textContent = f + 'px';
  document.querySelectorAll('#theme-easy .tvar, #theme-vars .tvar').forEach((row) => {
    const inp = row.querySelector('input[type=color]');
    const code = row.querySelector('code');
    if (inp && code) code.textContent = inp.value;
  });
  if (currentWin98) applyThemeVars(vars, false, 0, 14, true, true); else applyThemeVars(vars, $('theme-dark').checked, r, f);
  try { localStorage.setItem('zf-theme-sel', ''); } catch (e) {}
}
function saveCustomTheme() {
  const name = $('theme-name').value.trim() || 'Meu tema';
  const vars = {};
  document.querySelectorAll('#theme-easy input[type=color], #theme-vars input[type=color]').forEach(inp => { vars[inp.dataset.var] = inp.value; });
  vars.fontfam = $('theme-fontfam').value;
  const list = getCustomThemes();
  list.unshift({ name: name.slice(0, 30), dark: currentWin98 ? false : $('theme-dark').checked, radius: currentWin98 ? 0 : Number($('theme-radius').value), font: currentWin98 ? 14 : Number($('theme-font').value), vars, win98: currentWin98, wall: currentWin98 ? null : getWallpaper() });
  setCustomThemes(list.slice(0, 20));
  $('theme-name').value = '';
  openThemeModal();
  toast(`💾 Tema "${name}" salvo!`);
}function exportTheme() {
  const vars = {};
  document.querySelectorAll('#theme-easy input[type=color], #theme-vars input[type=color]').forEach(inp => { vars[inp.dataset.var] = inp.value; });
  vars.fontfam = $('theme-fontfam').value;
  const wall = getWallpaper();
  const hadImg = !!(wall && wall.img);
  const code = JSON.stringify({ name: $('theme-name').value.trim() || 'Meu tema', dark: $('theme-dark').checked, radius: Number($('theme-radius').value), font: Number($('theme-font').value), vars, win98: currentWin98, wall: currentWin98 ? null : (wall ? { ...wall, img: null } : null) });
  $('theme-io').value = code;
  const msg = hadImg ? '📤 Código copiado! (a foto de fundo não vai junto)' : '📤 Código copiado!';
  try { navigator.clipboard.writeText(code); toast(msg); }
  catch (e) { toast('📤 Código gerado abaixo — copie!'); }
}function importTheme() {
  try {
    const t = JSON.parse($('theme-io').value.trim());
    if (!t.vars) throw new Error('x');
    applyThemeVars(t.vars, !!t.dark, t.radius || 10, t.font || 15, true, !!t.win98);
    if (t.wall && !t.win98) setWallpaper(t.wall, true);
    openThemeModal();
    toast(`📥 Tema "${t.name || 'importado'}" aplicado! Salve se quiser guardar.`);
  } catch (e) { toast('⚠️ Código inválido. Cole um código exportado.'); }
}
// ---- tema aleatório + restaurar ----
// ======= TEMA SECRETO WINDOWS 98 + MISSAO 1998 + FILTRO CRT =======
function win98Unlocked() { try { return localStorage.getItem('zf-win98') === '1'; } catch (e) { return false; } }
function renderThemeLocks() {
  const w = document.body.classList.contains('win98');
  ['theme-row-font', 'theme-row-size', 'theme-wall-sec', 'theme-app-sec', 'btn-random'].forEach(id => {
    const el = $(id);
    if (el) el.style.display = w ? 'none' : '';
  });
  const note = $('win98-note');
  if (note) note.classList.toggle('hidden', !w);
}
function applyCRT() {
  let on = false;
  try { on = localStorage.getItem('zf-crt') === '1'; } catch (e) {}
  document.body.classList.toggle('crt', on);
  updateCRTBtn();
}
function updateCRTBtn() {
  const b = $('btn-crt');
  if (b) b.textContent = document.body.classList.contains('crt') ? '📺 Filtro tubo: ON' : '📺 Filtro tubo: off';
}
function toggleCRT() {
  const on = !document.body.classList.contains('crt');
  try { localStorage.setItem('zf-crt', on ? '1' : '0'); } catch (e) {}
  document.body.classList.toggle('crt', on);
  updateCRTBtn();
}
function searchEnter() {
  const v = $('global-search').value.trim();
  if (v === '1998') { mission1998(); return; }
  forceSearch();
}
function glitchSound() {
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = new C();
    const t0 = ctx.currentTime;
    for (let i = 0; i < 8; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = 100 + Math.random() * 900;
      g.gain.setValueAtTime(0.06, t0 + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.18 + 0.15);
      o.connect(g); g.connect(ctx.destination);
      o.start(t0 + i * 0.18); o.stop(t0 + i * 0.18 + 0.16);
    }
    setTimeout(() => { try { ctx.close(); } catch (e) {} }, 2000);
  } catch (e) {}
}
function mission1998() {
  $('global-search').value = '';
  try { findResults = []; } catch (e) {}
  $('search-results').classList.add('hidden');
  $('search-results').innerHTML = '';
  if (win98Unlocked()) { toast('🪟 Você já tem o Windows 98! Vá em Temas 🎨'); return; }
  glitchSound();
  document.body.classList.add('glitching');
  $('glitch-overlay').classList.remove('hidden');
  setTimeout(() => {
    $('glitch-overlay').classList.add('hidden');
    document.body.classList.remove('glitching');
    try { localStorage.setItem('zf-win98', '1'); } catch (e) {}
    try { localStorage.setItem('zf-crt', '1'); } catch (e) {}
    document.body.classList.add('crt');
    selectPreset(THEME_PRESETS.findIndex(p => p.win98));
    closeModals();
    $('modal-win98').classList.remove('hidden');
  }, 2600);
}
function randHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return '#' + to(f(0)) + to(f(8)) + to(f(4));
}
function randomTheme() {
  const h = Math.floor(Math.random() * 360);
  const dark = Math.random() < 0.5;
  const vars = dark ? {
    bodybg: randHex(h, 45, 8), panel: randHex(h, 40, 13), panel2: randHex(h, 38, 20),
    line: randHex(h, 30, 28), ink: '#f1f5f9', muted: randHex(h, 20, 60),
    chatbg: randHex(h, 45, 8), 'msg-me': randHex(h, 70, 38), 'msg-them': randHex(h, 35, 22),
    'msg-me-ink': '#ffffff', 'msg-them-ink': '#f1f5f9',
    'wa-dark': randHex(h, 65, 30), 'wa-teal': randHex(h, 70, 42), 'wa-green': randHex(h, 85, 55),
  } : {
    bodybg: randHex(h, 40, 85), panel: '#ffffff', panel2: randHex(h, 35, 93),
    line: randHex(h, 25, 86), ink: '#1e293b', muted: randHex(h, 15, 45),
    chatbg: randHex(h, 40, 90), 'msg-me': randHex(h, 75, 80), 'msg-them': '#ffffff',
    'msg-me-ink': '#1e293b', 'msg-them-ink': '#1e293b',
    'wa-dark': randHex(h, 60, 35), 'wa-teal': randHex(h, 65, 45), 'wa-green': randHex(h, 80, 50),
  };
  vars.sidebg = vars.panel;
  vars.fontfam = currentFontfam;
  applyThemeVars(vars, dark, 10 + Math.floor(Math.random() * 9), 15, true, false);
  try { localStorage.setItem('zf-theme-sel', ''); } catch (e) {}
  openThemeModal();
  toast('🎲 Tema surpresa!');
}
function resetTheme() {
  if (!confirm('Voltar ao tema padrão? (Suas criações salvas continuam guardadas)')) return;
  try { localStorage.removeItem('zf-theme-vars'); localStorage.removeItem('zf-theme-sel'); } catch (e) {}
  applyThemeVars({ ...THEME_PRESETS[0].vars }, false, 10, 15, true, false);
  openThemeModal();
  toast('🔄 Tema padrão restaurado!');
}
// ═══════════ PAPEL DE PAREDE ═══════════
function getWallpaper() {
  try { return JSON.parse(localStorage.getItem('zf-wallpaper') || 'null'); } catch (e) { return null; }
}
function setWallpaper(cfg, keepImg) {
  if (currentWin98 && cfg && cfg.img) { toast('🪟 O Windows 98 não usa papel de parede!'); return; }
  const cur = getWallpaper() || {};
  const next = { ...(keepImg ? cur : {}), ...(cfg || {}) };
  if (!next.img) {
    try { localStorage.removeItem('zf-wallpaper'); } catch (e) {}
  } else {
    try { localStorage.setItem('zf-wallpaper', JSON.stringify(next)); }
    catch (e) { toast('⚠️ Imagem muito grande para salvar.'); }
  }
  applyWallpaper();
}
function applyWallpaper() {
  if (document.body.classList.contains('win98')) { $('wallpaper-wrap').classList.add('hidden'); document.body.classList.remove('has-wall'); return; }
  const w = getWallpaper();
  const wrap = $('wallpaper-wrap');
  if (!w || !w.img) { wrap.classList.add('hidden'); document.body.classList.remove('has-wall'); return; }
  const bg = $('wallpaper'), tint = $('wallpaper-tint');
  bg.style.backgroundImage = `url("${w.img}")`;
  bg.style.opacity = (w.opacity === undefined ? 100 : w.opacity) / 100;
  bg.style.filter = w.blur ? `blur(${w.blur}px)` : 'none';
  const fit = w.fit || 'cover';
  bg.style.backgroundSize = fit === 'repeat' ? 'auto' : fit;
  bg.style.backgroundRepeat = fit === 'repeat' ? 'repeat' : 'no-repeat';
  bg.style.backgroundPosition = 'center';
  tint.style.background = w.tint || '#000000';
  tint.style.opacity = (w.tintOp === undefined ? 0 : w.tintOp) / 100;
  wrap.classList.remove('hidden');
  document.body.classList.add('has-wall');
}
function renderWallInputs() {
  const w = getWallpaper() || {};
  $('wall-opacity').value = w.opacity === undefined ? 100 : w.opacity;
  $('wall-blur').value = w.blur || 0;
  $('wall-tint').value = /^#[0-9a-fA-F]{6}$/.test(w.tint || '') ? w.tint : '#000000';
  $('wall-tintop').value = w.tintOp === undefined ? 0 : w.tintOp;
  $('wall-fit').value = w.fit || 'cover';
  wallLabels();
  $('wall-has').textContent = w.img ? '🖼️ Foto aplicada!' : 'Sem foto — envie uma! 👇';
}
function wallLabels() {
  $('wall-opacity-v').textContent = $('wall-opacity').value + '%';
  $('wall-blur-v').textContent = $('wall-blur').value + 'px';
  $('wall-tintop-v').textContent = $('wall-tintop').value + '%';
}
function wallDraftFromUI() {
  wallLabels();
  setWallpaper({
    opacity: Number($('wall-opacity').value), blur: Number($('wall-blur').value),
    tint: $('wall-tint').value, tintOp: Number($('wall-tintop').value), fit: $('wall-fit').value,
  }, true);
}
function wallUpload(input) {
  const f = input.files[0];
  input.value = '';
  if (!f) return;
  if (!f.type.startsWith('image/')) { toast('⚠️ Envie uma imagem.'); return; }
  const img = new Image();
  const r = new FileReader();
  r.onload = () => { img.src = r.result; };
  img.onerror = () => toast('⚠️ Não deu para ler a imagem.');
  img.onload = () => {
    const sc = Math.min(1, 1280 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * sc));
    c.height = Math.max(1, Math.round(img.height * sc));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    setWallpaper({ img: c.toDataURL('image/jpeg', 0.82) }, true);
    renderWallInputs();
    toast('🖼️ Papel de parede aplicado!');
  };
  r.readAsDataURL(f);
}
function wallRemove() {
  try { localStorage.removeItem('zf-wallpaper'); } catch (e) {}
  applyWallpaper();
  renderWallInputs();
  toast('Papel de parede removido.');
}
// ═══════════ ÍCONE + NOME DO APP ═══════════
const APP_ICONS = [
  ['icons/icon-green.png', 'Verde'],
  ['icons/icon-blue.png', 'Azul'],
  ['icons/icon-purple.png', 'Roxo'],
  ['icons/icon-orange.png', 'Laranja'],
];
function getAppIcon() {
  try { return localStorage.getItem('zf-icon') || 'icons/icon-green.png'; } catch (e) { return 'icons/icon-green.png'; }
}
function renderIconChoices() {
  const cur = getAppIcon();
  $('icon-choices').innerHTML = APP_ICONS.map(([src, name]) =>
    `<button class="icon-choice${cur === src ? ' sel' : ''}" onclick="setAppIcon('${src}')" title="${name}"><img src="${src}" alt="${name}"></button>`).join('') +
    `<button class="icon-choice up" onclick="document.getElementById('icon-file').click()" title="Enviar minha">📤</button>`;
}
async function dataURLfromURL(url) {
  const r = await fetch(url);
  const b = await r.blob();
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(b);
  });
}
async function setAppIcon(src) {
  try { localStorage.setItem('zf-icon', src); } catch (e) {}
  applyAppIcon();
  renderIconChoices();
  if (window.zfAPI) {
    try {
      const durl = src.startsWith('data:') ? src : await dataURLfromURL(src);
      await window.zfAPI.setIcon(durl);
    } catch (e) {}
  }
  toast('📱 Ícone atualizado!');
}
async function resetAppIcon() {
  try { localStorage.removeItem('zf-icon'); } catch (e) {}
  applyAppIcon();
  renderIconChoices();
  if (window.zfAPI) { try { await window.zfAPI.resetIcon(); } catch (e) {} }
  toast('📱 Ícone padrão restaurado!');
}
function applyAppIcon() {
  const src = getAppIcon();
  let link = document.querySelector("link[rel='icon']");
  if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
  link.href = src;
}
function iconUpload(input) {
  const f = input.files[0];
  input.value = '';
  if (!f || !f.type.startsWith('image/')) { toast('⚠️ Envie uma imagem.'); return; }
  const img = new Image();
  const r = new FileReader();
  r.onload = () => { img.src = r.result; };
  r.onerror = () => toast('⚠️ Não deu para ler a imagem.');
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const sc = Math.max(256 / img.width, 256 / img.height);
    const w = img.width * sc, h = img.height * sc;
    c.getContext('2d').drawImage(img, (256 - w) / 2, (256 - h) / 2, w, h);
    setAppIcon(c.toDataURL('image/png'));
  };
  r.readAsDataURL(f);
}
async function saveAppTitle() {
  const t = $('theme-title').value.trim().slice(0, 60);
  try {
    if (t) localStorage.setItem('zf-title', t);
    else localStorage.removeItem('zf-title');
  } catch (e) {}
  applyTitle();
  if (window.zfAPI) { try { await window.zfAPI.setTitle(t); } catch (e) {} }
  toast(t ? `✏️ Nome: "${t}"` : '✏️ Nome padrão restaurado!');
}
function fileToDataURL(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('O arquivo precisa ser uma imagem.'));
    if (file.size > 10 * 1024 * 1024) return reject(new Error('Imagem muito grande (máx 10MB).'));
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target.result; };
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    img.onload = () => {
      let { width, height } = img;
      const scale = Math.min(1, maxSize / Math.max(width, height));
      width = Math.round(width * scale); height = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Formato de imagem não suportado.'));
    reader.readAsDataURL(file);
  });
}
function setAvatarEl(el, entity) {
  // entity: {photo, avatar, avatarColor}
  el.style.background = entity.avatarColor || '#25D366';
  if (entity.photo) {
    el.innerHTML = `<img src="${entity.photo}" alt="foto">`;
  } else {
    el.textContent = entity.avatar || '😀';
  }
}

// ---------- pickers ----------
function buildPickers() {
  const ap = $('avatar-picker');
  ap.innerHTML = '';
  AVATARS.forEach((a, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = a;
    if (i === 0) b.classList.add('sel');
    b.onclick = () => { regAvatar = a; ap.querySelectorAll('button').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); };
    ap.appendChild(b);
  });
  const cp = $('color-picker');
  cp.innerHTML = '';
  COLORS.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.style.background = c;
    if (i === 0) b.classList.add('sel');
    b.onclick = () => { regColor = c; cp.querySelectorAll('button').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); };
    cp.appendChild(b);
  });
  const eap = $('edit-avatar-picker');
  eap.innerHTML = '';
  AVATARS.forEach(a => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = a;
    b.onclick = () => { editAvatar = a; eap.querySelectorAll('button').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); updatePreview(); };
    eap.appendChild(b);
  });
  const ecp = $('edit-color-picker');
  ecp.innerHTML = '';
  COLORS.forEach(c => {
    const b = document.createElement('button');
    b.type = 'button'; b.style.background = c;
    b.onclick = () => { editColor = c; ecp.querySelectorAll('button').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); updatePreview(); };
    ecp.appendChild(b);
  });
  const ep = $('emoji-panel');
  ep.innerHTML = '';
  EMOJIS.forEach(e => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = e;
    b.onclick = () => {
      const inp = document.activeElement === $('img-caption') ? $('img-caption') : $('msg-input');
      inp.value += e; inp.focus();
    };
    ep.appendChild(b);
  });
}
function updatePreview() {
  setAvatarEl($('pv-avatar'), { photo: editPhotoRemoved ? null : editPhoto, avatar: editAvatar, avatarColor: editColor });
}

// ---------- foto: registro / edição ----------
async function onRegPhoto(input) {
  const f = input.files[0];
  if (!f) return;
  try {
    regPhoto = await fileToDataURL(f, 256, 0.82);
    setAvatarEl($('reg-photo-preview'), { photo: regPhoto, avatar: regAvatar, avatarColor: regColor });
    $('reg-photo-remove').classList.remove('hidden');
  } catch (e) { toast('⚠️ ' + e.message); input.value = ''; }
}
function clearRegPhoto() {
  regPhoto = null;
  $('reg-photo-input').value = '';
  setAvatarEl($('reg-photo-preview'), { photo: null, avatar: '😀', avatarColor: regColor });
  $('reg-photo-remove').classList.add('hidden');
}
async function onEditPhoto(input) {
  const f = input.files[0];
  if (!f) return;
  try {
    editPhoto = await fileToDataURL(f, 256, 0.82);
    editPhotoRemoved = false;
    updatePreview();
  } catch (e) { toast('⚠️ ' + e.message); input.value = ''; }
}
function removeEditPhoto() {
  editPhoto = null; editPhotoRemoved = true;
  $('edit-photo-input').value = '';
  updatePreview();
}

// ---------- verificação de disponibilidade (nome único!) ----------
let checkDeb = null;
function debouncedCheck() {
  clearTimeout(checkDeb);
  checkDeb = setTimeout(checkAvailability, 400);
}
async function checkAvailability() {
  const name = $('reg-name').value.trim();
  const username = $('reg-user').value.trim().replace('@','');
  const hn = $('reg-name-hint'), hu = $('reg-user-hint');
  hn.textContent = ''; hu.textContent = '';
  hn.className = 'hint'; hu.className = 'hint';
  if (name.length < 2 && username.length < 3) return;
  try {
    const q = new URLSearchParams();
    if (name.length >= 2) q.set('name', name);
    if (username.length >= 3) q.set('username', username);
    const data = await api('GET', '/api/users/check?' + q.toString());
    if (data.name !== undefined) {
      if (data.nameTaken) { hn.textContent = '⛔ Já existe uma conta com esse nome!'; hn.classList.add('bad'); }
      else { hn.textContent = '✅ Nome disponível!'; hn.classList.add('ok'); }
    }
    if (data.username !== undefined) {
      if (!data.usernameValid) { hu.textContent = 'Use 3-25 caracteres: letras, números, ponto e _'; hu.classList.add('bad'); }
      else if (data.usernameTaken) { hu.textContent = '⛔ Esse @usuário já está em uso!'; hu.classList.add('bad'); }
      else { hu.textContent = '✅ @usuário disponível!'; hu.classList.add('ok'); }
    }
  } catch (e) {}
}

// ---------- auth ----------
function switchTab(which) {
  const isLogin = which === 'login';
  $('tab-login').classList.toggle('active', isLogin);
  $('tab-register').classList.toggle('active', !isLogin);
  $('form-login').classList.toggle('hidden', !isLogin);
  $('form-register').classList.toggle('hidden', isLogin);
  $('auth-error').classList.add('hidden');
}
function authError(msg) {
  const e = $('auth-error');
  e.textContent = msg;
  e.classList.remove('hidden');
}
async function doLogin(ev) {
  ev.preventDefault();
  try {
    const data = await api('POST', '/api/login', {
      username: $('login-user').value, password: $('login-pass').value
    });
    enterApp(data.user);
  } catch (e) { authError(e.message); }
  return false;
}
async function doRegister(ev) {
  ev.preventDefault();
  const p1 = $('reg-pass').value, p2 = $('reg-pass2').value;
  if (p1 !== p2) { authError('As senhas não coincidem.'); return false; }
  try {
    const data = await api('POST', '/api/register', {
      name: $('reg-name').value,
      username: $('reg-user').value,
      password: p1,
      bio: $('reg-bio').value,
      avatar: regAvatar,
      avatarColor: regColor,
      photo: regPhoto
    });
    toast('🎉 Conta criada com sucesso!');
    enterApp(data.user);
  } catch (e) { authError(e.message); }
  return false;
}
async function doLogout() {
  try { await api('POST', '/api/logout'); } catch {}
  location.reload();
}

// ---------- entrada no app ----------
function enterApp(user) {
  loadBlocks();
  refreshStatus(true);
  ME = user;
  applyTheme();
  applyCRT();
  $('auth-screen').classList.add('hidden');
  $('app-screen').classList.remove('hidden');
  renderMe();
  connectSocket();
  pollSync();
  refreshFind('');
  loadStickers();
  startSessionWatch();
  startAutoSync();
}
// Se trocar de conta em outra aba (mesmo navegador divide o login),
// recarrega sozinho mostrando a conta certa — evita confusão na pesquisa
function startSessionWatch() {
  setInterval(async () => {
    if (!ME) return;
    try {
      const data = await api('GET', '/api/me');
      if (data.user && data.user.id !== ME.id) {
        toast('🔄 Você trocou de conta em outra aba. Recarregando...');
        setTimeout(() => location.reload(), 1500);
      }
    } catch (e) { /* ignora: pode ser só instabilidade momentânea */ }
  }, 10000);
}
function renderMe() {
  setAvatarEl($('me-avatar'), ME);
  $('me-name').textContent = ME.name;
  $('me-username').textContent = '@' + ME.username;
}

// ---------- socket ----------
function connectSocket() {
  socket = io();
  socket.on('connect', () => {
    socket.emit('auth', ME.id);
    setConnStatus('on');
    pollSync();
    pollChat();
  });
  socket.on('disconnect', () => setConnStatus('off'));
  socket.on('reconnect_attempt', () => setConnStatus('wait'));
  socket.on('reconnect', () => { setConnStatus('on'); pollSync(); });
  socket.on('online_users', (ids) => {
    onlineIds = new Set(ids.map(Number));
    renderLists();
    if (currentChat) updateChatHeader();
  });
  // qualquer novidade -> sincroniza tudo (o pollSync detecta e avisa com toast + som)
  socket.on('new_message', () => { pollChat(); pollSync(); });
  socket.on('new_group_message', ({ message }) => {
    if (message && message.sender_id === ME.id) { pollSync(); return; }
    pollChat(); pollSync();
  });
  socket.on('message_deleted', () => { pollChat(); pollSync(); });
  socket.on('message_edited', ({ message }) => {
    if (!message) return;
    const m = currentMessages.find(x => x.id === message.id);
    if (m) { m.content = message.content; m.edited = true; renderMessages(false); }
    else pollChat();
  });
  socket.on('poll_voted', ({ message }) => {
    if (!message) return;
    const m = currentMessages.find(x => x.id === message.id);
    if (m) { m.poll = message.poll; renderMessages(false); }
    else pollChat();
  });
  socket.on('message_pinned', ({ dm_with, group_id, pin }) => {
    if (!currentChat || !pin) return;
    if (dm_with && currentChat.kind === 'dm' && currentChat.user.id === dm_with) {
      currentPin = pin; renderPinBar(); renderMessages(false);
      toast('📌 Nova mensagem fixada!');
    }
    if (group_id && currentChat.kind === 'group' && currentChat.group.id === group_id) {
      currentPin = pin; renderPinBar(); renderMessages(false);
      toast('📌 Nova mensagem fixada!');
    }
  });
  socket.on('message_unpinned', ({ dm_with, group_id }) => {
    if (!currentChat) return;
    if ((dm_with && currentChat.kind === 'dm' && currentChat.user.id === dm_with) ||
        (group_id && currentChat.kind === 'group' && currentChat.group.id === group_id)) {
      currentPin = null; renderPinBar(); renderMessages(false);
    }
  });
  socket.on('message_reaction', () => { pollChat(); });
  socket.on('messages_read', () => {});
  // ---- chamadas ----
  socket.on('incoming_call', ({ from, sdp, callType, callId }) => {
    if (call) { socket.emit('call_busy', { to: from.id, callId }); return; }
    const fr = friends.find(f => f.id === from.id);
    call = { id: callId, peer: from, type: callType, dir: 'in', offer: sdp, answered: false };
    setAvatarEl($('inc-avatar'), from);
    $('inc-name').textContent = fr ? dname(fr) : from.name;
    $('inc-type').textContent = callType === 'video' ? '📹 Chamada de vídeo' : '📞 Chamada de voz';
    $('modal-incoming').classList.remove('hidden');
    startRing();
    beep(520);
    call.timeoutInt = setTimeout(() => {
      if (call && !call.answered) { toast('📵 Chamada perdida.'); cleanupCall(); }
    }, 45000);
  });
  socket.on('call_answer', async ({ sdp, callId }) => {
    if (!call || call.id !== callId || !call.pc) return;
    try { await call.pc.setRemoteDescription(new RTCSessionDescription(sdp)); } catch (e) {}
  });
  socket.on('call_ice', async ({ candidate, callId }) => {
    if (!call || call.id !== callId || !call.pc || !candidate) return;
    try { await call.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) {}
  });
  socket.on('call_reoffer', async ({ sdp, callId }) => {
    if (!call || call.id !== callId || !call.pc) return;
    try {
      await call.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const ans = await call.pc.createAnswer();
      await call.pc.setLocalDescription(ans);
      socket.emit('call_reanswer', { to: call.peer.id, sdp: ans, callId });
    } catch (e) {}
  });
  socket.on('call_reanswer', async ({ sdp, callId }) => {
    if (!call || call.id !== callId || !call.pc) return;
    try { await call.pc.setRemoteDescription(new RTCSessionDescription(sdp)); } catch (e) {}
  });
  socket.on('call_rejected', ({ callId }) => {
    if (!call || call.id !== callId) return;
    toast('📵 Chamada recusada.');
    logCall(false, 0, 'recusada');
    cleanupCall();
  });
  socket.on('call_cancelled', () => {
    if (call && !call.answered) { toast('📵 Chamador desligou.'); cleanupCall(); }
  });
  socket.on('call_ended', () => {
    if (!call) return;
    if (call.dir === 'out' && call.answered) logCall(true, callElapsed());
    toast('☎️ Chamada encerrada.');
    cleanupCall();
  });
  socket.on('call_busy', () => {
    if (!call) return;
    toast('📵 Está em outra chamada.');
    cleanupCall();
  });
  socket.on('call_offline', () => {
    if (!call) return;
    toast('⚪ A pessoa está offline.');
    cleanupCall();
  });
  socket.on('typing', ({ from }) => {
    if (currentChat && currentChat.kind === 'dm' && currentChat.user.id === from) {
      showTyping(`${dname(currentChat.user).split(' ')[0]} está digitando… ⌨️`);
    }
  });
  socket.on('stop_typing', () => $('typing-ind').classList.add('hidden'));
  socket.on('typing_group', ({ from, fromName, groupId }) => {
    if (currentChat && currentChat.kind === 'group' && currentChat.group.id === groupId && from !== ME.id) {
      showTyping(`${fromName.split(' ')[0]} está digitando… ⌨️`);
    }
  });
  socket.on('stop_typing_group', () => $('typing-ind').classList.add('hidden'));
  socket.on('friend_request', () => pollSync());
  socket.on('request_accepted', () => pollSync());
  socket.on('request_rejected', ({ by }) => {
    toast(`😕 ${by ? by.name : 'Alguém'} recusou seu pedido.`);
    pollSync();
  });
  socket.on('added_to_group', ({ group }) => {
    socket.emit('join_group', { groupId: group.id });
    toast(`👥 Você foi adicionado ao grupo "${group.name}"!`);
    beep(660);
    pollSync();
  });
  socket.on('role_changed', ({ groupName, role }) => {
    toast(role === 'admin' ? `⬆️ Você virou admin do grupo "${groupName}"!` : `Você não é mais admin do grupo "${groupName}".`);
    beep(660);
    pollSync();
  });
  socket.on('removed_from_group', ({ groupId, groupName }) => {
    toast(`Você foi removido do grupo "${groupName}".`);
    if (currentChat && currentChat.kind === 'group' && currentChat.group.id === groupId) closeChat();
    socket.emit('leave_group_room', { groupId });
    pollSync();
  });
  socket.on('group_deleted', ({ groupId }) => {
    if (currentChat && currentChat.kind === 'group' && currentChat.group.id === groupId) closeChat();
    closeModals();
    pollSync();
    toast('👥 Um grupo foi apagado.');
  });
  socket.on('group_updated', () => {
    pollSync();
    if (!$('modal-groupinfo').classList.contains('hidden') && groupInfoCache) {
      openGroupInfo(groupInfoCache.id, true);
    }
    if (currentChat && currentChat.kind === 'group') {
      const g = groups.find(x => x.id === currentChat.group.id);
      if (g) { currentChat.group = g; updateChatHeader(); }
    }
  });
}
function showTyping(text) {
  $('typing-ind').classList.remove('hidden');
  $('typing-ind').textContent = text;
  clearTimeout(peerTypingTimer);
  peerTypingTimer = setTimeout(() => $('typing-ind').classList.add('hidden'), 2500);
}

// ---------- carregamento ----------
async function refreshAll() {
  await Promise.all([refreshFriends(), loadGroups(), refreshRequests(), refreshFind('')]);
  refreshBadges();
}
async function refreshFriends(silent) {
  try {
    const data = await api('GET', '/api/friends');
    friends = data.friends;
    if (currentChat && currentChat.kind === 'dm') {
      const still = friends.find(f => f.id === currentChat.user.id);
      if (!still) closeChat();
      else currentChat.user = still;
    }
    renderLists();
    refreshBadges();
  } catch (e) { if (!silent) console.error(e); }
}
async function loadGroups(silent) {
  try {
    const data = await api('GET', '/api/groups');
    groups = data.groups;
    if (currentChat && currentChat.kind === 'group') {
      const still = groups.find(g => g.id === currentChat.group.id);
      if (!still) closeChat();
      else currentChat.group = still;
    }
    renderLists();
    refreshBadges();
  } catch (e) { if (!silent) console.error(e); }
}
async function refreshRequests() {
  try {
    const data = await api('GET', '/api/requests');
    requests = data;
    renderLists();
    refreshBadges();
  } catch (e) {}
}
async function refreshFind(q) {
  try {
    const data = await api('GET', '/api/users/search?q=' + encodeURIComponent(q || ''));
    findResults = data.users;
    renderSearchResults();
  } catch (e) {}
}
function zfAppName() { try { return localStorage.getItem('zf-title') || 'ZapFamily'; } catch (e) { return 'ZapFamily'; } }
function zfDocTitle(n) { const t = zfAppName(); return n > 0 ? `(${n}) ${t}` : `${t} — Rede Social estilo WhatsApp`; }
function applyTitle() { try { refreshBadges(); } catch (e) {} }
function refreshBadges() {
  const dmUnread = friends.reduce((s, f) => s + (f.unread || 0), 0);
  const gUnread = groups.reduce((s, g) => s + (g.unread || 0), 0);
  const bt = $('badge-total');
  bt.textContent = dmUnread;
  bt.classList.toggle('hidden', dmUnread === 0);
  const bg = $('badge-groups');
  bg.textContent = gUnread;
  bg.classList.toggle('hidden', gUnread === 0);
  const br = $('badge-req');
  br.textContent = requests.received.length;
  br.classList.toggle('hidden', requests.received.length === 0);
  updateTitle();
}

// ---------- atualização automática (sempre de olho em novidades!) ----------
let syncState = { reqIds: new Set(), dmUnread: {}, dmLast: {}, gUnread: {}, gLast: {}, friendIds: new Set(), firstSync: true };
let lastListSig = '';
let syncing = false;
function listSig(d) {
  return JSON.stringify({
    f: d.friends.map(f => [f.id, f.name, f.nickname, f.unread, f.last_preview, f.last_message ? f.last_message.id : 0]),
    g: d.groups.map(g => [g.id, g.name, g.unread, g.last_preview, g.member_count, g.last_message ? g.last_message.id : 0]),
    r: [d.requests.received.map(r => r.id), d.requests.sent.map(r => r.id)],
    o: (d.online || []).slice().sort((a, b) => a - b),
    tp: (d.topics || []).map(t => [t.id, t.name, t.color, t.items.map(i => i.kind + i.ref_id).join(',')])
  });
}
async function pollSync() {
  if (!ME || syncing || document.hidden) return;
  syncing = true;
  try {
    const d = await api('GET', '/api/sync');
    const prev = syncState;
    if (!prev.firstSync) {
      for (const r of d.requests.received) {
        if (!prev.reqIds.has(r.id) && r.user) {
          toast(`📩 ${r.user.name} (@${r.user.username}) te enviou um pedido de amizade!`);
          beep(660);
        }
      }
      for (const f of d.friends) {
        const lastId = f.last_message ? f.last_message.id : 0;
        if ((f.unread || 0) > (prev.dmUnread[f.id] || 0) && lastId !== prev.dmLast[f.id]) {
          if (currentChat && currentChat.kind === 'dm' && currentChat.user.id === f.id) {
            pollChat();
          } else {
            if (!isMuted('dm', f.id)) {
              toast(`💬 ${f.name}: ${String(f.last_preview || 'nova mensagem').slice(0, 60)}`);
              beep(880);
            }
          }
        }
        if (!prev.friendIds.has(f.id)) {
          toast(`🎉 Você e ${f.name} agora são amigos!`);
          beep(990);
        }
      }
      for (const g of d.groups) {
        const lastId = g.last_message ? g.last_message.id : 0;
        if ((g.unread || 0) > (prev.gUnread[g.id] || 0) && lastId !== prev.gLast[g.id]) {
          if (currentChat && currentChat.kind === 'group' && currentChat.group.id === g.id) {
            pollChat();
          } else {
            if (!isMuted('group', g.id)) {
              toast(`👥 ${g.name} — ${g.last_sender_name || ''}: ${String(g.last_preview || '').slice(0, 50)}`);
              beep(880);
            }
          }
        }
      }
    }
    friends = d.friends;
    groups = d.groups;
    requests = d.requests;
    topics = d.topics || [];
    onlineIds = new Set((d.online || []).map(Number));
    if (currentChat && currentChat.kind === 'dm') {
      const still = friends.find(f => f.id === currentChat.user.id);
      if (!still) closeChat(); else { currentChat.user = still; updateChatHeader(); }
    }
    if (currentChat && currentChat.kind === 'group') {
      const still = groups.find(g => g.id === currentChat.group.id);
      if (!still) closeChat(); else { currentChat.group = still; updateChatHeader(); }
    }
    syncState = {
      reqIds: new Set(d.requests.received.map(r => r.id)),
      dmUnread: Object.fromEntries(d.friends.map(f => [f.id, f.unread || 0])),
      dmLast: Object.fromEntries(d.friends.map(f => [f.id, f.last_message ? f.last_message.id : 0])),
      gUnread: Object.fromEntries(d.groups.map(g => [g.id, g.unread || 0])),
      gLast: Object.fromEntries(d.groups.map(g => [g.id, g.last_message ? g.last_message.id : 0])),
      friendIds: new Set(d.friends.map(f => f.id)),
      firstSync: false
    };
    renderTopicChips();
    const sig = listSig(d);
    if (sig !== lastListSig) { renderLists(); lastListSig = sig; }
    else if (currentChat) updateChatHeader();
    refreshBadges();
  } catch (e) { /* mantém último estado; tenta de novo no próximo ciclo */ }
  syncing = false;
}

// atualiza mensagens do chat aberto (só redesenha se algo mudou)
let pollingChat = false;
function msgSignature(list) {
  return list.map(m => m.id + ':' + m.type + ':' + (m.deleted ? 'X' : ((m.content || '') + ':' + (m.image ? 'I' : 'T') + ':' + (m.file_name || '') + ':' + (m.duration || 0) + ':' + (m.edited ? 'E' : '') + ':' + (m.poll ? m.poll.options.map(o => (o.votes || []).join(',')).join(';') : ''))) + ':' + JSON.stringify(m.reactions || {})).join('|');
}
async function pollChat() {
  if (!ME || !currentChat || pollingChat) return;
  pollingChat = true;
  try {
    if (currentChat.kind === 'dm') {
      const data = await api('GET', `/api/messages/${currentChat.user.id}`);
      updatePinFrom(data.pin);
      if (msgSignature(data.messages) !== msgSignature(currentMessages)) {
        const box = $('messages');
        const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 150;
        currentMessages = data.messages;
        renderMessages(nearBottom);
      }
    } else {
      const data = await api('GET', `/api/groups/${currentChat.group.id}/messages`);
      updatePinFrom(data.pin);
      if (msgSignature(data.messages) !== msgSignature(currentMessages)) {
        const box = $('messages');
        const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 150;
        currentMessages = data.messages;
        currentSenders = data.senders || {};
        renderMessages(nearBottom);
      }
    }
  } catch (e) {}
  pollingChat = false;
}
function startAutoSync() {
  setInterval(pollSync, 5000);
  setInterval(() => refreshStatus(true), 15000);
  setInterval(() => pollChat(), 3000);
  // ao voltar para a aba/janela, atualiza NA HORA (não espera os 5s)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { pollSync(); pollChat(); }
  });
  window.addEventListener('focus', () => { pollSync(); pollChat(); });
}
function manualSync() {
  pollSync();
  pollChat();
  toast('🔄 Atualizado!');
}

// ---------- abas e listas ----------
const TABS = ['chats','groups','friends','requests','status'];
function switchMainTab(tab) {
  mainTab = tab;
  TABS.forEach(t => {
    $('tb-' + t).classList.toggle('active', t === tab);
    $('list-' + t).classList.toggle('hidden', t !== tab);
  });
  $('topic-bar').classList.toggle('hidden', !(tab === 'chats' || tab === 'groups'));
  if (tab === 'status') refreshStatus();
  renderLists();
}
let searchDeb = null;
function onSearchInput(v) {
  clearTimeout(searchDeb);
  searchDeb = setTimeout(() => doSearch(v), 300);
}
function forceSearch() {
  clearTimeout(searchDeb);
  doSearch($('global-search').value);
}
function doSearch(v) {
  v = (v || '').trim();
  const box = $('search-results');
  if (v.length < 2) { findResults = []; box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.classList.remove('hidden');
  box.innerHTML = `<div class="empty-list">🔍 Pesquisando...</div>`;
  refreshFind(v);
}
function renderSearchResults() {
  const box = $('search-results');
  const q = $('global-search').value.trim();
  if (q.length < 2) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.classList.remove('hidden');
  if (!findResults.length) {
    box.innerHTML = `<div class="empty-list">😕 Ninguém com o nome exato "<b>${esc(q)}</b>".<br><small>Digite o nome ou @usuário certinho.</small></div>`;
    return;
  }
  box.innerHTML = findResults.map(u => {
    let btn = '';
    if (u.relation === 'friend') btn = `<button class="mini-btn ok" onclick="event.stopPropagation();openDM(${u.id})">💬</button>`;
    else if (u.relation === 'sent') btn = `<button class="mini-btn no" disabled>⏳</button>`;
    else if (u.relation === 'received') btn = `<button class="mini-btn ok" onclick="event.stopPropagation();switchMainTab('requests')">📩</button>`;
    else btn = `<button class="mini-btn add" onclick="event.stopPropagation();sendRequest(${u.id})">＋</button>`;
    return `<div class="item" onclick="openPeerById(${u.id})">
      ${avatarHTML(u, true)}
      <div class="item-body"><strong>${esc(u.name)}</strong><span>@${esc(u.username)} • ${onlineIds.has(u.id) ? '🟢 online' : esc(lastSeenLabel(u))}</span></div>
      ${btn}</div>`;
  }).join('');
}

function dname(u) { return (u && u.nickname) ? u.nickname : (u ? u.name : 'Alguém'); }
function fmtSize(b) {
  b = Number(b) || 0;
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}
function fmtDur(s) {
  s = Math.max(0, Math.round(Number(s) || 0));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function avatarHTML(u, showDot) {
  const inner = u.photo ? `<img src="${u.photo}" alt="">` : esc(u.avatar || '😀');
  const dot = showDot ? `<span class="dot${onlineIds.has(u.id) ? ' on' : ''}"></span>` : '';
  return `<div class="avatar" style="background:${esc(u.avatarColor || '#25D366')}">${inner}${dot}</div>`;
}

function inTopic(kind, refId, topicId) {
  const t = topics.find(x => x.id === topicId);
  return t && t.items.some(i => i.kind === kind && i.ref_id === refId);
}
function filterConvos(list, kind) {
  if (topicFilter === 'all') return list;
  if (topicFilter === 'unread') return list.filter(c => (c.unread || 0) > 0);
  return list.filter(c => inTopic(kind, c.id, topicFilter));
}
function topicUnread(tid) {
  const t = topics.find(x => x.id === tid);
  if (!t) return 0;
  let n = 0;
  for (const i of t.items) {
    if (i.kind === 'dm') { const f = friends.find(f => f.id === i.ref_id); if (f) n += f.unread || 0; }
    else { const g = groups.find(g => g.id === i.ref_id); if (g) n += g.unread || 0; }
  }
  return n;
}
function renderTopicChips() {
  const bar = $('topic-bar');
  if (!bar) return;
  const totalUnread = friends.reduce((s, f) => s + (f.unread || 0), 0) + groups.reduce((s, g) => s + (g.unread || 0), 0);
  let html = `<button class="chip${topicFilter === 'all' ? ' sel' : ''}" onclick="setTopicFilter('all')">💬 Todas</button>`;
  html += `<button class="chip${topicFilter === 'unread' ? ' sel' : ''}" onclick="setTopicFilter('unread')">📩 Não lidos${totalUnread ? ` <b>${totalUnread}</b>` : ''}</button>`;
  for (const t of topics) {
    const u = topicUnread(t.id);
    html += `<button class="chip${topicFilter === t.id ? ' sel' : ''}" onclick="setTopicFilter(${t.id})"><span class="chip-dot" style="background:${esc(t.color)}"></span>${esc(t.name)}${u ? ` <b>${u}</b>` : ''}</button>`;
  }
  html += `<button class="chip add" title="Novo tópico" onclick="createTopic()">＋</button>`;
  html += `<button class="chip add" title="Gerenciar tópicos" onclick="openTopicsModal()">⚙️</button>`;
  bar.innerHTML = html;
}
function setTopicFilter(f) { topicFilter = f; renderLists(); }
function renderLists() {
  renderTopicChips();
  // conversas 1-a-1
  const lc = $('list-chats');
  const shownDMs = filterConvos(friends, 'dm');
  if (!friends.length) {
    lc.innerHTML = `<div class="empty-list">Nenhuma conversa ainda.<br>🔍 pesquise o nome exato na busca acima!</div>`;
  } else if (!shownDMs.length) {
    lc.innerHTML = `<div class="empty-list">Nada por aqui neste filtro. 🔍<br>Adicione conversas a tópicos pelo perfil!</div>`;
  } else {
    lc.innerHTML = shownDMs.map(f => {
      const last = f.last_message;
      let preview = '<i>Sejam amigos! Diga oi 👋</i>';
      if (last) {
        const mine = last.sender_id === ME.id ? '✓✓ ' : '';
        preview = mine + esc(f.last_preview || '');
      }
      const time = last ? timeHM(last.created_at) : '';
      const active = currentChat && currentChat.kind === 'dm' && currentChat.user.id === f.id;
      return `<div class="item${active ? ' active' : ''}" onclick="openDM(${f.id})">
        ${avatarHTML(f, true)}
        <div class="item-body"><strong>${esc(dname(f))}${blockedIds.has(f.id) ? ' ⛔' : ''}${isMuted('dm', f.id) ? ' 🔇' : ''}</strong><span>${preview}</span></div>
        <div class="item-side"><span>${time}</span>${f.unread ? `<span class="unread">${f.unread}</span>` : ''}</div>
      </div>`;
    }).join('');
  }
  // grupos
  const lg = $('list-groups');
  let ghtml = `<button class="btn-primary new-group-btn" onclick="openCreateGroup()">＋ Criar novo grupo</button>`;
  const shownGroups = filterConvos(groups, 'group');
  if (!groups.length) {
    ghtml += `<div class="empty-list">Nenhum grupo ainda.<br>Crie um e chame seus amigos! 👥</div>`;
  } else if (!shownGroups.length) {
    ghtml += `<div class="empty-list">Nada por aqui neste filtro. 🔍</div>`;
  } else {
    ghtml += shownGroups.map(g => {
      const last = g.last_message;
      let preview = '<i>Grupo criado! Diga oi 👋</i>';
      if (last) {
        const who = last.sender_id === ME.id ? 'Você' : esc(g.last_sender_name || '');
        preview = `${who}: ${esc(g.last_preview || '')}`;
      }
      const time = last ? timeHM(last.created_at) : '';
      const active = currentChat && currentChat.kind === 'group' && currentChat.group.id === g.id;
      return `<div class="item${active ? ' active' : ''}" onclick="openGroup(${g.id})">
        ${avatarHTML(g, false)}
        <div class="item-body"><strong>${esc(g.name)}${isMuted('group', g.id) ? ' 🔇' : ''}</strong><span>${preview}</span></div>
        <div class="item-side"><span>${time}</span>${g.unread ? `<span class="unread">${g.unread}</span>` : ''}</div>
      </div>`;
    }).join('');
  }
  lg.innerHTML = ghtml;
  // amigos
  const lf = $('list-friends');
  if (!friends.length) {
    lf.innerHTML = `<div class="empty-list">Você ainda não tem amigos.<br>🔍 Busque pessoas acima!</div>`;
  } else {
    lf.innerHTML = friends.map(f => `
      <div class="item" onclick="openDM(${f.id})">
        ${avatarHTML(f, true)}
        <div class="item-body"><strong>${esc(dname(f))}${blockedIds.has(f.id) ? ' ⛔' : ''}${isMuted('dm', f.id) ? ' 🔇' : ''}</strong><span>@${esc(f.username)} • ${onlineIds.has(f.id) ? '🟢 online' : '⚪ ' + esc(lastSeenLabel(f))}</span></div>
        <button class="mini-btn add" onclick="event.stopPropagation();openPeerById(${f.id})">👤</button>
      </div>`).join('');
  }
  // pedidos
  const lr = $('list-requests');
  let html = '';
  if (requests.received.length) {
    html += `<div class="empty-list" style="padding:12px">📥 <b>Recebidos (${requests.received.length})</b></div>`;
    html += requests.received.map(r => `
      <div class="item">
        ${avatarHTML(r.user, true)}
        <div class="item-body"><strong>${esc(r.user.name)}</strong><span>@${esc(r.user.username)}</span></div>
        <div><button class="mini-btn ok" onclick="respondRequest(${r.id},'accept')">✔</button><button class="mini-btn no" onclick="respondRequest(${r.id},'reject')">✖</button></div>
      </div>`).join('');
  }
  if (requests.sent.length) {
    html += `<div class="empty-list" style="padding:12px">📤 <b>Enviados (${requests.sent.length})</b></div>`;
    html += requests.sent.map(r => `
      <div class="item">
        ${avatarHTML(r.user, true)}
        <div class="item-body"><strong>${esc(r.user.name)}</strong><span>@${esc(r.user.username)} • aguardando…</span></div>
        <button class="mini-btn no" onclick="cancelRequest(${r.id})">Cancelar</button>
      </div>`).join('');
  }
  if (!html) html = `<div class="empty-list">Nenhum pedido por aqui.<br>Que tal fazer novas amizades? 🤝</div>`;
  lr.innerHTML = html;  // status 24h
  renderStatusList();
}

// ---------- amizades ----------
async function sendRequest(userId) {
  try {
    await api('POST', '/api/friends/request', { user_id: userId });
    toast('📩 Pedido de amizade enviado!');
    refreshRequests();
    refreshFind($('global-search').value);
  } catch (e) { toast('⚠️ ' + e.message); }
}
async function respondRequest(id, action) {
  try {
    await api('POST', '/api/friends/respond', { request_id: id, action });
    toast(action === 'accept' ? '🎉 Amizade aceita!' : 'Pedido recusado.');
    refreshAll();
  } catch (e) { toast('⚠️ ' + e.message); }
}
async function cancelRequest(id) {
  try {
    await api('DELETE', `/api/requests/${id}`);
    toast('Pedido cancelado.');
    refreshRequests();
    refreshFind($('global-search').value);
  } catch (e) { toast('⚠️ ' + e.message); }
}
async function removeFriend() {
  if (!currentChat || currentChat.kind !== 'dm') return;
  const u = currentChat.user;
  if (!confirm(`Remover ${u.name} dos amigos?`)) return;
  try {
    await api('DELETE', `/api/friends/${u.id}`);
    toast('Amizade removida.');
    closeChat();
    refreshFriends();
  } catch (e) { toast('⚠️ ' + e.message); }
}

// ---------- abrir chats ----------
function showChatShell() {
  $('chat-empty').classList.add('hidden');
  $('chat-open').classList.remove('hidden');
  $('chat-area').classList.add('show-mobile');
  $('sidebar').classList.add('hidden-mobile');
}
async function openDM(friendId) {
  const f = friends.find(x => x.id === friendId);
  if (!f) { toast('Adicione como amigo primeiro 🤝'); return; }
  currentChat = { kind: 'dm', user: f };
  if (blockedIds.has(friendId)) toast('⛔ Você bloqueou esta pessoa. Desbloqueie no perfil (ℹ️) para conversar.');
  currentSenders = {};
  cancelImage();
  replyDraft = null; renderReplyBar();
  showChatShell();
  $('chat-delete-btn').style.display = '';
  $('call-voice-btn').style.display = '';
  $('call-video-btn').style.display = '';
  updateChatHeader();
  $('messages').innerHTML = '<div class="empty-list">Carregando mensagens…</div>';
  try {
    const data = await api('GET', `/api/messages/${friendId}`);
    currentMessages = data.messages;
    currentPin = data.pin || null; renderPinBar();
    renderMessages(true);
    refreshFriends(true);
  } catch (e) {
    $('messages').innerHTML = `<div class="empty-list">⚠️ ${esc(e.message)}</div>`;
  }
  renderLists();
}
async function openGroup(groupId) {
  const g = groups.find(x => x.id === groupId);
  if (!g) { toast('Grupo não encontrado.'); return; }
  currentChat = { kind: 'group', group: g };
  cancelImage();
  showChatShell();
  $('chat-delete-btn').style.display = 'none';
  $('call-voice-btn').style.display = 'none';
  $('call-video-btn').style.display = 'none';
  updateChatHeader();
  $('messages').innerHTML = '<div class="empty-list">Carregando mensagens…</div>';
  try {
    const data = await api('GET', `/api/groups/${groupId}/messages`);
    currentMessages = data.messages;
    currentSenders = data.senders || {};
    currentPin = data.pin || null; renderPinBar();
    renderMessages(true);
    loadGroups(true);
  } catch (e) {
    $('messages').innerHTML = `<div class="empty-list">⚠️ ${esc(e.message)}</div>`;
  }
  renderLists();
}
function closeChat() {
  currentChat = null;
  currentMessages = [];
  currentSenders = {};
  currentPin = null;
  cancelImage();
  replyDraft = null; renderReplyBar(); renderPinBar();
  $('chat-open').classList.add('hidden');
  $('chat-empty').classList.remove('hidden');
  $('chat-area').classList.remove('show-mobile');
  $('sidebar').classList.remove('hidden-mobile');
  renderLists();
}
function updateChatHeader() {
  if (!currentChat) return;
  if (currentChat.kind === 'dm') {
    const u = currentChat.user;
    setAvatarEl($('chat-avatar'), u);
    $('chat-name').textContent = dname(u);
    $('chat-status').textContent = onlineIds.has(u.id) ? '🟢 online agora' : lastSeenLabel(u);
  } else {
    const g = currentChat.group;
    setAvatarEl($('chat-avatar'), g);
    $('chat-name').textContent = g.name;
    const names = (g.members_preview || []).map(m => m.name.split(' ')[0]).join(', ');
    $('chat-status').textContent = `👥 ${g.member_count} membros • ${names}`;
  }
}
function openChatInfo() {
  if (!currentChat) return;
  if (currentChat.kind === 'dm') openPeerById(currentChat.user.id);
  else openGroupInfo(currentChat.group.id);
}

// ---------- render mensagens ----------
function renderMessages(scroll) {
  if (selMsgs.length) { selMsgs = []; const _sb = $('sel-bar'); if (_sb) _sb.classList.add('hidden'); const _mb = $('messages'); if (_mb) _mb.classList.remove('selecting'); }
  const box = $('messages');
  bindSelPress();
  if (!currentMessages.length) {
    box.innerHTML = `<div class="empty-list">Nenhuma mensagem ainda.<br>Seja o primeiro a dizer <b>oi! 👋</b></div>`;
    return;
  }
  const isGroup = currentChat && currentChat.kind === 'group';
  let html = '', lastDay = '';
  for (const m of currentMessages) {
    const day = dayLabel(m.created_at);
    if (day !== lastDay) { html += `<div class="day-divider">${day}</div>`; lastDay = day; }
    const mine = m.sender_id === ME.id;
    if (m.type === 'call' && !m.deleted) {
      html += `<div class="day-divider call-log">📞 ${esc(m.content.replace(/^[📞📹]\s*/, ''))} • ${timeHM(m.created_at)}</div>`;
      continue;
    }
    if (m.deleted) continue;
    let senderLine = '';
    if (isGroup && !mine) {
      const s = currentSenders[m.sender_id];
      senderLine = `<span class="sender-name">${esc(s ? dname(s) : 'Alguém')}</span>`;
    }
    let body = '';
    if ((m.type === 'image' || m.type === 'sticker') && m.image) {
      const cls = m.type === 'sticker' ? 'msg-img sticker' : 'msg-img';
      body += `<img class="${cls}" src="${m.image}" onclick="event.stopPropagation();openLightbox('${'msgimg' + m.id}')" id="msgimg${m.id}" alt="">`;
      if (m.content) body += `<span class="msg-caption">${esc(m.content)}</span>`;
    } else if ((m.type === 'voice' || m.type === 'audio') && m.image) {
      const label = m.type === 'voice' ? '🎤' : '🎵';
      body += `<div class="audio-msg"><span>${label}</span><audio controls preload="metadata" src="${m.image}"></audio></div>`;
      if (m.type === 'voice' && m.duration) body += `<span class="msg-caption muted small">${fmtDur(m.duration)}</span>`;
      else if (m.file_name) body += `<span class="msg-caption">${esc(m.file_name)}</span>`;
      if (m.content) body += `<span class="msg-caption">${esc(m.content)}</span>`;
    } else if (m.type === 'video' && m.image) {
      body += `<video class="msg-video" controls preload="metadata" src="${m.image}"></video>`;
      if (m.content) body += `<span class="msg-caption">${esc(m.content)}</span>`;
    } else if (m.type === 'file' && m.image) {
      body += `<a class="file-card" href="${m.image}" download="${esc(m.file_name || 'arquivo')}" onclick="event.stopPropagation()"><span class="file-ico">📎</span><span class="file-meta"><b>${esc(m.file_name || 'Arquivo')}</b><small>${fmtSize(m.file_size)}${m.mime ? ' • ' + esc((m.mime.split('/')[1] || m.mime).slice(0, 12)) : ''}</small></span><span class="file-dl">⬇️</span></a>`;
      if (m.content) body += `<span class="msg-caption">${esc(m.content)}</span>`;
    } else if (m.type === 'poll' && m.poll) {
      body += pollHTML(m);
    } else {
      body += esc(m.content);
    }
    const ticks = mine ? (m.read ? ' ✓✓' : ' ✓') : '';
    // reações
    let reacs = '';
    const entries = Object.entries(m.reactions || {});
    if (entries.length) {
      reacs = '<div class="reactions">' + entries.map(([e, ids]) =>
        `<span class="reaction-chip${ids.includes(ME.id) ? ' mine' : ''}" onclick="event.stopPropagation();reactToMessage(${m.id},'${e}')">${e} ${ids.length}</span>`
      ).join('') + '</div>';
    }
    const delBtn = `<button title="Apagar" onclick="event.stopPropagation();askDelete(${m.id},${mine})">🗑️</button>`;
    const saveStBtn = (m.type === 'sticker' && !mine) ? `<button title="Salvar figurinha" onclick="event.stopPropagation();saveStickerFromMessage(${m.id})">⭐</button>` : '';
    const canEdit = mine && !m.deleted && ['text','image','video','audio','file'].includes(m.type) && (Date.now() - new Date(m.created_at).getTime() < 15*60*1000);
    const editBtn = canEdit ? '<button title="Editar" onclick="event.stopPropagation();openEditModal(' + m.id + ')">✐️</button>' : '';
    const isPinned = currentPin && currentPin.id === m.id;
    const fwdLabel = m.forwarded ? '<span class="fwd-label">➡️ Encaminhada</span>' : '';
    let quote = '';
    if (m.reply) quote = `<div class="reply-quote" onclick="event.stopPropagation();jumpToMessage(${m.reply.id})"><b>${esc(m.reply.sender_id === ME.id ? 'Você' : m.reply.sender_name)}</b><span>${esc(m.reply.text)}</span></div>`;
    html += `<div class="msg ${mine ? 'me' : 'them'}${m.type === 'sticker' ? ' sticker-msg' : ''}" id="msg${m.id}" onclick="msgTap(event,${m.id})">${senderLine}${fwdLabel}${quote}${body}<span class="time">${timeHM(m.created_at)}${ticks}${isPinned ? ' 📌' : ''}${m.edited ? ' • editada' : ''}</span>${reacs}
      <div class="actions" onclick="event.stopPropagation()">
        <button title="Reagir" onclick="toggleReactBar(${m.id})">🙂</button>${editBtn}<button title="Responder" onclick="event.stopPropagation();setReply(${m.id})">↩️</button><button title="Encaminhar" onclick="event.stopPropagation();openForwardModal(${m.id})">➡️</button><button title="${isPinned ? 'Desafixar' : 'Fixar'}" onclick="event.stopPropagation();togglePin(${m.id})">📌</button>${saveStBtn}${delBtn}
      </div>
      <div class="quick-react hidden" id="qr${m.id}">` +
        QUICK_REACT.map(e => `<button onclick="event.stopPropagation();reactToMessage(${m.id},'${e}')">${e}</button>`).join('') +
      `</div></div>`;
  }
  box.innerHTML = html;
  if (scroll) box.scrollTop = box.scrollHeight;
}
function toggleReactBar(id) {
  document.querySelectorAll('.quick-react').forEach(el => { if (el.id !== 'qr' + id) el.classList.add('hidden'); });
  const el = $('qr' + id);
  if (el) el.classList.toggle('hidden');
}
async function reactToMessage(id, emoji) {
  try {
    const data = await api('POST', `/api/messages/${id}/react`, { emoji });
    const m = currentMessages.find(x => x.id === id);
    if (m) { m.reactions = data.reactions; renderMessages(false); }
    const qr = $('qr' + id);
    if (qr) qr.classList.add('hidden');
  } catch (e) { toast('⚠️ ' + e.message); }
}
// ═══════════ ENQUETES ═══════════
function pollHTML(m) {
  const p = m.poll;
  const total = p.options.reduce((s, o) => s + (o.votes || []).length, 0);
  const opts = p.options.map((o, i) => {
    const v = (o.votes || []).length;
    const pct = total ? Math.round((v / total) * 100) : 0;
    const mineV = (o.votes || []).includes(ME.id);
    return `<button class="poll-opt${mineV ? ' voted' : ''}" onclick="event.stopPropagation();votePoll(${m.id},${i})">`
      + `<span class="poll-fill" style="width:${pct}%"></span>`
      + `<span class="poll-label">${mineV ? '✅ ' : ''}${esc(o.text)}</span>`
      + `<span class="poll-pct">${pct}%</span></button>`;
  }).join('');
  return `<div class="poll"><b>📊 ${esc(p.question)}</b>${opts}<small>${total} voto(s) • toque para votar</small></div>`;
}
async function votePoll(id, idx) {
  const m = currentMessages.find(x => x.id === id);
  try {
    const data = await api('POST', `/api/messages/${id}/vote`, { option: idx });
    if (m) { m.poll = data.poll; renderMessages(false); }
  } catch (e) { toast('⚠️ ' + e.message); }
}
function openPollModal() {
  $('attach-menu').classList.add('hidden');
  if (!currentChat) { toast('Abra uma conversa primeiro.'); return; }
  $('poll-q').value = '';
  $('poll-opts').innerHTML = '';
  pollAddOpt(); pollAddOpt();
  $('modal-poll').classList.remove('hidden');
}
function pollAddOpt() {
  const box = $('poll-opts');
  if (box.children.length >= 8) { toast('Máximo 8 opções.'); return; }
  const inp = document.createElement('input');
  inp.type = 'text'; inp.maxLength = 80;
  inp.placeholder = `Opção ${box.children.length + 1}`;
  inp.className = 'full-input poll-opt-in';
  box.appendChild(inp);
  inp.focus();
}
async function sendPoll() {
  const q = $('poll-q').value.trim();
  const opts = [...document.querySelectorAll('#poll-opts input')].map(i => i.value.trim()).filter(Boolean);
  if (!q) { toast('⚠️ Escreva a pergunta.'); return; }
  if (opts.length < 2) { toast('⚠️ Mínimo 2 opções.'); return; }
  try {
    let msg;
    const body = { content: '', type: 'poll', poll: { question: q, options: opts }, reply_to: replyDraft ? replyDraft.id : null };
    if (currentChat.kind === 'dm') {
      const data = await api('POST', '/api/messages', { ...body, receiver_id: currentChat.user.id });
      msg = data.message;
    } else {
      const data = await api('POST', `/api/groups/${currentChat.group.id}/messages`, body);
      msg = data.message;
      currentSenders[ME.id] = ME;
    }
    currentMessages.push(msg);
    replyDraft = null; renderReplyBar();
    renderMessages(true);
    refreshFriends(true); loadGroups(true);
    $('modal-poll').classList.add('hidden');
    toast('📊 Enquete enviada!');
  } catch (e) { toast('⚠️ ' + e.message); }
}
// ═══════════ EDITAR MENSAGEM ═══════════
let editMsgId = null;
function openEditModal(id) {
  const m = currentMessages.find(x => x.id === id);
  if (!m) return;
  editMsgId = id;
  $('editmsg-text').value = m.content || '';
  $('editmsg-hint').textContent = m.type === 'text' ? 'Editando mensagem (só vale até 15 min após enviar).' : 'Editando legenda.';
  $('modal-editmsg').classList.remove('hidden');
  $('editmsg-text').focus();
}
async function saveEdit() {
  const t = $('editmsg-text').value.trim();
  if (!t) { toast('⚠️ Escreva algo.'); return; }
  try {
    const data = await api('PUT', `/api/messages/${editMsgId}`, { content: t });
    const m = currentMessages.find(x => x.id === editMsgId);
    if (m) { m.content = data.message.content; m.edited = true; renderMessages(false); }
    $('modal-editmsg').classList.add('hidden');
    refreshFriends(true); loadGroups(true);
    toast('✏️ Mensagem editada!');
  } catch (e) { toast('⚠️ ' + e.message); }
}
// ═══════════ SILENCIAR ═══════════
function loadMutes() {
  try { return JSON.parse(localStorage.getItem('zf-mutes') || '{"dm":[],"group":[]}'); }
  catch (e) { return { dm: [], group: [] }; }
}
function saveMutes(m) { try { localStorage.setItem('zf-mutes', JSON.stringify(m)); } catch (e) {} }
function isMuted(kind, id) {
  const m = loadMutes();
  return (m[kind] || []).includes(id);
}
function toggleMute(kind, id) {
  const m = loadMutes();
  m[kind] = m[kind] || [];
  const i = m[kind].indexOf(id);
  if (i >= 0) { m[kind].splice(i, 1); toast('🔊 Som ativado!'); }
  else { m[kind].push(id); toast('🔇 Conversa silenciada.'); }
  saveMutes(m);
  renderLists();
  if (typeof peerCache !== 'undefined' && peerCache && kind === 'dm' && peerCache.id === id && !$('modal-peer').classList.contains('hidden')) openPeerById(id);
  if (typeof groupInfoCache !== 'undefined' && groupInfoCache && kind === 'group' && groupInfoCache.id === id) {
    const b = $('gi-mute-btn');
    if (b) b.textContent = isMuted('group', id) ? '🔊 Ativar som' : '🔇 Silenciar';
  }
}
// ═══════════ STATUS 24H ═══════════
let statusData = { mine: [], friends: [] };
let stView = null, stTimer = null, statusAddKind = 'image';
async function refreshStatus(silent) {
  if (!ME) return;
  try {
    const data = await api('GET', '/api/status');
    statusData = data;
    const unviewed = (data.friends || []).some(f => (f.items || []).some(i => !i.viewed));
    const b = $('badge-status');
    if (b) b.classList.toggle('hidden', !unviewed);
    if (mainTab === 'status') renderStatusList();
  } catch (e) { if (!silent) toast('⚠️ ' + e.message); }
}
function statusTimeAgo(iso) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'agora';
  if (m < 60) return m + 'min';
  return Math.round(m / 60) + 'h';
}
function renderStatusList() {
  const box = $('list-status');
  if (!box) return;
  const mine = statusData.mine || [];
  let html = `<div class="item" onclick="${mine.length ? "openStatusViewer('mine',0)" : 'openStatusAdd()'}">`
    + `<div class="avatar ${mine.length ? 'ring-seen' : ''}">${mine.length ? '⭕' : '＋'}</div>`
    + `<div class="item-body"><strong>Meu status</strong><span>${mine.length ? mine.length + ' atualização(ões) — ver' : 'Toque para adicionar'}</span></div>`
    + `<button class="mini-btn add" onclick="event.stopPropagation();openStatusAdd()">＋</button></div>`
    + `<h4 class="status-h">⭕ Atualizações recentes</h4>`;
  const fr = [...(statusData.friends || [])].sort((a, b) => {
    const au = a.items.some(i => !i.viewed) ? 0 : 1, bu = b.items.some(i => !i.viewed) ? 0 : 1;
    return au - bu;
  });
  if (!fr.length) html += `<div class="empty-list">Nenhum status de amigos.<br>Quando postarem, aparece aqui! ⭕</div>`;
  html += fr.map(f => {
    const un = f.items.some(i => !i.viewed);
    const last = f.items[f.items.length - 1];
    return `<div class="item" onclick="openStatusViewer(${f.user.id},0)">`
      + `<div class="avatar ${un ? 'ring-new' : 'ring-seen'}" style="background:${esc(f.user.avatarColor || '#25D366')}">${f.user.photo ? `<img src="${f.user.photo}" alt="">` : esc(f.user.avatar || '😀')}</div>`
      + `<div class="item-body"><strong>${esc(dname(f.user))}</strong><span>${f.items.length} • ${statusTimeAgo(last.created_at)}</span></div></div>`;
  }).join('');
  box.innerHTML = html;
}
async function openStatusViewer(who, idx) {
  const items = who === 'mine' ? statusData.mine : (((statusData.friends || []).find(f => f.user.id === who) || {}).items || []);
  if (!items.length) return;
  stView = { who, idx: Math.max(0, Math.min(idx, items.length - 1)) };
  $('modal-statusview').classList.remove('hidden');
  await showStatusItem();
}
function stViewItems() {
  return stView.who === 'mine' ? statusData.mine : (((statusData.friends || []).find(f => f.user.id === stView.who) || {}).items || []);
}
async function showStatusItem() {
  clearTimeout(stTimer);
  const items = stViewItems();
  const lite = items[stView.idx];
  if (!lite) { closeStatusViewer(); return; }
  $('stv-body').innerHTML = '<div class="empty-list">Carregando…</div>';
  try {
    const data = await api('GET', '/api/status/' + lite.id);
    const st = data.status;
    lite.viewed = true;
    const own = stView.who === 'mine';
    const u = own ? ME : (((statusData.friends || []).find(f => f.user.id === stView.who) || {}).user || {});
    $('stv-name').textContent = own ? 'Meu status' : dname(u);
    $('stv-time').textContent = statusTimeAgo(st.created_at);
    setAvatarEl($('stv-avatar'), own ? ME : u);
    let body = '';
    if (st.kind === 'text') body = `<div class="stv-text" style="background:${esc(st.bgcolor)}">${esc(st.text)}</div>`;
    else if (st.kind === 'video') body = `<video class="stv-media" src="${st.image}" controls autoplay playsinline></video>`;
    else body = `<img class="stv-media" src="${st.image}" alt="">`;
    if (st.caption) body += `<div class="stv-caption">${esc(st.caption)}</div>`;
    $('stv-body').innerHTML = body;
    $('stv-count').textContent = `${stView.idx + 1}/${items.length}`;
    $('stv-views').classList.toggle('hidden', !own);
    $('stv-reply-row').classList.toggle('hidden', own);
    $('stv-del').classList.toggle('hidden', !own);
    if (own) {
      const vs = st.viewers || [];
      $('stv-views').innerHTML = `👁️ ${vs.length} visualização(ões)` + (vs.length ? ': ' + vs.map(v => esc(v.name)).join(', ') : '');
    }
    renderStatusList();
    const unviewed = (statusData.friends || []).some(f => (f.items || []).some(i => !i.viewed));
    const b = $('badge-status');
    if (b) b.classList.toggle('hidden', !unviewed);
    if (st.kind !== 'video') stTimer = setTimeout(() => statusNav(1), 6000);
  } catch (e) { toast('⚠️ ' + e.message); closeStatusViewer(); }
}
function statusNav(d) {
  if (!stView) return;
  const n = stView.idx + d;
  if (n < 0 || n >= stViewItems().length) { closeStatusViewer(); return; }
  stView.idx = n;
  showStatusItem();
}
function closeStatusViewer() { clearTimeout(stTimer); stView = null; $('modal-statusview').classList.add('hidden'); }
async function deleteStatus() {
  if (!stView || stView.who !== 'mine') return;
  const lite = statusData.mine[stView.idx];
  if (!lite || !confirm('Apagar este status?')) return;
  try {
    await api('DELETE', '/api/status/' + lite.id);
    await refreshStatus(true);
    closeStatusViewer();
    toast('Status apagado.');
  } catch (e) { toast('⚠️ ' + e.message); }
}
function statusReply() {
  if (!stView || stView.who === 'mine') return;
  const t = $('stv-reply').value.trim();
  if (!t) { toast('Escreva a resposta.'); return; }
  const uid = stView.who;
  $('stv-reply').value = '';
  closeStatusViewer();
  switchMainTab('chats');
  openDM(uid).then(() => { $('msg-input').value = t; $('msg-input').focus(); });
}
function openStatusAdd() {
  statusAddKind = 'image';
  $('status-text').value = '';
  $('status-caption').value = '';
  $('status-file').value = '';
  $('status-preview').innerHTML = '';
  statusAddTab('image');
  $('modal-statusadd').classList.remove('hidden');
}
function statusAddTab(kind) {
  statusAddKind = kind;
  ['image', 'video', 'text'].forEach(k => $('stab-' + k).classList.toggle('on', k === kind));
  $('status-file-row').classList.toggle('hidden', kind === 'text');
  $('status-text-row').classList.toggle('hidden', kind !== 'text');
  $('status-file').accept = kind === 'video' ? 'video/*' : 'image/*';
}
function statusFilePreview(input) {
  const f = input.files[0];
  if (!f) return;
  const url = URL.createObjectURL(f);
  $('status-preview').innerHTML = statusAddKind === 'video'
    ? `<video src="${url}" controls style="max-width:100%;border-radius:10px"></video>`
    : `<img src="${url}" style="max-width:100%;border-radius:10px" alt="">`;
}
async function sendStatus() {
  try {
    if (statusAddKind === 'text') {
      const text = $('status-text').value.trim();
      if (!text) { toast('⚠️ Escreva algo.'); return; }
      const bg = document.querySelector('input[name="status-bg"]:checked');
      await api('POST', '/api/status', { kind: 'text', text, bgcolor: bg ? bg.value : '#075E54' });
    } else {
      const f = $('status-file').files[0];
      if (!f) { toast('⚠️ Escolha o arquivo.'); return; }
      const maxMB = statusAddKind === 'video' ? 9 : 2;
      if (f.size > maxMB * 1024 * 1024) { toast(`⚠️ Arquivo muito grande (máx ${maxMB}MB).`); return; }
      const durl = await fileToDataURLRaw(f, maxMB);
      await api('POST', '/api/status', { kind: statusAddKind, image: durl, caption: $('status-caption').value.trim() });
    }
    $('modal-statusadd').classList.add('hidden');
    toast('⭕ Status publicado!');
    refreshStatus(true);
  } catch (e) { toast('⚠️ ' + e.message); }
}
// ═══════════ RESPONDER / ENCAMINHAR / FIXAR ═══════════
let replyDraft = null, currentPin = null, forwardId = null, forwardIds = null;
function msgPreview(m) {
  if (!m) return '';
  if (m.deleted) return '🚫 Mensagem apagada';
  if (m.type === 'image') return '📷 Foto';
  if (m.type === 'sticker') return '⭐ Figurinha';
  if (m.type === 'voice') return '🎤 Áudio';
  if (m.type === 'audio') return '🎵 ' + (m.file_name || 'Áudio');
  if (m.type === 'video') return '🎬 Vídeo';
  if (m.type === 'file') return '📎 ' + (m.file_name || 'Arquivo');
  if (m.type === 'poll') return '📊 ' + ((m.poll && m.poll.question) || 'Enquete');
  if (m.type === 'call') return m.content || '📞 Chamada';
  return m.content || '';
}
function replySenderName(m) {
  if (m.sender_id === ME.id) return 'Você';
  if (currentChat && currentChat.kind === 'group') {
    const s = currentSenders[m.sender_id];
    return s ? dname(s) : 'Alguém';
  }
  return currentChat ? dname(currentChat.user) : 'Alguém';
}
function setReply(id) {
  const m = currentMessages.find(x => x.id === id);
  if (!m) return;
  replyDraft = { id: m.id, sender: replySenderName(m), text: msgPreview(m).slice(0, 120) };
  renderReplyBar();
  $('msg-input').focus();
}
function cancelReply() { replyDraft = null; renderReplyBar(); }
function renderReplyBar() {
  const bar = $('reply-bar');
  if (!replyDraft) { bar.classList.add('hidden'); return; }
  $('reply-text').innerHTML = `<b>↩️ ${esc(replyDraft.sender)}</b><span>${esc(replyDraft.text)}</span>`;
  bar.classList.remove('hidden');
}
function jumpToMessage(id) {
  const el = $('msg' + id);
  if (!el) { toast('Mensagem não encontrada.'); return; }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('flash');
  setTimeout(() => el.classList.add('flash'), 60);
  setTimeout(() => { const e2 = $('msg' + id); if (e2) e2.classList.remove('flash'); }, 1900);
}
// ---- fixar ----
function updatePinFrom(pin) {
  const a = pin ? pin.id : 0, b = currentPin ? currentPin.id : 0;
  if (a !== b) { currentPin = pin || null; renderPinBar(); renderMessages(false); }
}
async function togglePin(id) {
  if (!currentChat) return;
  const base = currentChat.kind === 'dm' ? `/api/pins/dm/${currentChat.user.id}` : `/api/pins/group/${currentChat.group.id}`;
  try {
    if (currentPin && currentPin.id === id) {
      await api('DELETE', base);
      currentPin = null;
      toast('Mensagem desafixada.');
    } else {
      const data = await api('POST', base, { message_id: id });
      currentPin = data.pin;
      toast('📌 Mensagem fixada!');
    }
    renderPinBar();
    renderMessages(false);
  } catch (e) { toast('⚠️ ' + e.message); }
}
function unpinCurrent() { if (currentPin) togglePin(currentPin.id); }
function renderPinBar() {
  const bar = $('pinned-bar');
  if (!currentPin || !currentChat) { bar.classList.add('hidden'); return; }
  let who = 'Você';
  if (currentPin.sender_id !== ME.id) {
    if (currentChat.kind === 'group') {
      const s = currentSenders[currentPin.sender_id];
      who = s ? dname(s) : 'Alguém';
    } else who = dname(currentChat.user);
  }
  $('pinned-text').innerHTML = `<b>📌 ${esc(who)}</b><span>${esc(msgPreview(currentPin).slice(0, 120))}</span>`;
  bar.classList.remove('hidden');
}
// ---- encaminhar ----
// ============ SELEÇÃO DE MENSAGENS (estilo WhatsApp: segurar + barra no topo) ============
let selMsgs = [];
let lpTimer = null, lpId = null, lpX = 0, lpY = 0, lpFired = false;
function msgTap(ev, id) {
  if (selMsgs.length) { toggleSel(id); return; }
  const el = $('msg' + id);
  if (el) el.classList.toggle('show-actions');
}
function msgFromPoint(e) {
  const t = (e.touches && e.touches[0]) || e;
  const el = document.elementFromPoint(t.clientX, t.clientY);
  const m = el ? el.closest('.msg') : null;
  return (m && m.id.indexOf('msg') === 0) ? Number(m.id.slice(3)) : null;
}
function bindSelPress() {
  const box = $('messages');
  if (!box || box.dataset.selbound) return;
  box.dataset.selbound = '1';
  const start = (e) => {
    if (selMsgs.length) return;
    const id = msgFromPoint(e);
    if (!id) return;
    const t = (e.touches && e.touches[0]) || e;
    lpId = id; lpX = t.clientX; lpY = t.clientY; lpFired = false;
    clearTimeout(lpTimer);
    lpTimer = setTimeout(() => {
      lpFired = true;
      try { if (navigator.vibrate) navigator.vibrate(40); } catch (err) {}
      enterSel(id);
    }, 550);
  };
  const move = (e) => {
    if (lpId === null) return;
    const t = (e.touches && e.touches[0]) || e;
    if (Math.abs(t.clientX - lpX) + Math.abs(t.clientY - lpY) > 12) { lpId = null; clearTimeout(lpTimer); }
  };
  const end = () => { lpId = null; clearTimeout(lpTimer); };
  box.addEventListener('touchstart', start, { passive: true });
  box.addEventListener('touchmove', move, { passive: true });
  box.addEventListener('touchend', end, { passive: true });
  box.addEventListener('touchcancel', end, { passive: true });
  box.addEventListener('mousedown', start);
  box.addEventListener('mousemove', move);
  box.addEventListener('mouseup', end);
  box.addEventListener('contextmenu', (e) => { if (lpFired) { e.preventDefault(); lpFired = false; } });
}
function enterSel(id) {
  selMsgs = [id];
  paintSel();
}
function toggleSel(id) {
  if (selMsgs.includes(id)) selMsgs = selMsgs.filter(x => x !== id);
  else selMsgs.push(id);
  if (!selMsgs.length) { exitSel(); return; }
  paintSel();
}
function paintSel() {
  document.querySelectorAll('#messages .msg.selected').forEach(el => el.classList.remove('selected'));
  selMsgs.forEach(id => { const el = $('msg' + id); if (el) el.classList.add('selected'); });
  $('messages').classList.add('selecting');
  $('sel-bar').classList.remove('hidden');
  $('sel-count').textContent = selMsgs.length;
  const one = selMsgs.length === 1;
  const ms = selMsgs.map(id => currentMessages.find(x => x.id === id)).filter(Boolean);
  const canCopy = ms.length && ms.every(m => (m.content || m.file_name || (m.poll && m.poll.question)));
  let h = '';
  if (one) h += '<button title="Responder" onclick="selReply()">↩️</button>';
  if (canCopy) h += '<button title="Copiar" onclick="selCopy()">📋</button>';
  h += '<button title="Encaminhar" onclick="selForward()">➡️</button>';
  if (one) h += '<button title="Fixar" onclick="selPin()">📌</button>';
  h += '<button title="Apagar" onclick="selDelete()">🗑️</button>';
  $('sel-btns').innerHTML = h;
}
function exitSel() {
  selMsgs = [];
  document.querySelectorAll('#messages .msg.selected').forEach(el => el.classList.remove('selected'));
  const box = $('messages');
  if (box) box.classList.remove('selecting');
  const bar = $('sel-bar');
  if (bar) bar.classList.add('hidden');
}
function selReply() { if (selMsgs.length !== 1) return; const id = selMsgs[0]; exitSel(); setReply(id); }
function selPin() { if (selMsgs.length !== 1) return; const id = selMsgs[0]; exitSel(); togglePin(id); }
async function selCopy() {
  const ms = selMsgs.map(id => currentMessages.find(x => x.id === id)).filter(Boolean);
  const txt = ms.map(m => m.content || m.file_name || ((m.poll && m.poll.question) || '')).filter(Boolean).join('\n');
  if (!txt) return;
  try { await navigator.clipboard.writeText(txt); toast('📋 Copiado!'); }
  catch (e) { toast('⚠️ Não consegui copiar'); }
  exitSel();
}
function selForward() {
  forwardIds = [...selMsgs];
  exitSel();
  $('fwd-preview').textContent = forwardIds.length === 1
    ? msgPreview(currentMessages.find(x => x.id === forwardIds[0])).slice(0, 100)
    : forwardIds.length + ' mensagens';
  $('fwd-search').value = '';
  renderForwardList('');
  $('modal-forward').classList.remove('hidden');
}
async function selDelete() {
  const ms = selMsgs.map(id => currentMessages.find(x => x.id === id)).filter(Boolean);
  if (!ms.length) { exitSel(); return; }
  const ids = [...selMsgs];
  const allMine = ms.every(m => m.sender_id === ME.id);
  exitSel();
  if (allMine) { delChoiceIds = ids; delChoiceId = null; $('modal-delchoice').classList.remove('hidden'); return; }
  if (!confirm(ids.length === 1 ? 'Apagar esta mensagem para você?' : 'Apagar ' + ids.length + ' mensagens para você?')) return;
  selDeleteForMe(ids);
}
async function selDeleteForMe(ids) {
  for (const id of ids) { try { await api('POST', `/api/messages/${id}/delete-for-me`); } catch (e) {} }
  currentMessages = currentMessages.filter(x => !ids.includes(x.id));
  if (currentPin && ids.includes(currentPin.id)) { currentPin = null; renderPinBar(); }
  renderMessages(false);
  refreshFriends(true); loadGroups(true);
  toast('🗑️ Apagadas para você.');
}
async function selDeleteForAll(ids) {
  if (!confirm(ids.length === 1 ? 'Apagar esta mensagem para todos?' : 'Apagar ' + ids.length + ' mensagens para todos?')) return;
  for (const id of ids) { try { await api('DELETE', `/api/messages/${id}`); } catch (e) {} }
  for (const id of ids) {
    const m = currentMessages.find(x => x.id === id);
    if (m) { m.deleted = true; m.content = ''; m.image = null; m.reactions = {}; }
  }
  if (currentPin && ids.includes(currentPin.id)) { currentPin = null; renderPinBar(); }
  renderMessages(false);
  refreshFriends(true); loadGroups(true);
  toast('🗑️ Apagadas para todos.');
}
function openForwardModal(id) {
  const m = currentMessages.find(x => x.id === id);
  if (!m) return;
  forwardId = id;
  forwardIds = null;
  $('fwd-preview').textContent = msgPreview(m).slice(0, 100);
  $('fwd-search').value = '';
  renderForwardList('');
  $('modal-forward').classList.remove('hidden');
}
function renderForwardList(filter) {
  const q = String(filter || '').toLowerCase();
  const match = (n) => !q || n.toLowerCase().includes(q);
  let html = '';
  const fr = friends.filter(f => match(dname(f)) || match('@' + f.username));
  const gr = groups.filter(g => match(g.name));
  if (fr.length) html += '<h4>💬 Conversas</h4>' + fr.map(f =>
    `<div class="item" onclick="doForward('dm',${f.id})">${avatarHTML(f)}<div class="item-main"><b>${esc(dname(f))}</b><small>@${esc(f.username)}</small></div></div>`).join('');
  if (gr.length) html += '<h4>👥 Grupos</h4>' + gr.map(g =>
    `<div class="item" onclick="doForward('group',${g.id})">${avatarHTML(g)}<div class="item-main"><b>${esc(g.name)}</b><small>${(g.members || []).length} membros</small></div></div>`).join('');
  $('forward-list').innerHTML = html || '<p class="muted">Nada encontrado.</p>';
}
async function doForward(kind, id) {
  const ids = (forwardIds && forwardIds.length) ? forwardIds : [forwardId];
  const list = ids.map(x => currentMessages.find(m => m.id === x)).filter(Boolean);
  if (!list.length) return;
  let n = 0;
  try {
    for (const m of list) {
      const body = { content: m.content || '', image: m.image, type: m.type,
        file_name: m.file_name, mime: m.mime, file_size: m.file_size, duration: m.duration, poll: m.poll || null, forwarded: true };
      if (kind === 'dm') {
        const data = await api('POST', '/api/messages', { ...body, receiver_id: id });
        if (currentChat && currentChat.kind === 'dm' && currentChat.user.id === id) currentMessages.push(data.message);
      } else {
        const data = await api('POST', `/api/groups/${id}/messages`, body);
        if (currentChat && currentChat.kind === 'group' && currentChat.group.id === id) { currentMessages.push(data.message); currentSenders[ME.id] = ME; }
      }
      n++;
    }
    if (n) renderMessages(true);
    if (kind === 'dm') refreshFriends(true); else loadGroups(true);
    forwardIds = null;
    $('modal-forward').classList.add('hidden');
    toast(n === 1 ? '➡️ Encaminhada!' : '➡️ ' + n + ' encaminhadas!');
  } catch (e) { toast('⚠️ ' + e.message); }
}
let delChoiceId = null, delChoiceIds = null;
function askDelete(id, mine) {
  if (!mine) {
    if (!confirm('Apagar esta mensagem para você?')) return;
    doDeleteForMe(id);
    return;
  }
  delChoiceId = id;
  delChoiceIds = null;
  $('modal-delchoice').classList.remove('hidden');
}
async function doDeleteForMe(id) {
  try {
    await api('POST', `/api/messages/${id}/delete-for-me`);
    currentMessages = currentMessages.filter(x => x.id !== id);
    if (currentPin && currentPin.id === id) { currentPin = null; renderPinBar(); }
    renderMessages(false);
    refreshFriends(true); loadGroups(true);
  } catch (e) { toast('⚠️ ' + e.message); }
}
function delChoiceForMe() {
  $('modal-delchoice').classList.add('hidden');
  if (delChoiceIds && delChoiceIds.length) selDeleteForMe(delChoiceIds);
  else if (delChoiceId) doDeleteForMe(delChoiceId);
  delChoiceId = null;
  delChoiceIds = null;
}
function delChoiceForAll() {
  $('modal-delchoice').classList.add('hidden');
  if (delChoiceIds && delChoiceIds.length) selDeleteForAll(delChoiceIds);
  else if (delChoiceId) deleteMessage(delChoiceId);
  delChoiceId = null;
  delChoiceIds = null;
}
async function deleteMessage(id) {
  if (!confirm('Apagar esta mensagem para todos?')) return;
  try {
    await api('DELETE', `/api/messages/${id}`);
    const m = currentMessages.find(x => x.id === id);
    if (m) { m.deleted = true; m.content = ''; m.image = null; m.reactions = {}; renderMessages(false); }
    refreshFriends(true); loadGroups(true);
  } catch (e) { toast('⚠️ ' + e.message); }
}

// ---------- enviar ----------
async function sendMessage(ev) {
  ev.preventDefault();
  if (pendingAtt) { sendImageMessage(); return false; }
  const inp = $('msg-input');
  const text = inp.value.trim();
  if (!text || !currentChat) return false;
  if (guardBlockedDM()) return false;
  inp.value = '';
  stopTypingSignal();
  try {
    let msg;
    if (currentChat.kind === 'dm') {
      const data = await api('POST', '/api/messages', { receiver_id: currentChat.user.id, content: text, reply_to: replyDraft ? replyDraft.id : null });
      msg = data.message;
    } else {
      const data = await api('POST', `/api/groups/${currentChat.group.id}/messages`, { content: text, reply_to: replyDraft ? replyDraft.id : null });
      msg = data.message;
      currentSenders[ME.id] = ME;
    }
    currentMessages.push(msg);
    replyDraft = null; renderReplyBar();
    renderMessages(true);
    refreshFriends(true); loadGroups(true);
  } catch (e) { toast('⚠️ ' + e.message); inp.value = text; }
  return false;
}
function fileToDataURLRaw(file, maxMB) {
  return new Promise((resolve, reject) => {
    if (file.size > maxMB * 1024 * 1024) return reject(new Error(`Arquivo muito grande (máx ${maxMB}MB).`));
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    r.readAsDataURL(file);
  });
}
function showAttPreview() {
  const bar = $('img-preview-bar');
  if (!pendingAtt) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  const th = $('att-thumb'), info = $('att-info');
  if (pendingAtt.kind === 'image') {
    th.innerHTML = `<img src="${pendingAtt.data}" alt="">`;
    info.innerHTML = `<b>📷 Foto</b>`;
  } else if (pendingAtt.kind === 'video') {
    th.innerHTML = `<video src="${pendingAtt.data}#t=0.1" muted></video>`;
    info.innerHTML = `<b>🎬 Vídeo</b><span>${esc(pendingAtt.name)} • ${fmtSize(pendingAtt.size)}</span>`;
  } else if (pendingAtt.kind === 'audio') {
    th.innerHTML = `<div class="att-ico">🎵</div>`;
    info.innerHTML = `<b>🎵 Áudio</b><span>${esc(pendingAtt.name)} • ${fmtSize(pendingAtt.size)}</span>`;
  } else {
    th.innerHTML = `<div class="att-ico">📎</div>`;
    info.innerHTML = `<b>📎 Arquivo</b><span>${esc(pendingAtt.name)} • ${fmtSize(pendingAtt.size)}</span>`;
  }
  $('img-caption').value = '';
  $('img-caption').placeholder = pendingAtt.kind === 'file' ? 'Descrição (opcional)...' : 'Legenda (opcional)...';
  $('img-caption').focus();
}
async function onChatFile(input) {
  const f = input.files[0];
  input.value = '';
  if (!f || !currentChat) return;
  try {
    pendingAtt = { kind: 'image', data: await fileToDataURL(f, 1024, 0.85), name: f.name, mime: f.type, size: f.size };
    showAttPreview();
  } catch (e) { toast('⚠️ ' + e.message); }
}
async function onChatVideo(input) {
  const f = input.files[0];
  input.value = '';
  if (!f || !currentChat) return;
  try {
    pendingAtt = { kind: 'video', data: await fileToDataURLRaw(f, 12), name: f.name, mime: f.type || 'video/mp4', size: f.size };
    showAttPreview();
  } catch (e) { toast('⚠️ ' + e.message); }
}
async function onChatAudio(input) {
  const f = input.files[0];
  input.value = '';
  if (!f || !currentChat) return;
  try {
    pendingAtt = { kind: 'audio', data: await fileToDataURLRaw(f, 12), name: f.name, mime: f.type || 'audio/mpeg', size: f.size };
    showAttPreview();
  } catch (e) { toast('⚠️ ' + e.message); }
}
async function onChatDoc(input) {
  const f = input.files[0];
  input.value = '';
  if (!f || !currentChat) return;
  try {
    pendingAtt = { kind: 'file', data: await fileToDataURLRaw(f, 12), name: f.name, mime: f.type || 'application/octet-stream', size: f.size };
    showAttPreview();
  } catch (e) { toast('⚠️ ' + e.message); }
}
function cancelImage() {
  pendingAtt = null;
  const bar = $('img-preview-bar');
  if (bar) bar.classList.add('hidden');
  const cap = $('img-caption');
  if (cap) cap.value = '';
}
async function sendImageMessage() {
  if (!pendingAtt || !currentChat) return;
  const caption = $('img-caption').value.trim().slice(0, 500);
  const att = pendingAtt;
  cancelImage();
  stopTypingSignal();
  await sendAttachment({ type: att.kind, data: att.data, caption, name: att.name, mime: att.mime, size: att.size });
}
async function sendAttachment({ type, data, caption, name, mime, size, duration }) {
  if (!currentChat) return;
  if (guardBlockedDM()) return;
  try {
    let msg;
    const body = { content: caption || '', image: data, type, file_name: name, mime, file_size: size, duration, reply_to: replyDraft ? replyDraft.id : null };
    if (currentChat.kind === 'dm') {
      const res = await api('POST', '/api/messages', { ...body, receiver_id: currentChat.user.id });
      msg = res.message;
    } else {
      const res = await api('POST', `/api/groups/${currentChat.group.id}/messages`, body);
      msg = res.message;
      currentSenders[ME.id] = ME;
    }
    currentMessages.push(msg);
    replyDraft = null; renderReplyBar();
    renderMessages(true);
    refreshFriends(true); loadGroups(true);
  } catch (e) { toast('⚠️ ' + e.message); }
}

// ---------- gravação de voz ----------
let mediaRec = null, recChunks = [], recStart = 0, recTimerInt = null, recStream = null, recVoiceData = null;
async function toggleRecord() {
  if (mediaRec && mediaRec.state === 'recording') { stopRecording(false); return; }
  if (!currentChat) { toast('Abra uma conversa primeiro.'); return; }
  try {
    recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    toast('⚠️ Não consegui acessar o microfone. Permita o acesso e tente de novo.');
    return;
  }
  try {
    recChunks = [];
    const mime = (window.MediaRecorder && MediaRecorder.isTypeSupported('audio/webm')) ? 'audio/webm' : '';
    mediaRec = mime ? new MediaRecorder(recStream, { mimeType: mime }) : new MediaRecorder(recStream);
  } catch (e) {
    toast('⚠️ Gravação não suportada neste navegador.');
    recStream.getTracks().forEach(t => t.stop());
    recStream = null;
    return;
  }
  recVoiceData = null;
  mediaRec.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
  mediaRec.onstop = finishRecording;
  mediaRec.start();
  recStart = Date.now();
  $('record-bar').classList.remove('hidden');
  $('rec-controls-live').classList.remove('hidden');
  $('rec-controls-done').classList.add('hidden');
  $('rec-player-wrap').classList.add('hidden');
  $('mic-btn').classList.add('rec');
  clearInterval(recTimerInt);
  recTimerInt = setInterval(() => { $('rec-time').textContent = '🔴 ' + fmtDur((Date.now() - recStart) / 1000); }, 500);
  $('rec-time').textContent = '🔴 0:00';
}
function stopRecording(cancelled) {
  clearInterval(recTimerInt);
  $('mic-btn').classList.remove('rec');
  if (mediaRec && mediaRec.state === 'recording') {
    mediaRec._cancelled = !!cancelled;
    mediaRec.stop();
  }
  if (recStream) { recStream.getTracks().forEach(t => t.stop()); recStream = null; }
}
function finishRecording() {
  if (mediaRec && mediaRec._cancelled) { cancelRecording(); return; }
  const dur = Math.round((Date.now() - recStart) / 1000);
  const blob = new Blob(recChunks, { type: (mediaRec && mediaRec.mimeType) || 'audio/webm' });
  if (!blob.size) { toast('⚠️ Áudio vazio, tente de novo.'); cancelRecording(); return; }
  const reader = new FileReader();
  reader.onload = () => {
    recVoiceData = { data: reader.result, mime: blob.type, duration: Math.max(1, dur) };
    $('rec-controls-live').classList.add('hidden');
    $('rec-controls-done').classList.remove('hidden');
    $('rec-player-wrap').classList.remove('hidden');
    $('rec-player').src = reader.result;
    $('rec-time').textContent = '🎤 ' + fmtDur(dur) + ' — ouça e envie:';
  };
  reader.readAsDataURL(blob);
}
function cancelRecording() {
  clearInterval(recTimerInt);
  const mb = $('mic-btn');
  if (mb) mb.classList.remove('rec');
  if (mediaRec && mediaRec.state === 'recording') {
    mediaRec._cancelled = true;
    try { mediaRec.stop(); } catch (e) {}
  }
  if (recStream) { recStream.getTracks().forEach(t => t.stop()); recStream = null; }
  mediaRec = null; recChunks = []; recVoiceData = null;
  $('record-bar').classList.add('hidden');
}
async function sendRecording() {
  if (!recVoiceData || !currentChat) return;
  const v = recVoiceData;
  cancelRecording();
  stopTypingSignal();
  await sendAttachment({ type: 'voice', data: v.data, mime: v.mime, duration: v.duration, name: 'Áudio' });
}
function onTyping() {
  if (!socket || !currentChat) return;
  if (currentChat.kind === 'dm') socket.emit('typing', { to: currentChat.user.id });
  else socket.emit('typing', { groupId: currentChat.group.id });
  clearTimeout(typingTimer);
  typingTimer = setTimeout(stopTypingSignal, 1500);
}
function stopTypingSignal() {
  if (!socket || !currentChat) return;
  if (currentChat.kind === 'dm') socket.emit('stop_typing', { to: currentChat.user.id });
  else socket.emit('stop_typing', { groupId: currentChat.group.id });
}
function toggleEmojiPanel() {
  $('sticker-panel').classList.add('hidden');
  $('attach-menu').classList.add('hidden');
  $('emoji-panel').classList.toggle('hidden');
}
function toggleStickerPanel() {
  $('emoji-panel').classList.add('hidden');
  $('attach-menu').classList.add('hidden');
  const p = $('sticker-panel');
  p.classList.toggle('hidden');
  if (!p.classList.contains('hidden')) renderStickerGrid();
}
function toggleAttachMenu() {
  $('emoji-panel').classList.add('hidden');
  $('sticker-panel').classList.add('hidden');
  $('attach-menu').classList.toggle('hidden');
}
async function loadStickers() {
  try {
    const data = await api('GET', '/api/stickers');
    stickers = data.stickers;
  } catch (e) {}
}
function renderStickerGrid() {
  const g = $('sticker-grid');
  g.innerHTML = `<button type="button" class="sticker-new" onclick="document.getElementById('sticker-file-input').click()">🖌️<span>criar</span></button>` +
    stickers.map(st => `<div class="sticker-cell"><img src="${st.image}" onclick="sendSticker(${st.id})" alt=""><button type="button" class="sticker-edit" onclick="editSticker(${st.id})" title="Editar">✏️</button><button type="button" class="sticker-del" onclick="deleteSticker(${st.id})">×</button></div>`).join('');
}
function fileToSticker(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Escolha uma imagem.'));
    if (file.size > 10 * 1024 * 1024) return reject(new Error('Imagem muito grande (máx 10MB).'));
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target.result; };
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    img.onload = () => {
      let { width, height } = img;
      const scale = Math.min(1, 512 / Math.max(width, height));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Formato não suportado.'));
    reader.readAsDataURL(file);
  });
}
async function onStickerFile(input) {
  const f = input.files[0];
  input.value = '';
  if (!f) return;
  if (!f.type.startsWith('image/')) { toast('⚠️ Escolha uma imagem.'); return; }
  if (f.size > 10 * 1024 * 1024) { toast('⚠️ Imagem muito grande (máx 10MB).'); return; }
  const r = new FileReader();
  r.onload = () => openStickerStudio(r.result, null);
  r.onerror = () => toast('⚠️ Não foi possível ler a imagem.');
  r.readAsDataURL(f);
}
async function editSticker(id) {
  const st = stickers.find(x => x.id === id);
  if (!st) return;
  openStickerStudio(st.image, id);
}
// ═══════════ ESTÚDIO DE FIGURINHAS ═══════════
let stz = null;
const STZ_FILTERS = [
  ['Normal', 'none'], ['P&B', 'grayscale(1)'], ['Sépia', 'sepia(1)'],
  ['Vibrante', 'saturate(1.8) contrast(1.1)'], ['Frio', 'saturate(1.3) hue-rotate(-20deg) brightness(1.05)'],
  ['Quente', 'sepia(0.45) saturate(1.7)'], ['Contraste', 'contrast(1.45)'], ['Invertido', 'invert(1)'],
];
function openStickerStudio(dataURL, editId) {
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, 512 / Math.max(img.width, img.height));
    const W = Math.max(1, Math.round(img.width * scale));
    const H = Math.max(1, Math.round(img.height * scale));
    const base = document.createElement('canvas');
    base.width = W; base.height = H;
    base.getContext('2d').drawImage(img, 0, 0, W, H);
    stz = { base, strokes: [], texts: [], filter: 'none', tool: null, undo: [], editId,
            olW: 0, olColor: '#ffffff', bgOn: false, bgTol: 32, crop: null, selText: -1,
            drawColor: '#ff0000', drawSize: 8, textColor: '#ffffff', textSize: 42 };
    $('stz-title').textContent = editId ? '✏️ Editar figurinha' : '🖌️ Nova figurinha';
    $('modal-studio').classList.remove('hidden');
    stzSetTool(null);
    stzRender();
    toast('🖌️ Edite e depois toque em 💾 Salvar!');
  };
  img.onerror = () => toast('⚠️ Formato não suportado.');
  img.src = dataURL;
}
function stzClose() { $('modal-studio').classList.add('hidden'); stz = null; }
function stzPushUndo() {
  if (!stz) return;
  try { stz.undo.push(stz.base.toDataURL('image/png')); } catch (e) {}
  if (stz.undo.length > 12) stz.undo.shift();
}
function stzUndo() {
  if (!stz || !stz.undo.length) { toast('Nada para desfazer.'); return; }
  const url = stz.undo.pop();
  const img = new Image();
  img.onload = () => {
    stz.base.width = img.width; stz.base.height = img.height;
    stz.base.getContext('2d').drawImage(img, 0, 0);
    stz.bgOn = false;
    stzRender();
  };
  img.src = url;
}
function stzSetTool(name) {
  if (!stz) return;
  stz.tool = (stz.tool === name) ? null : name;
  stz.crop = null;
  $('stz-crop').style.display = 'none';
  document.querySelectorAll('#stz-tools button').forEach(b => b.classList.toggle('on', b.dataset.tool === stz.tool));
  for (const p of ['crop', 'bg', 'filter', 'draw', 'text', 'outline'])
    $('stz-p-' + p).classList.toggle('hidden', stz.tool !== p);
  $('stz-stage').style.cursor = (stz.tool === 'crop' || stz.tool === 'draw' || stz.tool === 'text') ? 'crosshair' : 'default';
  const hints = { crop: '✂️ Arraste na imagem para marcar o corte', draw: '✏️ Desenhe na imagem', text: '🔤 Toque na imagem para colocar o texto' };
  if (hints[stz.tool]) toast(hints[stz.tool]);
}
// ---- base canvas helpers ----
function stzTransformPoints(fn) {
  for (const s of stz.strokes) for (const p of s.pts) { const q = fn(p[0], p[1]); p[0] = q[0]; p[1] = q[1]; }
  for (const t of stz.texts) { const q = fn(t.x, t.y); t.x = q[0]; t.y = q[1]; }
}
function stzFlip(h) {
  if (!stz) return;
  stzPushUndo();
  const { width: W, height: H } = stz.base;
  const tmp = document.createElement('canvas');
  tmp.width = W; tmp.height = H;
  const c = tmp.getContext('2d');
  c.translate(h ? W : 0, h ? 0 : H);
  c.scale(h ? -1 : 1, h ? 1 : -1);
  c.drawImage(stz.base, 0, 0);
  stz.base.getContext('2d').clearRect(0, 0, W, H);
  stz.base.getContext('2d').drawImage(tmp, 0, 0);
  stzTransformPoints((x, y) => h ? [W - x, y] : [x, H - y]);
  stzRender();
}
function stzRotate() {
  if (!stz) return;
  stzPushUndo();
  const { width: W, height: H } = stz.base;
  const tmp = document.createElement('canvas');
  tmp.width = H; tmp.height = W;
  const c = tmp.getContext('2d');
  c.translate(H, 0); c.rotate(Math.PI / 2);
  c.drawImage(stz.base, 0, 0);
  stz.base.width = H; stz.base.height = W;
  stz.base.getContext('2d').drawImage(tmp, 0, 0);
  stzTransformPoints((x, y) => [H - y, x]);
  stzRender();
}
// ---- corte ----
function stzStagePos(e) {
  const r = $('stz-canvas').getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * stz.base.width;
  const y = ((e.clientY - r.top) / r.height) * stz.base.height;
  return [Math.max(0, Math.min(stz.base.width, x)), Math.max(0, Math.min(stz.base.height, y))];
}
function stzShowCrop() {
  const el = $('stz-crop'), r = $('stz-canvas').getBoundingClientRect();
  if (!stz.crop) { el.style.display = 'none'; return; }
  const sx = r.width / stz.base.width, sy = r.height / stz.base.height;
  el.style.display = '';
  el.style.left = (stz.crop.x * sx) + 'px';
  el.style.top = (stz.crop.y * sy) + 'px';
  el.style.width = (stz.crop.w * sx) + 'px';
  el.style.height = (stz.crop.h * sy) + 'px';
}
function stzSquareCrop() {
  if (!stz) return;
  const s = Math.min(stz.base.width, stz.base.height);
  stz.crop = { x: (stz.base.width - s) / 2, y: (stz.base.height - s) / 2, w: s, h: s };
  stzShowCrop();
}
function stzApplyCrop() {
  if (!stz || !stz.crop || stz.crop.w < 8 || stz.crop.h < 8) { toast('⚠️ Marque a área do corte primeiro.'); return; }
  stzPushUndo();
  const { x, y, w, h } = stz.crop;
  const tmp = document.createElement('canvas');
  tmp.width = Math.round(w); tmp.height = Math.round(h);
  tmp.getContext('2d').drawImage(stz.base, x, y, w, h, 0, 0, tmp.width, tmp.height);
  stz.base.width = tmp.width; stz.base.height = tmp.height;
  stz.base.getContext('2d').drawImage(tmp, 0, 0);
  stz.crop = null;
  stz.strokes = []; stz.texts = [];
  stzRender();
  toast('✂️ Corte aplicado!');
}
// ---- remover fundo ----
function stzBgToggle() {
  if (!stz) return;
  if (stz.bgOn) { stzUndo(); stz.bgOn = false; return; }
  stzPushUndo();
  stz.bgOn = true;
  stzApplyBg();
}
function stzBgTol(v) {
  if (!stz) return;
  stz.bgTol = Number(v);
  $('stz-bg-tol-v').textContent = v;
  if (!stz.bgOn) return;
  stz.undo.length && stz.base.getContext('2d');
  const url = stz.undo[stz.undo.length - 1];
  if (!url) return;
  const img = new Image();
  img.onload = () => {
    stz.base.width = img.width; stz.base.height = img.height;
    stz.base.getContext('2d').drawImage(img, 0, 0);
    stzApplyBg(true);
  };
  img.src = url;
}
function stzApplyBg(keepUndo) {
  const W = stz.base.width, H = stz.base.height;
  const ctx = stz.base.getContext('2d');
  const id = ctx.getImageData(0, 0, W, H);
  const d = id.data, tol = stz.bgTol * stz.bgTol * 3;
  const seeds = [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]];
  const refs = seeds.map(([x, y]) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; });
  const seen = new Uint8Array(W * H);
  const stack = seeds.map(([x, y]) => y * W + x);
  const match = (i) => {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    return refs.some(([R, G, B]) => (r - R) * (r - R) + (g - G) * (g - G) + (b - B) * (b - B) <= tol);
  };
  while (stack.length) {
    const i = stack.pop();
    if (seen[i] || !match(i)) continue;
    seen[i] = 1;
    d[i * 4 + 3] = 0;
    const x = i % W, y = (i / W) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < W - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - W);
    if (y < H - 1) stack.push(i + W);
  }
  ctx.putImageData(id, 0, 0);
  stzRender();
  if (!keepUndo) toast('🪄 Fundo removido! Ajuste a tolerância se precisar.');
}
// ---- filtros / contorno ----
function stzFilter(i, btn) {
  if (!stz) return;
  stz.filter = STZ_FILTERS[i][1];
  document.querySelectorAll('#stz-p-filter button').forEach(b => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  stzRender();
}
function stzOutline() {
  if (!stz) return;
  stz.olW = Number($('stz-ol-w').value);
  stz.olColor = $('stz-ol-color').value;
  $('stz-ol-w-v').textContent = stz.olW + 'px';
  stzRender();
}
// ---- desenho e texto ----
function stzAddStroke(pts) { stz.strokes.push({ pts, color: stz.drawColor, size: stz.drawSize }); }
function stzUndoStroke() {
  if (!stz || !stz.strokes.length) { toast('Nada para desfazer.'); return; }
  stz.strokes.pop();
  stzRender();
}
function stzClearDraw() { if (stz) { stz.strokes = []; stzRender(); } }
function stzAddTextAt(x, y) {
  const txt = $('stz-text').value.trim();
  if (!txt) { toast('⚠️ Escreva o texto primeiro.'); return; }
  stz.texts.push({ x, y, str: txt.slice(0, 60), color: stz.textColor, size: stz.textSize });
  stz.selText = stz.texts.length - 1;
  stzRender();
}
function stzDelText() {
  if (!stz || stz.selText < 0 || !stz.texts[stz.selText]) { toast('Toque num texto para selecionar.'); return; }
  stz.texts.splice(stz.selText, 1);
  stz.selText = -1;
  stzRender();
}
function stzHitText(x, y) {
  for (let i = stz.texts.length - 1; i >= 0; i--) {
    const t = stz.texts[i];
    const w = t.size * t.str.length * 0.62, h = t.size * 1.2;
    if (x >= t.x - w / 2 && x <= t.x + w / 2 && y >= t.y - h / 2 && y <= t.y + h / 2) return i;
  }
  return -1;
}
// ---- render (preview + export usam o mesmo compositor) ----
function stzComposite(target) {
  const W = stz.base.width, H = stz.base.height;
  target.width = W; target.height = H;
  const c = target.getContext('2d');
  c.clearRect(0, 0, W, H);
  if (stz.olW > 0) {
    const sil = document.createElement('canvas');
    sil.width = W; sil.height = H;
    const sc = sil.getContext('2d');
    sc.drawImage(stz.base, 0, 0);
    sc.globalCompositeOperation = 'source-in';
    sc.fillStyle = stz.olColor;
    sc.fillRect(0, 0, W, H);
    const N = 12;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      c.drawImage(sil, Math.cos(a) * stz.olW, Math.sin(a) * stz.olW);
    }
  }
  c.filter = stz.filter || 'none';
  c.drawImage(stz.base, 0, 0);
  c.filter = 'none';
  for (const s of stz.strokes) {
    if (s.pts.length < 2) continue;
    c.strokeStyle = s.color; c.lineWidth = s.size;
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(s.pts[0][0], s.pts[0][1]);
    for (const p of s.pts) c.lineTo(p[0], p[1]);
    c.stroke();
  }
  for (let i = 0; i < stz.texts.length; i++) {
    const t = stz.texts[i];
    c.font = `bold ${t.size}px Arial, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = Math.max(2, t.size / 8);
    c.strokeStyle = '#000000';
    c.strokeText(t.str, t.x, t.y);
    c.fillStyle = t.color;
    c.fillText(t.str, t.x, t.y);
    if (i === stz.selText) {
      const w = t.size * t.str.length * 0.62, h = t.size * 1.2;
      c.strokeStyle = '#25D366'; c.lineWidth = 2;
      c.setLineDash([6, 4]);
      c.strokeRect(t.x - w / 2, t.y - h / 2, w, h);
      c.setLineDash([]);
    }
  }
}
function stzRender() {
  if (!stz) return;
  stz.drawColor = $('stz-draw-color').value;
  stz.drawSize = Number($('stz-draw-size').value);
  stz.textColor = $('stz-text-color').value;
  stz.textSize = Number($('stz-text-size').value);
  stzComposite($('stz-canvas'));
  stzShowCrop();
}
function stzExport() {
  const out = document.createElement('canvas');
  const keepSel = stz.selText;
  stz.selText = -1;
  stzComposite(out);
  stz.selText = keepSel;
  return out.toDataURL('image/png');
}
async function stzSave() {
  if (!stz) return;
  try {
    const png = stzExport();
    await api('POST', '/api/stickers', { image: png });
    if (stz.editId) {
      try { await api('DELETE', `/api/stickers/${stz.editId}`); } catch (e) {}
      stickers = stickers.filter(x => x.id !== stz.editId);
    }
    toast('⭐ Figurinha salva!');
    stzClose();
    await loadStickers();
    renderStickerGrid();
  } catch (e) { toast('⚠️ ' + e.message); }
}
async function stzSend() {
  if (!stz) return;
  if (!currentChat) { toast('⚠️ Abra uma conversa para enviar.'); return; }
  const png = stzExport();
  stzClose();
  $('sticker-panel').classList.add('hidden');
  await sendAttachment({ type: 'sticker', data: png });
}
// pointer events do palco (corte / desenho / texto)
document.addEventListener('pointerdown', (e) => {
  if (!stz || !stz.tool) return;
  if (!e.target.closest || !e.target.closest('#stz-stage')) return;
  e.preventDefault();
  const [x, y] = stzStagePos(e);
  if (stz.tool === 'crop') {
    stz.drag = { x, y };
    stz.crop = { x, y, w: 0, h: 0 };
    stzShowCrop();
  } else if (stz.tool === 'draw') {
    stz.drawing = [[x, y]];
  } else if (stz.tool === 'text') {
    const i = stzHitText(x, y);
    if (i >= 0) { stz.selText = i; stz.textDrag = i; stzRender(); }
    else stzAddTextAt(x, y);
  }
});
document.addEventListener('pointermove', (e) => {
  if (!stz) return;
  if (stz.tool === 'crop' && stz.drag) {
    const [x, y] = stzStagePos(e);
    stz.crop = { x: Math.min(stz.drag.x, x), y: Math.min(stz.drag.y, y),
                 w: Math.abs(x - stz.drag.x), h: Math.abs(y - stz.drag.y) };
    stzShowCrop();
  } else if (stz.tool === 'draw' && stz.drawing) {
    const [x, y] = stzStagePos(e);
    stz.drawing.push([x, y]);
    stzAddStrokePreview();
  } else if (stz.tool === 'text' && stz.textDrag >= 0) {
    const [x, y] = stzStagePos(e);
    stz.texts[stz.textDrag].x = x;
    stz.texts[stz.textDrag].y = y;
    stzRender();
  }
});
document.addEventListener('pointerup', () => {
  if (!stz) return;
  if (stz.drawing && stz.drawing.length > 1) {
    stzAddStroke(stz.drawing);
    stzRender();
  }
  stz.drawing = null;
  stz.drag = null;
  stz.textDrag = -1;
});
function stzAddStrokePreview() {
  // redesenha rápido só para feedback do traço atual
  stzComposite($('stz-canvas'));
  const pts = stz.drawing;
  if (pts.length < 2) return;
  const c = $('stz-canvas').getContext('2d');
  c.strokeStyle = stz.drawColor; c.lineWidth = stz.drawSize;
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts) c.lineTo(p[0], p[1]);
  c.stroke();
}
async function sendSticker(id) {
  const st = stickers.find(x => x.id === id);
  if (!st || !currentChat) return;
  $('sticker-panel').classList.add('hidden');
  await sendAttachment({ type: 'sticker', data: st.image });
}
async function deleteSticker(id) {
  if (!confirm('Apagar esta figurinha?')) return;
  try {
    await api('DELETE', `/api/stickers/${id}`);
    stickers = stickers.filter(x => x.id !== id);
    renderStickerGrid();
  } catch (e) { toast('⚠️ ' + e.message); }
}
async function saveStickerFromMessage(msgId) {
  const m = currentMessages.find(x => x.id === msgId);
  if (!m || !m.image) return;
  try {
    await api('POST', '/api/stickers', { image: m.image });
    toast('⭐ Figurinha salva na sua coleção!');
    loadStickers();
  } catch (e) { toast('⚠️ ' + e.message); }
}
document.addEventListener('click', (e) => {
  if (e.target.classList && e.target.classList.contains('emoji-btn')) return;
  for (const id of ['emoji-panel', 'sticker-panel', 'attach-menu']) {
    const p = $(id);
    if (p && !p.classList.contains('hidden') && !p.contains(e.target)) p.classList.add('hidden');
  }
});

// ---------- lightbox ----------
function openLightbox(imgId) {
  const img = document.getElementById(imgId);
  if (!img) return;
  $('lightbox-img').src = img.src;
  $('modal-lightbox').classList.remove('hidden');
}

// ═══════════ CHAMADAS (voz / vídeo / tela) ═══════════
let call = null;
const ICE_SERVERS = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };
let ringInt = null;
function startRing() { stopRing(); beep(660); ringInt = setInterval(() => beep(660), 1600); }
function stopRing() { if (ringInt) { clearInterval(ringInt); ringInt = null; } }
function callElapsed() {
  return (call && call.answered && call.startTime) ? Math.round((Date.now() - call.startTime) / 1000) : 0;
}
async function startCall(callType) {
  if (!currentChat || currentChat.kind !== 'dm') return;
  if (call) { toast('Você já está em uma chamada.'); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast('⚠️ Chamadas não suportadas neste navegador.'); return;
  }
  const peer = currentChat.user;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === 'video' });
  } catch (e) { toast('⚠️ Permita o microfone' + (callType === 'video' ? ' e a câmera' : '') + ' para ligar.'); return; }
  const pc = new RTCPeerConnection(ICE_SERVERS);
  const callId = Date.now() + '-' + Math.floor(Math.random() * 1e6);
  call = { id: callId, peer, type: callType, dir: 'out', pc, localStream: stream, answered: false };
  wireCall(pc, peer.id, callId);
  stream.getTracks().forEach(t => pc.addTrack(t, stream));
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('call_invite', { to: peer.id, sdp: offer, callType, callId });
  } catch (e) { toast('⚠️ Falha ao iniciar chamada.'); cleanupCall(); return; }
  showCallUI();
  $('call-status').textContent = 'Chamando ' + dname(peer) + '…';
  startRing();
  call.timeoutInt = setTimeout(() => {
    if (call && !call.answered) {
      socket.emit('call_cancel', { to: peer.id, callId });
      toast('📵 Não atendeu.');
      logCall(false, 0);
      cleanupCall();
    }
  }, 45000);
}
function wireCall(pc, peerId, callId) {
  pc.onicecandidate = (e) => { if (e.candidate) socket.emit('call_ice', { to: peerId, candidate: e.candidate, callId }); };
  pc.ontrack = (e) => {
    const rv = $('remote-video');
    if (rv.srcObject !== e.streams[0]) rv.srcObject = e.streams[0];
  };
  pc.onnegotiationneeded = async () => {
    if (!call || !call.answered || pc.signalingState !== 'stable') return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('call_reoffer', { to: peerId, sdp: offer, callId });
    } catch (e) {}
  };
  pc.onconnectionstatechange = () => {
    if (!call) return;
    if (pc.connectionState === 'connected') onCallConnected();
    if (pc.connectionState === 'failed') toast('⚠️ Conexão da chamada falhou (rede).');
  };
}
function onCallConnected() {
  if (!call || call.answered) return;
  call.answered = true;
  call.startTime = Date.now();
  stopRing();
  clearTimeout(call.timeoutInt);
  $('call-status').textContent = call.type === 'video' ? '📹 Em chamada' : '📞 Em chamada';
  clearInterval(call.timerInt);
  call.timerInt = setInterval(() => { $('call-timer').textContent = fmtDur(callElapsed()); }, 1000);
}
function showCallUI() {
  $('modal-incoming').classList.add('hidden');
  $('call-overlay').classList.remove('hidden');
  const fr = friends.find(f => f.id === call.peer.id);
  $('call-remote-name').textContent = fr ? dname(fr) : (call.peer.nickname || call.peer.name);
  setAvatarEl($('call-remote-avatar'), call.peer);
  $('local-video').srcObject = call.localStream || null;
  $('call-timer').textContent = '';
  const isVideo = call.type === 'video';
  $('remote-video').style.display = isVideo ? '' : 'none';
  $('local-video').style.display = isVideo ? '' : 'none';
  $('call-avatars').style.display = isVideo ? 'none' : '';
  $('call-cam-btn').style.display = isVideo ? '' : 'none';
  $('call-mute-btn').textContent = '🎤';
  $('call-mute-btn').classList.remove('off');
  $('call-cam-btn').textContent = '📷';
  $('share-banner').classList.add('hidden');
}
async function acceptCall() {
  if (!call) return;
  $('modal-incoming').classList.add('hidden');
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: call.type === 'video' });
  } catch (e) {
    toast('⚠️ Permita microfone/câmera para atender.');
    socket.emit('call_reject', { to: call.peer.id, callId: call.id });
    cleanupCall();
    return;
  }
  const pc = new RTCPeerConnection(ICE_SERVERS);
  call.pc = pc;
  call.localStream = stream;
  wireCall(pc, call.peer.id, call.id);
  stream.getTracks().forEach(t => pc.addTrack(t, stream));
  try {
    await pc.setRemoteDescription(new RTCSessionDescription(call.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('call_answer', { to: call.peer.id, sdp: answer, callId: call.id });
  } catch (e) { toast('⚠️ Falha ao atender.'); cleanupCall(); return; }
  call.answered = true;
  call.startTime = Date.now();
  stopRing();
  clearTimeout(call.timeoutInt);
  showCallUI();
  $('call-status').textContent = call.type === 'video' ? '📹 Em chamada' : '📞 Em chamada';
  clearInterval(call.timerInt);
  call.timerInt = setInterval(() => { $('call-timer').textContent = fmtDur(callElapsed()); }, 1000);
}
function rejectCall() {
  if (!call) return;
  socket.emit('call_reject', { to: call.peer.id, callId: call.id });
  cleanupCall();
}
function endCall() {
  if (!call) return;
  const wasOut = call.dir === 'out';
  const wasAnswered = call.answered;
  const dur = callElapsed();
  socket.emit('call_end', { to: call.peer.id, callId: call.id });
  if (wasOut && wasAnswered) logCall(true, dur);
  else if (wasOut && !wasAnswered) { /* cancelou antes de atender: sem registro */ }
  cleanupCall();
}
async function logCall(answered, dur, reason) {
  if (!call) return;
  const peerId = call.peer.id;
  const isVideo = call.type === 'video';
  const kind = isVideo ? 'vídeo' : 'voz';
  let text;
  if (answered) text = `Chamada de ${kind} • ${fmtDur(dur)}`;
  else if (reason === 'recusada') text = `Chamada de ${kind} recusada`;
  else text = `Chamada de ${kind} não atendida`;
  try {
    const data = await api('POST', '/api/messages', { receiver_id: peerId, content: text, type: 'call' });
    if (currentChat && currentChat.kind === 'dm' && currentChat.user.id === peerId) {
      currentMessages.push(data.message);
      renderMessages(true);
    }
    refreshFriends(true);
  } catch (e) {}
}
function cleanupCall() {
  stopRing();
  if (call) {
    clearTimeout(call.timeoutInt);
    clearInterval(call.timerInt);
    try { if (call.pc) call.pc.close(); } catch (e) {}
    if (call.localStream) call.localStream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
    if (call.screenStream) call.screenStream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
  }
  call = null;
  $('modal-incoming').classList.add('hidden');
  $('call-overlay').classList.add('hidden');
  $('remote-video').srcObject = null;
  $('local-video').srcObject = null;
  $('share-banner').classList.add('hidden');
}
function toggleCallMute() {
  if (!call || !call.localStream) return;
  const t = call.localStream.getAudioTracks()[0];
  if (!t) return;
  t.enabled = !t.enabled;
  $('call-mute-btn').textContent = t.enabled ? '🎤' : '🔇';
  $('call-mute-btn').classList.toggle('off', !t.enabled);
}
function toggleCallCam() {
  if (!call || !call.localStream) return;
  const t = call.localStream.getVideoTracks()[0];
  if (!t) return;
  t.enabled = !t.enabled;
  $('call-cam-btn').textContent = t.enabled ? '📷' : '🚫';
  $('call-cam-btn').classList.toggle('off', !t.enabled);
}
async function toggleScreenShare() {
  if (!call || !call.pc) return;
  if (call.screenStream) { stopScreenShare(); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    toast('⚠️ Compartilhar tela não suportado aqui. Use Chrome/Edge.'); return;
  }
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    const sender = call.pc.getSenders().find(s => s.track && s.track.kind === 'video');
    if (sender) await sender.replaceTrack(track);
    else call.pc.addTrack(track, stream);
    call.screenStream = stream;
    $('share-banner').classList.remove('hidden');
    $('remote-video').style.display = '';
    track.onended = () => stopScreenShare();
    toast('🖥️ Compartilhando tela!');
  } catch (e) {
    toast('⚠️ Não foi possível compartilhar a tela.');
  }
}
async function stopScreenShare() {
  if (!call || !call.screenStream) return;
  call.screenStream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
  call.screenStream = null;
  try {
    const camTrack = call.localStream ? call.localStream.getVideoTracks()[0] : null;
    const sender = call.pc.getSenders().find(s => s.track && s.track.kind === 'video');
    if (sender && camTrack) await sender.replaceTrack(camTrack);
  } catch (e) {}
  $('share-banner').classList.add('hidden');
  if (call.type === 'voice') $('remote-video').style.display = 'none';
}

// ---------- perfil ----------
function openProfileModal() {
  $('edit-name').value = ME.name;
  $('edit-status').value = ME.status;
  $('edit-bio').value = ME.bio || '';
  editAvatar = ME.avatar; editColor = ME.avatarColor;
  editPhoto = ME.photo; editPhotoRemoved = false;
  $('pv-name').textContent = ME.name;
  $('pv-user').textContent = '@' + ME.username;
  updatePreview();
  [...$('edit-avatar-picker').children].forEach(b => b.classList.toggle('sel', b.textContent === editAvatar));
  api('GET', '/api/stats').then(d => {
    $('stats-row').innerHTML = `
      <div class="stat"><b>${d.friends}</b><span>amigos</span></div>
      <div class="stat"><b>${d.groups}</b><span>grupos</span></div>
      <div class="stat"><b>${d.sent}</b><span>enviadas</span></div>
      <div class="stat"><b>${d.received}</b><span>recebidas</span></div>`;
  }).catch(()=>{});
  $('modal-profile').classList.remove('hidden');
}
async function saveProfile() {
  try {
    const payload = {
      name: $('edit-name').value, status: $('edit-status').value,
      bio: $('edit-bio').value, avatar: editAvatar, avatarColor: editColor
    };
    if (editPhotoRemoved) payload.removePhoto = true;
    else if (editPhoto && editPhoto !== ME.photo) payload.photo = editPhoto;
    const data = await api('PUT', '/api/me', payload);
    ME = data.user;
    renderMe();
    $('pv-name').textContent = ME.name;
    toast('✅ Perfil atualizado!');
    closeModals();
  } catch (e) { toast('⚠️ ' + e.message); }
}
async function changePassword() {
  try {
    await api('PUT', '/api/password', { current: $('pw-current').value, next: $('pw-next').value });
    toast('🔒 Senha alterada!');
    $('pw-current').value = ''; $('pw-next').value = '';
  } catch (e) { toast('⚠️ ' + e.message); }
}

// ---------- perfil de outra pessoa ----------
let blockedIds = new Set();
async function loadBlocks() {
  try {
    const data = await api('GET', '/api/blocks');
    blockedIds = new Set(data.blocked || []);
  } catch (e) {}
}
async function toggleBlock(id) {
  const isB = blockedIds.has(id);
  if (!isB && !confirm('Bloquear esta pessoa? Vocês não poderão conversar nem ligar.')) return;
  try {
    if (isB) {
      await api('DELETE', `/api/blocks/${id}`);
      blockedIds.delete(id);
      toast('✅ Desbloqueado!');
    } else {
      await api('POST', '/api/blocks', { user_id: id });
      blockedIds.add(id);
      toast('⛔ Pessoa bloqueada.');
    }
    renderLists();
    openPeerById(id);
  } catch (e) { toast('⚠️ ' + e.message); }
}
function guardBlockedDM() {
  if (currentChat && currentChat.kind === 'dm' && blockedIds.has(currentChat.user.id)) {
    toast('⛔ Você bloqueou esta pessoa. Desbloqueie no perfil dela (ℹ️) para conversar.');
    return true;
  }
  return false;
}
async function openPeerById(id) {
  try {
    const data = await api('GET', `/api/users/${id}`);
    const u = data.user;
    peerCache = u;
    setAvatarEl($('peer-avatar'), u);
    $('peer-name').textContent = dname(u);
    $('peer-realname').textContent = (u.nickname && u.nickname !== u.name) ? 'Nome: ' + u.name : '';
    $('peer-user').textContent = '@' + u.username;
    const on = onlineIds.has(u.id);
    $('peer-online').textContent = on ? '🟢 online agora' : '⚪ ' + lastSeenLabel(u);
    $('peer-online').className = 'online-line ' + (on ? 'on' : 'off');
    $('peer-status').textContent = '💬 ' + (u.status || '');
    $('peer-bio').textContent = u.bio ? '📝 ' + u.bio : 'Sem bio por enquanto.';
    let btns = '';
    if (u.relation === 'friend') btns = `<button class="mini-btn ok" onclick="closeModals();switchMainTab('chats');openDM(${u.id})">💬 Conversar</button>`;
    else if (u.relation === 'sent') btns = `<button class="mini-btn no" disabled>⏳ Pedido enviado</button>`;
    else if (u.relation === 'received') btns = `<button class="mini-btn ok" onclick="closeModals();switchMainTab('requests')">📩 Responder pedido</button>`;
    else if (u.relation !== 'self') btns = `<button class="mini-btn add" onclick="closeModals();sendRequest(${u.id})">＋ Adicionar amigo</button>`;
    if (u.relation !== 'self') btns += blockedIds.has(u.id)
      ? `<button class="mini-btn ok" onclick="toggleBlock(${u.id})">✅ Desbloquear</button>`
      : `<button class="mini-btn danger" onclick="toggleBlock(${u.id})">⛔ Bloquear</button>`;
    if (u.relation === 'friend') btns += `<button class="mini-btn" onclick="toggleMute('dm',${u.id})">${isMuted('dm', u.id) ? '🔊 Ativar som' : '🔇 Silenciar'}</button>`;
    $('peer-actions').innerHTML = btns;
    $('peer-nick-wrap').classList.toggle('hidden', u.relation !== 'friend');
    $('peer-nick').value = u.nickname || '';
    $('peer-topics').innerHTML = topicCheckboxes('dm', u.id);
    $('modal-peer').classList.remove('hidden');
  } catch (e) { toast('⚠️ ' + e.message); }
}

async function saveNickname() {
  if (!peerCache) return;
  try {
    const data = await api('PUT', `/api/friends/${peerCache.id}/nickname`, { nickname: $('peer-nick').value });
    peerCache.nickname = data.nickname;
    toast(data.nickname ? `✏️ Apelido salvo: "${data.nickname}"` : 'Apelido removido.');
    pollSync();
    if (currentChat && currentChat.kind === 'dm' && currentChat.user.id === peerCache.id) {
      currentChat.user.nickname = data.nickname;
      updateChatHeader();
    }
    openPeerById(peerCache.id);
  } catch (e) { toast('⚠️ ' + e.message); }
}

// ---------- grupos: criar ----------
async function onGroupPhoto(input) {
  const f = input.files[0];
  if (!f) return;
  try {
    grpPhoto = await fileToDataURL(f, 256, 0.82);
    setAvatarEl($('grp-photo-preview'), { photo: grpPhoto, avatar: '👥', avatarColor: '#128C7E' });
    $('grp-photo-remove').classList.remove('hidden');
  } catch (e) { toast('⚠️ ' + e.message); input.value = ''; }
}
function clearGroupPhoto() {
  grpPhoto = null;
  $('grp-photo-input').value = '';
  setAvatarEl($('grp-photo-preview'), { photo: null, avatar: '👥', avatarColor: '#128C7E' });
  $('grp-photo-remove').classList.add('hidden');
}
function openCreateGroup() {
  $('grp-name').value = '';
  $('grp-desc').value = '';
  clearGroupPhoto();
  const box = $('grp-friends');
  if (!friends.length) {
    box.innerHTML = `<div class="empty-list" style="padding:16px">Você ainda não tem amigos.<br>Adicione amigos para colocá-los no grupo!</div>`;
  } else {
    box.innerHTML = friends.map(f => `
      <label class="check-item">
        <input type="checkbox" value="${f.id}">
        ${avatarHTML(f, false)}
        <div><strong>${esc(f.name)}</strong><span>@${esc(f.username)}</span></div>
      </label>`).join('');
  }
  $('modal-creategroup').classList.remove('hidden');
}
async function createGroup() {
  const name = $('grp-name').value.trim();
  if (name.length < 2) { toast('⚠️ Dê um nome ao grupo!'); return; }
  const member_ids = [...document.querySelectorAll('#grp-friends input:checked')].map(i => Number(i.value));
  try {
    const data = await api('POST', '/api/groups', {
      name, description: $('grp-desc').value.trim(), photo: grpPhoto, member_ids
    });
    socket.emit('join_group', { groupId: data.group.id });
    toast(`👥 Grupo "${data.group.name}" criado!`);
    closeModals();
    await loadGroups();
    switchMainTab('groups');
    openGroup(data.group.id);
  } catch (e) { toast('⚠️ ' + e.message); }
}

// ---------- grupos: info / membros ----------
async function openGroupInfo(groupId, keepOpen) {
  try {
    const data = await api('GET', `/api/groups/${groupId}`);
    const g = data.group;
    groupInfoCache = g;
    setAvatarEl($('gi-avatar'), g);
    $('gi-name').textContent = g.name;
    $('gi-count').textContent = `${g.members.length} membro(s)`;
    $('gi-desc').textContent = g.description ? '📝 ' + g.description : 'Sem descrição.';
    $('gi-topics').innerHTML = topicCheckboxes('group', g.id);
    const isAdmin = g.my_role === 'admin';
    $('gi-edit').classList.toggle('hidden', !isAdmin);
    $('gi-add').classList.toggle('hidden', !isAdmin);
    $('gi-delete-btn').classList.toggle('hidden', !isAdmin);
    $('gi-mute-btn').textContent = isMuted('group', g.id) ? '🔊 Ativar som' : '🔇 Silenciar';
    if (isAdmin) {
      $('gi-edit-name').value = g.name;
      $('gi-edit-desc').value = g.description || '';
      const inGroup = new Set(g.members.map(m => m.id));
      const candidates = friends.filter(f => !inGroup.has(f.id));
      $('gi-add-friends').innerHTML = candidates.length
        ? candidates.map(f => `
          <div class="check-item">
            ${avatarHTML(f, false)}
            <div><strong>${esc(f.name)}</strong><span>@${esc(f.username)}</span></div>
            <button class="mini-btn add" style="margin-left:auto" onclick="addMember(${g.id},${f.id})">＋</button>
          </div>`).join('')
        : `<div class="empty-list" style="padding:12px">Todos os seus amigos já estão no grupo.</div>`;
    }
    $('gi-members').innerHTML = g.members.map(m => `
      <div class="check-item">
        ${avatarHTML(m, false)}
        <div><strong>${esc(dname(m))}${m.id === ME.id ? ' (você)' : ''}</strong><span>@${esc(m.username)} • ${m.online ? '🟢 online' : '⚪ offline'}</span></div>
        ${m.role === 'admin' ? '<span class="role-tag">admin</span>' : ''}
        ${isAdmin && m.id !== ME.id ? (m.role === 'admin'
          ? `<button class="mini-btn no" style="margin-left:6px" title="Tirar admin" onclick="setRole(${g.id},${m.id},'member')">⬇️</button>`
          : `<button class="mini-btn ok" style="margin-left:6px" title="Tornar admin" onclick="setRole(${g.id},${m.id},'admin')">⬆️</button>`) : ''}
        ${isAdmin && m.id !== ME.id ? `<button class="mini-btn no" style="margin-left:6px" onclick="removeMember(${g.id},${m.id},'${esc(m.name)}')">remover</button>` : ''}
      </div>`).join('');
    if (!keepOpen) $('modal-groupinfo').classList.remove('hidden');
  } catch (e) { toast('⚠️ ' + e.message); }
}
async function onGroupEditPhoto(input) {
  const f = input.files[0];
  input.value = '';
  if (!f || !groupInfoCache) return;
  try {
    const photo = await fileToDataURL(f, 256, 0.82);
    await api('PUT', `/api/groups/${groupInfoCache.id}`, { photo });
    toast('📷 Foto do grupo atualizada!');
    openGroupInfo(groupInfoCache.id, true);
  } catch (e) { toast('⚠️ ' + e.message); }
}
async function removeGroupPhoto() {
  if (!groupInfoCache) return;
  try {
    await api('PUT', `/api/groups/${groupInfoCache.id}`, { removePhoto: true });
    toast('Foto removida.');
    openGroupInfo(groupInfoCache.id, true);
  } catch (e) { toast('⚠️ ' + e.message); }
}
async function saveGroupEdit() {
  if (!groupInfoCache) return;
  try {
    await api('PUT', `/api/groups/${groupInfoCache.id}`, {
      name: $('gi-edit-name').value, description: $('gi-edit-desc').value
    });
    toast('✅ Grupo atualizado!');
    openGroupInfo(groupInfoCache.id, true);
  } catch (e) { toast('⚠️ ' + e.message); }
}
async function addMember(groupId, userId) {
  try {
    await api('POST', `/api/groups/${groupId}/members`, { user_id: userId });
    toast('➕ Membro adicionado!');
    openGroupInfo(groupId, true);
  } catch (e) { toast('⚠️ ' + e.message); }
}
async function addMemberByName() {
  const v = $('gi-add-user').value.trim();
  if (!v || !groupInfoCache) return;
  try {
    await api('POST', `/api/groups/${groupInfoCache.id}/members`, { username: v });
    toast('➕ Membro adicionado!');
    $('gi-add-user').value = '';
    openGroupInfo(groupInfoCache.id, true);
  } catch (e) { toast('⚠️ ' + e.message); }
}
async function removeMember(groupId, userId, name) {
  if (!confirm(`Remover ${name} do grupo?`)) return;
  try {
    await api('DELETE', `/api/groups/${groupId}/members/${userId}`);
    toast('Membro removido.');
    openGroupInfo(groupId, true);
  } catch (e) { toast('⚠️ ' + e.message); }
}
async function setRole(groupId, userId, role) {
  try {
    await api('PUT', `/api/groups/${groupId}/members/${userId}/role`, { role });
    toast(role === 'admin' ? '⬆️ Agora é admin!' : '⬇️ Voltou a ser membro.');
    openGroupInfo(groupId, true);
  } catch (e) { toast('⚠️ ' + e.message); }
}
async function leaveGroup() {
  if (!groupInfoCache) return;
  if (!confirm(`Sair do grupo "${groupInfoCache.name}"?`)) return;
  try {
    await api('DELETE', `/api/groups/${groupInfoCache.id}/members/${ME.id}`);
    socket.emit('leave_group_room', { groupId: groupInfoCache.id });
    toast('Você saiu do grupo.');
    closeModals();
    if (currentChat && currentChat.kind === 'group') closeChat();
    loadGroups();
  } catch (e) { toast('⚠️ ' + e.message); }
}
async function deleteGroup() {
  if (!groupInfoCache) return;
  if (!confirm(`Apagar o grupo "${groupInfoCache.name}" para TODOS? Essa ação não pode ser desfeita!`)) return;
  try {
    await api('DELETE', `/api/groups/${groupInfoCache.id}`);
    toast('Grupo apagado.');
    closeModals();
    if (currentChat && currentChat.kind === 'group') closeChat();
    loadGroups();
  } catch (e) { toast('⚠️ ' + e.message); }
}

async function createTopic() {
  const name = prompt('Nome do novo tópico (ex: Família, Trabalho):');
  if (!name || !name.trim()) return;
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  try {
    const data = await api('POST', '/api/topics', { name: name.trim(), color });
    topics.push({ ...data.topic });
    toast(`🏷️ Tópico "${data.topic.name}" criado! Adicione conversas pelo perfil.`);
    renderTopicChips();
  } catch (e) { toast('⚠️ ' + e.message); }
}
async function renameTopic(id) {
  const t = topics.find(x => x.id === id);
  const name = prompt('Renomear tópico:', t ? t.name : '');
  if (!name || !name.trim()) return;
  try {
    await api('PUT', `/api/topics/${id}`, { name: name.trim() });
    if (t) t.name = name.trim();
    renderTopicChips(); openTopicsModal();
  } catch (e) { toast('⚠️ ' + e.message); }
}
async function deleteTopic(id) {
  const t = topics.find(x => x.id === id);
  if (!confirm(`Apagar o tópico "${t ? t.name : ''}"? (as conversas NÃO são apagadas)`)) return;
  try {
    await api('DELETE', `/api/topics/${id}`);
    topics = topics.filter(x => x.id !== id);
    if (topicFilter === id) topicFilter = 'all';
    renderLists(); openTopicsModal();
  } catch (e) { toast('⚠️ ' + e.message); }
}
function openTopicsModal() {
  const box = $('topics-list');
  box.innerHTML = topics.length ? topics.map(t => `
    <div class="check-item"><span class="chip-dot" style="background:${esc(t.color)}"></span>
      <div><strong>${esc(t.name)}</strong><span>${t.items.length} conversa(s)</span></div>
      <button class="mini-btn no" style="margin-left:auto" onclick="renameTopic(${t.id})">✏️</button>
      <button class="mini-btn no" onclick="deleteTopic(${t.id})">🗑️</button></div>`).join('')
    : `<div class="empty-list" style="padding:16px">Nenhum tópico.<br>Crie com o botão ＋ !</div>`;
  $('modal-topics').classList.remove('hidden');
}
async function toggleTopicItem(topicId, kind, refId, checked) {
  try {
    if (checked) await api('POST', `/api/topics/${topicId}/items`, { kind, ref_id: refId });
    else await api('DELETE', `/api/topics/${topicId}/items?kind=${kind}&ref_id=${refId}`);
    await loadTopics();
    renderLists();
  } catch (e) { toast('⚠️ ' + e.message); }
}
async function loadTopics() {
  try {
    const data = await api('GET', '/api/topics');
    topics = data.topics;
  } catch (e) {}
}
function topicCheckboxes(kind, refId) {
  if (!topics.length) return `<p class="muted small">Nenhum tópico ainda. Crie com ＋ na barra de conversas!</p>`;
  return topics.map(t => {
    const has = t.items.some(i => i.kind === kind && i.ref_id === refId);
    return `<label class="check-item"><input type="checkbox" ${has ? 'checked' : ''} onchange="toggleTopicItem(${t.id},'${kind}',${refId},this.checked)">
      <span class="chip-dot" style="background:${esc(t.color)}"></span>
      <div><strong>${esc(t.name)}</strong></div></label>`;
  }).join('');
}
function closeModals() {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  if (typeof stz !== 'undefined' && stz) stzClose();
  groupInfoCache = null;
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (typeof call !== 'undefined' && call) return; // em chamada: não fechar sem querer
    closeModals();
  }
});

// ---------- init ----------
window.addEventListener('DOMContentLoaded', async () => {
  buildPickers();
  applyTheme();
  applyCRT();
  applyWallpaper();
  applyAppIcon();
  applyTitle();
  try {
    const data = await api('GET', '/api/me');
    enterApp(data.user);
  } catch (e) {
    $('auth-screen').classList.remove('hidden');
  }
});
