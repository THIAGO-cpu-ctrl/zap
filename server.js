const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.set('trust proxy', 1); // hospedagem (Render/Railway) atrás de proxy
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET','POST','PUT','DELETE'] } });

const PORT = process.env.PORT || 3000;
// No app .exe, o banco fica na pasta de dados do usuário (dentro do .exe é só-leitura)
const DB_FILE = process.env.ZAP_DATA || path.join(__dirname, 'data.json');
const MAX_PHOTO = 800000;   // ~600KB (foto de perfil / grupo)
const MAX_CHAT_IMG = 2600000; // ~2MB (imagem no chat)
const MAX_STICKER = 700000;   // ~500KB (figurinha)
const MAX_FILE = 12000000;    // ~9MB (áudio, vídeo, arquivos)

// ---------- Banco de dados simples em JSON ----------
function defaultDB() {
  return {
    users: [], friendships: [], messages: [],
    groups: [], group_members: [],
    topics: [], topic_items: [], nicknames: [], stickers: [], pins: [], blocks: [], statuses: [],
    seq: { user: 1, friendship: 1, message: 1, group: 1, group_member: 1,
           topic: 1, topic_item: 1, nickname: 1, sticker: 1, status: 1 }
  };
}
function loadDB() {
  let db;
  try {
    if (!fs.existsSync(DB_FILE)) {
      db = defaultDB();
    } else {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('DB load error, resetting', e);
    db = defaultDB();
  }
  // migração: garante novos campos em bancos antigos
  db.users = db.users || []; db.friendships = db.friendships || [];
  db.messages = db.messages || []; db.groups = db.groups || [];
  db.group_members = db.group_members || [];
  db.topics = db.topics || []; db.topic_items = db.topic_items || [];
  db.nicknames = db.nicknames || []; db.stickers = db.stickers || [];
  db.pins = db.pins || []; db.blocks = db.blocks || []; db.statuses = db.statuses || [];
  db.seq = Object.assign({ user: 1, friendship: 1, message: 1, group: 1, group_member: 1,
    topic: 1, topic_item: 1, nickname: 1, sticker: 1, status: 1 }, db.seq || {});
  for (const k of Object.keys(db.seq)) if (!Number.isInteger(db.seq[k])) db.seq[k] = 1;
  const maxSt = db.statuses.reduce((m, s) => Math.max(m, Number.isInteger(s.id) ? s.id : 0), 0);
  if (db.seq.status <= maxSt) db.seq.status = maxSt + 1;
  for (const m of db.messages) {
    if (m.type === undefined) m.type = m.image ? 'image' : 'text';
    if (m.reactions === undefined) m.reactions = {};
    if (m.deleted === undefined) m.deleted = false;
    if (m.group_id === undefined) m.group_id = null;
    if (m.receiver_id === undefined) m.receiver_id = null;
    if (m.file_name === undefined) m.file_name = null;
    if (m.mime === undefined) m.mime = null;
    if (m.file_size === undefined) m.file_size = 0;
    if (m.duration === undefined) m.duration = 0;
  }
  for (const g of db.groups) {
    if (g.photo === undefined) g.photo = null;
    if (g.avatar === undefined) g.avatar = '👥';
    if (g.avatarColor === undefined) g.avatarColor = '#128C7E';
    if (g.description === undefined) g.description = '';
  }
  for (const u of db.users) {
    if (u.photo === undefined) u.photo = null;
  }
  saveDB(db);
  return db;
}
function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
let db = loadDB();

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, name: u.name, username: u.username,
    bio: u.bio || '', avatar: u.avatar || '😀',
    avatarColor: u.avatarColor || '#25D366',
    photo: u.photo || null,
    status: u.status || 'Olá! Estou usando o ZapFamily 👋',
    created_at: u.created_at, last_seen: u.last_seen
  };
}
function publicGroup(g) {
  if (!g) return null;
  return {
    id: g.id, name: g.name, description: g.description || '',
    photo: g.photo || null, avatar: g.avatar || '👥',
    avatarColor: g.avatarColor || '#128C7E',
    created_by: g.created_by, created_at: g.created_at
  };
}
// normaliza texto: minúsculas + sem acentos (p/ pesquisa tolerante)
function norm(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function validPhoto(p, max) {
  if (p === null || p === '' || p === undefined) return null;
  if (typeof p !== 'string') return 'invalid';
  if (!p.startsWith('data:image/')) return 'invalid';
  if (p.length > max) return 'big';
  return p;
}
// nome em uso? (ignora maiúsculas, acentos e espaços — "João" = "joao")
function nameTaken(name, excludeId) {
  const n = norm(name).trim();
  return db.users.some(u => u.id !== excludeId && norm(u.name).trim() === n);
}
function usernameTaken(username, excludeId) {
  const n = String(username).trim().toLowerCase();
  return db.users.some(u => u.id !== excludeId && u.username === n);
}

// ---------- Middlewares ----------
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '15mb' }));
// Sessões persistentes em arquivo: o login sobrevive a reinícios do servidor
let sessionStore;
try {
  const FileStore = require('session-file-store')(session);
  const sessDir = process.env.ZAP_SESS || path.join(path.dirname(DB_FILE), 'sessions');
  fs.mkdirSync(sessDir, { recursive: true });
  sessionStore = new FileStore({ path: sessDir, logFn: () => {}, retries: 0, ttl: 7 * 24 * 3600 });
  console.log('📁 Sessões salvas em', sessDir);
} catch (e) {
  console.log('⚠️ file-store indisponível, usando memória:', e.message);
}
app.use(session({
  secret: 'zapsocial-super-secret-2026',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: { maxAge: 7*24*3600*1000, httpOnly: true }
}));
app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Não autenticado' });
  const user = db.users.find(u => u.id === req.session.userId);
  if (!user) return res.status(401).json({ error: 'Sessão inválida' });
  req.user = user;
  next();
}
function touchSeen(user) { user.last_seen = new Date().toISOString(); }
function findFriendship(a, b) {
  return db.friendships.find(f =>
    (f.requester_id === a && f.addressee_id === b) ||
    (f.requester_id === b && f.addressee_id === a)
  );
}
function membership(groupId, userId) {
  return db.group_members.find(m => m.group_id === groupId && m.user_id === userId);
}
function groupMessages(gid, hideFor) {
  return db.messages.filter(m => m.group_id === gid && (hideFor === undefined || msgVisibleTo(m, hideFor)))
    .sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
}
function validFile(p, max) {
  if (typeof p !== 'string') return 'invalid';
  if (!p.startsWith('data:') || p.indexOf('base64,') < 0) return 'invalid';
  if (p.length > max) return 'big';
  return p;
}
function fmtDur(s) {
  s = Math.max(0, Math.round(Number(s) || 0));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function nickFor(meId, friendId) {
  const n = db.nicknames.find(x => x.user_id === meId && x.friend_id === friendId);
  return n ? n.nickname : null;
}
function parseAttachment(body) {
  const { image, type, file_name, mime, file_size, duration } = body;
  if (!image) {
    if (type === 'call') return { msgType: 'call', payload: null };
    if (type === 'poll') {
      const p = body.poll || {};
      const q = String(p.question || '').trim().slice(0, 200);
      const opts = Array.isArray(p.options)
        ? p.options.map(o => String((o && o.text !== undefined) ? o.text : o).trim().slice(0, 80)).filter(Boolean)
        : [];
      if (!q || opts.length < 2 || opts.length > 8) return { error: 'Enquete inválida (pergunta + 2 a 8 opções).' };
      return { msgType: 'poll', payload: null, poll: { question: q, options: opts.map(t => ({ text: t, votes: [] })) } };
    }
    return { msgType: 'text', payload: null };
  }
  const t = ['image','sticker','audio','voice','video','file'].includes(type) ? type : 'image';
  const cap = t === 'sticker' ? MAX_STICKER : (t === 'image' ? MAX_CHAT_IMG : MAX_FILE);
  const v = (t === 'image' || t === 'sticker') ? validPhoto(image, cap) : validFile(image, cap);
  if (v === 'invalid') return { error: 'Arquivo inválido ou corrompido.' };
  if (v === 'big') return { error: 'Arquivo muito grande (máx ~9MB).' };
  return { msgType: t, payload: v,
    file_name: String(file_name || '').slice(0, 120) || null,
    mime: String(mime || '').slice(0, 100) || null,
    file_size: Number(file_size) || 0,
    duration: Math.max(0, Math.round(Number(duration) || 0)) };
}
function buildTopics(meId) {
  return db.topics.filter(t => t.user_id === meId).map(t => ({
    id: t.id, name: t.name, color: t.color || '#128C7E',
    items: db.topic_items.filter(i => i.topic_id === t.id).map(i => ({ kind: i.kind, ref_id: i.ref_id }))
  }));
}
function previewOf(m) {
  if (!m) return null;
  if (m.deleted) return '🚫 Mensagem apagada';
  if (m.type === 'call') return m.content;
  if (m.type === 'poll') return '📊 ' + ((m.poll && m.poll.question) || 'Enquete');
  if (m.type === 'image') return m.content ? '📷 ' + m.content : '📷 Foto';
  if (m.type === 'sticker') return '⭐ Figurinha';
  if (m.type === 'voice') return '🎤 Áudio' + (m.duration ? ' (' + fmtDur(m.duration) + ')' : '');
  if (m.type === 'audio') return '🎵 ' + (m.file_name || 'Áudio');
  if (m.type === 'video') return m.content ? '🎬 ' + m.content : '🎬 Vídeo';
  if (m.type === 'file') return '📎 ' + (m.file_name || 'Arquivo');
  return m.content;
}

// ---------- Socket: online + salas ----------
const onlineUsers = new Map();
const socketUser = new Map();

function broadcastOnline() { io.emit('online_users', Array.from(onlineUsers.keys())); }
function isOnline(userId) { return onlineUsers.has(userId); }
function emitToUser(userId, event, payload) {
  const sockets = onlineUsers.get(userId);
  if (sockets) for (const sid of sockets) io.to(sid).emit(event, payload);
}
function myGroupIds(userId) {
  return db.group_members.filter(m => m.user_id === userId).map(m => m.group_id);
}

// ---- responder / encaminhar / fixar ----
function replySnapshot(msg) {
  if (!msg) return null;
  const u = db.users.find(x => x.id === msg.sender_id);
  return {
    id: msg.id, sender_id: msg.sender_id,
    sender_name: u ? u.name : 'Alguém',
    text: String(msg.deleted ? '🚫 Mensagem apagada' : previewOf(msg)).slice(0, 140),
    type: msg.type || 'text'
  };
}
function pinsArr() { if (!db.pins) db.pins = []; return db.pins; }
function dmKey(a, b) { return Math.min(a, b) + '-' + Math.max(a, b); }
function resolvePin(pin) {
  const m = db.messages.find(x => x.id === pin.message_id);
  if (!m || m.deleted) {
    const a = pinsArr(), i = a.indexOf(pin);
    if (i >= 0) { a.splice(i, 1); saveDB(db); }
    return null;
  }
  return m;
}
function pinForDM(meId, fid) {
  const p = pinsArr().find(x => x.dm_key === dmKey(meId, fid));
  const m = p ? resolvePin(p) : null;
  return (m && msgVisibleTo(m, meId)) ? m : null;
}
function pinForGroup(gid, meId) {
  const p = pinsArr().find(x => x.group_id === gid);
  const m = p ? resolvePin(p) : null;
  return (m && msgVisibleTo(m, meId)) ? m : null;
}
function blocksArr() { if (!db.blocks) db.blocks = []; return db.blocks; }
function isBlocked(a, b) {
  return blocksArr().some(x =>
    (x.blocker_id === a && x.blocked_id === b) ||
    (x.blocker_id === b && x.blocked_id === a));
}
function msgVisibleTo(m, uid) { return !((m.deleted_for || []).includes(uid)); }
function relayCall(socket, to, event, payload) {
  const from = socketUser.get(socket.id);
  if (!from || !to) return;
  emitToUser(Number(to), event, { ...payload, from });
}
io.on('connection', (socket) => {
  socket.on('auth', (userId) => {
    userId = Number(userId);
    if (!userId) return;
    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);
    socketUser.set(socket.id, userId);
    for (const gid of myGroupIds(userId)) socket.join('group_' + gid);
    socket.emit('online_users', Array.from(onlineUsers.keys()));
    broadcastOnline();
  });
  socket.on('join_group', ({ groupId }) => {
    const uid = socketUser.get(socket.id);
    if (uid && membership(Number(groupId), uid)) socket.join('group_' + Number(groupId));
  });
  socket.on('leave_group_room', ({ groupId }) => socket.leave('group_' + Number(groupId)));
  socket.on('typing', ({ to, groupId }) => {
    const from = socketUser.get(socket.id);
    if (!from) return;
    if (groupId) {
      const u = db.users.find(x => x.id === from);
      socket.to('group_' + Number(groupId)).emit('typing_group', { from, fromName: u ? u.name : '', groupId: Number(groupId) });
    } else if (to) {
      emitToUser(Number(to), 'typing', { from });
    }
  });
  socket.on('stop_typing', ({ to, groupId }) => {
    const from = socketUser.get(socket.id);
    if (!from) return;
    if (groupId) socket.to('group_' + Number(groupId)).emit('stop_typing_group', { from, groupId: Number(groupId) });
    else if (to) emitToUser(Number(to), 'stop_typing', { from });
  });
  // ---- sinalização de chamadas (WebRTC 1-a-1) ----
  socket.on('call_invite', ({ to, sdp, callType, callId }) => {
    const from = socketUser.get(socket.id);
    if (!from || !to) return;
    const f = findFriendship(from, Number(to));
    if (!f || f.status !== 'accepted') return;
    if (isBlocked(from, Number(to))) { socket.emit('call_offline', { callId }); return; }
    if (!isOnline(Number(to))) {
      socket.emit('call_offline', { callId });
      return;
    }
    const caller = db.users.find(u => u.id === from);
    emitToUser(Number(to), 'incoming_call', { from: publicUser(caller), sdp, callType, callId });
  });
  socket.on('call_answer', ({ to, sdp, callId }) => relayCall(socket, to, 'call_answer', { sdp, callId }));
  socket.on('call_ice', ({ to, candidate, callId }) => relayCall(socket, to, 'call_ice', { candidate, callId }));
  socket.on('call_reject', ({ to, callId }) => relayCall(socket, to, 'call_rejected', { callId }));
  socket.on('call_cancel', ({ to, callId }) => relayCall(socket, to, 'call_cancelled', { callId }));
  socket.on('call_end', ({ to, callId }) => relayCall(socket, to, 'call_ended', { callId }));
  socket.on('call_busy', ({ to, callId }) => relayCall(socket, to, 'call_busy', { callId }));
  socket.on('call_reoffer', ({ to, sdp, callId }) => relayCall(socket, to, 'call_reoffer', { sdp, callId }));
  socket.on('call_reanswer', ({ to, sdp, callId }) => relayCall(socket, to, 'call_reanswer', { sdp, callId }));
  socket.on('disconnect', () => {
    const userId = socketUser.get(socket.id);
    if (userId && onlineUsers.has(userId)) {
      onlineUsers.get(userId).delete(socket.id);
      if (onlineUsers.get(userId).size === 0) {
        onlineUsers.delete(userId);
        const u = db.users.find(x => x.id === userId);
        if (u) { touchSeen(u); saveDB(db); }
      }
    }
    socketUser.delete(socket.id);
    broadcastOnline();
  });
});

// ═══════════ DISPONIBILIDADE (público, p/ checagem ao digitar) ═══════════
app.get('/api/users/check', (req, res) => {
  const username = String(req.query.username || '').trim().toLowerCase().replace('@','');
  const name = String(req.query.name || '').trim();
  const out = {};
  if (username) {
    out.username = username;
    out.usernameValid = /^[a-z0-9._]{3,25}$/.test(username);
    out.usernameTaken = out.usernameValid ? usernameTaken(username, null) : false;
  }
  if (name) {
    out.name = name;
    out.nameTaken = nameTaken(name, null);
  }
  res.json(out);
});

// ═══════════ CONTAS ═══════════
app.post('/api/register', async (req, res) => {
  try {
    let { name, username, password, bio, avatar, avatarColor, status, photo } = req.body;
    if (!name || !username || !password)
      return res.status(400).json({ error: 'Preencha nome, usuário e senha.' });
    name = String(name).trim().slice(0, 50);
    username = String(username).trim().toLowerCase().replace('@','').slice(0, 25);
    if (name.length < 2)
      return res.status(400).json({ error: 'O nome deve ter pelo menos 2 letras.' });
    if (!/^[a-z0-9._]{3,25}$/.test(username))
      return res.status(400).json({ error: 'Usuário deve ter 3-25 caracteres (letras, números, ponto e _).' });
    if (String(password).length < 4)
      return res.status(400).json({ error: 'A senha deve ter pelo menos 4 caracteres.' });
    if (usernameTaken(username, null))
      return res.status(400).json({ error: '⛔ Esse @usuário já está em uso. Escolha outro!' });
    if (nameTaken(name, null))
      return res.status(400).json({ error: '⛔ Já existe uma conta com esse nome. Escolha outro nome!' });
    const ph = validPhoto(photo, MAX_PHOTO);
    if (ph === 'invalid') return res.status(400).json({ error: 'Foto inválida.' });
    if (ph === 'big') return res.status(400).json({ error: 'Foto muito grande. Escolha uma imagem menor.' });

    const hash = await bcrypt.hash(String(password), 10);
    const user = {
      id: db.seq.user++,
      name, username, password_hash: hash,
      bio: String(bio || '').slice(0, 160),
      avatar: String(avatar || '😀').slice(0, 8),
      avatarColor: String(avatarColor || '#25D366').slice(0, 20),
      photo: ph,
      status: String(status || 'Olá! Estou usando o ZapFamily 👋').slice(0, 120),
      created_at: new Date().toISOString(),
      last_seen: new Date().toISOString()
    };
    db.users.push(user);
    saveDB(db);
    req.session.userId = user.id;
    res.json({ user: publicUser(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao criar conta.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    let { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Informe usuário e senha.' });
    username = String(username).trim().toLowerCase().replace('@','');
    const user = db.users.find(u => u.username === username);
    if (!user) return res.status(400).json({ error: 'Usuário não encontrado.' });
    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) return res.status(400).json({ error: 'Senha incorreta.' });
    req.session.userId = user.id;
    touchSeen(user); saveDB(db);
    res.json({ user: publicUser(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao entrar.' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', requireAuth, (req, res) => {
  touchSeen(req.user);
  res.json({ user: publicUser(req.user) });
});

app.put('/api/me', requireAuth, (req, res) => {
  const { name, bio, avatar, avatarColor, status, photo, removePhoto } = req.body;
  if (name !== undefined) {
    const n = String(name).trim().slice(0, 50);
    if (n.length < 2) return res.status(400).json({ error: 'O nome deve ter pelo menos 2 letras.' });
    if (nameTaken(n, req.user.id))
      return res.status(400).json({ error: '⛔ Já existe uma conta com esse nome. Escolha outro!' });
    req.user.name = n;
  }
  if (bio !== undefined) req.user.bio = String(bio).slice(0, 160);
  if (avatar !== undefined) req.user.avatar = String(avatar).slice(0, 8);
  if (avatarColor !== undefined) req.user.avatarColor = String(avatarColor).slice(0, 20);
  if (status !== undefined) req.user.status = String(status).slice(0, 120);
  if (removePhoto) req.user.photo = null;
  else if (photo !== undefined && photo !== null && photo !== '') {
    const ph = validPhoto(photo, MAX_PHOTO);
    if (ph === 'invalid') return res.status(400).json({ error: 'Foto inválida.' });
    if (ph === 'big') return res.status(400).json({ error: 'Foto muito grande (máx ~600KB).' });
    req.user.photo = ph;
  }
  touchSeen(req.user);
  saveDB(db);
  res.json({ user: publicUser(req.user) });
});

app.put('/api/password', requireAuth, async (req, res) => {
  const { current, next } = req.body;
  if (!current || !next) return res.status(400).json({ error: 'Informe a senha atual e a nova.' });
  const ok = await bcrypt.compare(String(current), req.user.password_hash);
  if (!ok) return res.status(400).json({ error: 'Senha atual incorreta.' });
  if (String(next).length < 4) return res.status(400).json({ error: 'Nova senha muito curta.' });
  req.user.password_hash = await bcrypt.hash(String(next), 10);
  saveDB(db);
  res.json({ ok: true });
});

// ═══════════ BUSCA & AMIZADES ═══════════
app.get('/api/users/search', requireAuth, (req, res) => {
  // pesquisa tolerante: ignora maiúsculas, acentos e @ (acha "João" digitando "joao")
  const q = norm(req.query.q).trim().replace(/^@+/, '');
  if (q.length < 2) return res.json({ users: [] });
  let list = db.users.filter(u => u.id !== req.user.id && !isBlocked(req.user.id, u.id));
  list = list.filter(u =>
    norm(u.name) === q || norm(u.username) === q
  );
  const result = list.slice(0, 30).map(u => {
    const f = findFriendship(req.user.id, u.id);
    let relation = 'none';
    if (f) {
      if (f.status === 'accepted') relation = 'friend';
      else if (f.requester_id === req.user.id) relation = 'sent';
      else relation = 'received';
    }
    return { ...publicUser(u), relation, online: isOnline(u.id) };
  });
  res.json({ users: result });
});

app.get('/api/users/:id', requireAuth, (req, res) => {
  const u = db.users.find(x => x.id === Number(req.params.id));
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });
  const f = findFriendship(req.user.id, u.id);
  let relation = 'none';
  if (u.id === req.user.id) relation = 'self';
  else if (f) {
    if (f.status === 'accepted') relation = 'friend';
    else if (f.requester_id === req.user.id) relation = 'sent';
    else relation = 'received';
  }
  res.json({ user: { ...publicUser(u), relation, online: isOnline(u.id), nickname: nickFor(req.user.id, u.id) } });
});

app.get('/api/friends', requireAuth, (req, res) => {
  const rels = db.friendships.filter(f =>
    f.status === 'accepted' && (f.requester_id === req.user.id || f.addressee_id === req.user.id)
  );
  const friends = rels.map(f => {
    const fid = f.requester_id === req.user.id ? f.addressee_id : f.requester_id;
    const u = db.users.find(x => x.id === fid);
    if (!u) return null;
    const conv = db.messages.filter(m =>
      !m.group_id && msgVisibleTo(m, req.user.id) &&
      ((m.sender_id === req.user.id && m.receiver_id === fid) ||
       (m.sender_id === fid && m.receiver_id === req.user.id))
    ).sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    const vis = conv.filter(m => !m.deleted);
    const last = vis[vis.length - 1] || null;
    const unread = conv.filter(m => m.receiver_id === req.user.id && !m.read && !m.deleted).length;
    return { ...publicUser(u), online: isOnline(u.id), friendship_id: f.id,
      nickname: nickFor(req.user.id, fid),
      last_message: last, last_preview: last ? previewOf(last) : null,
      unread, friends_since: f.created_at };
  }).filter(Boolean).sort((a,b) => {
    const ta = a.last_message ? new Date(a.last_message.created_at) : new Date(a.friends_since);
    const tb = b.last_message ? new Date(b.last_message.created_at) : new Date(b.friends_since);
    return tb - ta;
  });
  res.json({ friends });
});

app.get('/api/requests', requireAuth, (req, res) => {
  const received = db.friendships
    .filter(f => f.status === 'pending' && f.addressee_id === req.user.id)
    .map(f => ({ id: f.id, created_at: f.created_at, user: publicUser(db.users.find(u => u.id === f.requester_id)) }));
  const sent = db.friendships
    .filter(f => f.status === 'pending' && f.requester_id === req.user.id)
    .map(f => ({ id: f.id, created_at: f.created_at, user: publicUser(db.users.find(u => u.id === f.addressee_id)) }));
  res.json({ received, sent });
});

app.post('/api/friends/request', requireAuth, (req, res) => {
  let { username, user_id } = req.body;
  let target = null;
  if (user_id) target = db.users.find(u => u.id === Number(user_id));
  else if (username) {
    username = String(username).trim().toLowerCase().replace('@','');
    target = db.users.find(u => u.username === username);
  }
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado.' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'Você não pode adicionar a si mesmo.' });
  if (isBlocked(req.user.id, target.id)) return res.status(403).json({ error: 'Não é possível adicionar (bloqueio).' });
  const existing = findFriendship(req.user.id, target.id);
  if (existing) {
    if (existing.status === 'accepted') return res.status(400).json({ error: 'Vocês já são amigos.' });
    if (existing.requester_id === req.user.id) return res.status(400).json({ error: 'Pedido já enviado. Aguarde a resposta.' });
    return res.status(400).json({ error: 'Essa pessoa já te enviou um pedido. Aceite na aba Pedidos.' });
  }
  const f = { id: db.seq.friendship++, requester_id: req.user.id, addressee_id: target.id,
    status: 'pending', created_at: new Date().toISOString() };
  db.friendships.push(f);
  saveDB(db);
  emitToUser(target.id, 'friend_request', { from: publicUser(req.user) });
  res.json({ ok: true, request: f });
});

app.post('/api/friends/respond', requireAuth, (req, res) => {
  const { request_id, action } = req.body;
  const f = db.friendships.find(x => x.id === Number(request_id) && x.addressee_id === req.user.id && x.status === 'pending');
  if (!f) return res.status(404).json({ error: 'Pedido não encontrado.' });
  if (action === 'accept') {
    f.status = 'accepted';
    f.created_at = new Date().toISOString();
    saveDB(db);
    emitToUser(f.requester_id, 'request_accepted', { by: publicUser(req.user) });
    res.json({ ok: true, status: 'accepted' });
  } else {
    db.friendships = db.friendships.filter(x => x.id !== f.id);
    saveDB(db);
    emitToUser(f.requester_id, 'request_rejected', { by: publicUser(req.user) });
    res.json({ ok: true, status: 'rejected' });
  }
});

app.delete('/api/requests/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const f = db.friendships.find(x => x.id === id && x.requester_id === req.user.id && x.status === 'pending');
  if (!f) return res.status(404).json({ error: 'Pedido não encontrado.' });
  db.friendships = db.friendships.filter(x => x.id !== id);
  saveDB(db);
  res.json({ ok: true });
});

app.delete('/api/friends/:id', requireAuth, (req, res) => {
  const fid = Number(req.params.id);
  const before = db.friendships.length;
  db.friendships = db.friendships.filter(f =>
    !(f.status === 'accepted' &&
      ((f.requester_id === req.user.id && f.addressee_id === fid) ||
       (f.requester_id === fid && f.addressee_id === req.user.id)))
  );
  if (db.friendships.length === before) return res.status(404).json({ error: 'Amizade não encontrada.' });
  saveDB(db);
  res.json({ ok: true });
});

// ═══════════ MENSAGENS 1-A-1 ═══════════
app.get('/api/messages/:friendId', requireAuth, (req, res) => {
  const fid = Number(req.params.friendId);
  const f = db.friendships.find(x =>
    x.status === 'accepted' &&
    ((x.requester_id === req.user.id && x.addressee_id === fid) ||
     (x.requester_id === fid && x.addressee_id === req.user.id))
  );
  if (!f) return res.status(403).json({ error: 'Vocês precisam ser amigos para conversar.' });
  const conv = db.messages.filter(m =>
    !m.group_id && msgVisibleTo(m, req.user.id) &&
    ((m.sender_id === req.user.id && m.receiver_id === fid) ||
     (m.sender_id === fid && m.receiver_id === req.user.id))
  ).sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
  let changed = false;
  for (const m of conv) {
    if (m.receiver_id === req.user.id && !m.read) { m.read = true; changed = true; }
  }
  if (changed) {
    saveDB(db);
    emitToUser(fid, 'messages_read', { by: req.user.id });
  }
  res.json({ messages: conv, pin: pinForDM(req.user.id, fid) });
});

app.post('/api/messages', requireAuth, (req, res) => {
  const { receiver_id, content, image } = req.body;
  const rid = Number(receiver_id);
  const text = String(content || '').trim().slice(0, 2000);
  const target = db.users.find(u => u.id === rid);
  if (!target) return res.status(404).json({ error: 'Destinatário não encontrado.' });
  const f = findFriendship(req.user.id, rid);
  if (!f || f.status !== 'accepted')
    return res.status(403).json({ error: 'Adicione como amigo antes de conversar.' });
  if (isBlocked(req.user.id, rid))
    return res.status(403).json({ error: 'Não é possível conversar (bloqueio).' });
  const att = parseAttachment(req.body);
  if (att.error) return res.status(400).json({ error: att.error });
  if (att.msgType === 'text' && !text) return res.status(400).json({ error: 'Mensagem vazia.' });
  let reply = null;
  if (req.body.reply_to) {
    const rm = db.messages.find(x => x.id === Number(req.body.reply_to));
    if (rm && !rm.group_id &&
        ((rm.sender_id === req.user.id && rm.receiver_id === rid) ||
         (rm.sender_id === rid && rm.receiver_id === req.user.id)))
      reply = replySnapshot(rm);
  }
  const msg = {
    id: db.seq.message++, sender_id: req.user.id, receiver_id: rid, group_id: null,
    type: att.msgType, content: text, image: att.payload,
    file_name: att.file_name || null, mime: att.mime || null,
    file_size: att.file_size || 0, duration: att.duration || 0,
    reply, forwarded: !!req.body.forwarded, poll: att.poll || null,
    created_at: new Date().toISOString(), read: false, reactions: {}, deleted: false
  };
  db.messages.push(msg);
  touchSeen(req.user);
  saveDB(db);
  emitToUser(rid, 'new_message', { message: msg, from: publicUser(req.user) });
  res.json({ message: msg });
});

// Apagar mensagem própria (vale p/ DM e grupo)
app.delete('/api/messages/:id', requireAuth, (req, res) => {
  const m = db.messages.find(x => x.id === Number(req.params.id));
  if (!m) return res.status(404).json({ error: 'Mensagem não encontrada.' });
  if (m.sender_id !== req.user.id) return res.status(403).json({ error: 'Você só pode apagar suas próprias mensagens.' });
  m.deleted = true; m.content = ''; m.image = null; m.reactions = {};
  saveDB(db);
  const payload = { id: m.id, group_id: m.group_id };
  if (m.group_id) io.to('group_' + m.group_id).emit('message_deleted', payload);
  else emitToUser(m.receiver_id, 'message_deleted', payload);
  res.json({ ok: true, message: m });
});

// Reagir a mensagem (liga/desliga sua reação)
app.post('/api/messages/:id/react', requireAuth, (req, res) => {
  const m = db.messages.find(x => x.id === Number(req.params.id));
  if (!m || m.deleted) return res.status(404).json({ error: 'Mensagem não encontrada.' });
  // permissão: DM (participante) ou grupo (membro)
  if (m.group_id) {
    if (!membership(m.group_id, req.user.id)) return res.status(403).json({ error: 'Você não está nesse grupo.' });
  } else {
    if (m.sender_id !== req.user.id && m.receiver_id !== req.user.id)
      return res.status(403).json({ error: 'Sem permissão.' });
  }
  const emoji = String(req.body.emoji || '').slice(0, 8);
  if (!emoji) return res.status(400).json({ error: 'Escolha um emoji.' });
  m.reactions = m.reactions || {};
  const list = m.reactions[emoji] || [];
  const i = list.indexOf(req.user.id);
  if (i >= 0) list.splice(i, 1); else list.push(req.user.id);
  if (list.length) m.reactions[emoji] = list; else delete m.reactions[emoji];
  saveDB(db);
  const payload = { id: m.id, group_id: m.group_id, reactions: m.reactions };
  if (m.group_id) io.to('group_' + m.group_id).emit('message_reaction', payload);
  else {
    const other = m.sender_id === req.user.id ? m.receiver_id : m.sender_id;
    emitToUser(other, 'message_reaction', payload);
  }
  res.json({ ok: true, reactions: m.reactions });
});

// ═══════════ GRUPOS ═══════════
function groupSummary(g, meId) {
  const members = db.group_members.filter(m => m.group_id === g.id);
  const me = members.find(m => m.user_id === meId);
  const msgs = groupMessages(g.id, meId);
  const visG = msgs.filter(m => !m.deleted);
  const last = visG[visG.length - 1] || null;
  const lastSender = last ? db.users.find(u => u.id === last.sender_id) : null;
  const unread = me ? msgs.filter(m => !m.deleted && m.id > (me.last_read_id || 0) && m.sender_id !== meId).length : 0;
  return { ...publicGroup(g),
    member_count: members.length,
    my_role: me ? me.role : null,
    members_preview: members.slice(0, 5).map(m => publicUser(db.users.find(u => u.id === m.user_id))).filter(Boolean),
    last_message: last, last_preview: last ? previewOf(last) : null,
    last_sender_name: lastSender ? lastSender.name : null,
    unread };
}

app.get('/api/groups', requireAuth, (req, res) => {
  const gids = myGroupIds(req.user.id);
  const groups = db.groups.filter(g => gids.includes(g.id))
    .map(g => groupSummary(g, req.user.id))
    .sort((a,b) => {
      const ta = a.last_message ? new Date(a.last_message.created_at) : new Date(a.created_at);
      const tb = b.last_message ? new Date(b.last_message.created_at) : new Date(b.created_at);
      return tb - ta;
    });
  res.json({ groups });
});

app.post('/api/groups', requireAuth, (req, res) => {
  let { name, description, photo, member_ids } = req.body;
  name = String(name || '').trim().slice(0, 50);
  if (name.length < 2) return res.status(400).json({ error: 'Dê um nome ao grupo (mín. 2 letras).' });
  const ph = photo ? validPhoto(photo, MAX_PHOTO) : null;
  if (ph === 'invalid') return res.status(400).json({ error: 'Foto inválida.' });
  if (ph === 'big') return res.status(400).json({ error: 'Foto muito grande.' });
  const g = { id: db.seq.group++, name,
    description: String(description || '').slice(0, 200),
    photo: ph || null, avatar: '👥', avatarColor: '#128C7E',
    created_by: req.user.id, created_at: new Date().toISOString() };
  db.groups.push(g);
  db.group_members.push({ id: db.seq.group_member++, group_id: g.id, user_id: req.user.id, role: 'admin', last_read_id: 0, joined_at: new Date().toISOString() });
  const added = [];
  for (const rawId of (member_ids || [])) {
    const uid = Number(rawId);
    const u = db.users.find(x => x.id === uid);
    if (!u || uid === req.user.id || membership(g.id, uid)) continue;
    db.group_members.push({ id: db.seq.group_member++, group_id: g.id, user_id: uid, role: 'member', last_read_id: 0, joined_at: new Date().toISOString() });
    added.push(uid);
  }
  saveDB(db);
  for (const uid of added) emitToUser(uid, 'added_to_group', { group: groupSummary(g, uid) });
  res.json({ group: groupSummary(g, req.user.id) });
});

app.get('/api/groups/:id', requireAuth, (req, res) => {
  const gid = Number(req.params.id);
  const g = db.groups.find(x => x.id === gid);
  if (!g || !membership(gid, req.user.id)) return res.status(404).json({ error: 'Grupo não encontrado.' });
  const members = db.group_members.filter(m => m.group_id === gid).map(m => ({
    ...publicUser(db.users.find(u => u.id === m.user_id)),
    nickname: nickFor(req.user.id, m.user_id),
    role: m.role, online: isOnline(m.user_id), joined_at: m.joined_at
  })).filter(m => m.id);
  res.json({ group: { ...publicGroup(g), members, my_role: membership(gid, req.user.id).role } });
});

app.put('/api/groups/:id', requireAuth, (req, res) => {
  const gid = Number(req.params.id);
  const g = db.groups.find(x => x.id === gid);
  const me = membership(gid, req.user.id);
  if (!g || !me) return res.status(404).json({ error: 'Grupo não encontrado.' });
  if (me.role !== 'admin') return res.status(403).json({ error: 'Só administradores podem editar o grupo.' });
  const { name, description, photo, removePhoto } = req.body;
  if (name !== undefined) {
    const n = String(name).trim().slice(0, 50);
    if (n.length < 2) return res.status(400).json({ error: 'Nome muito curto.' });
    g.name = n;
  }
  if (description !== undefined) g.description = String(description).slice(0, 200);
  if (removePhoto) g.photo = null;
  else if (photo) {
    const ph = validPhoto(photo, MAX_PHOTO);
    if (ph === 'invalid') return res.status(400).json({ error: 'Foto inválida.' });
    if (ph === 'big') return res.status(400).json({ error: 'Foto muito grande.' });
    g.photo = ph;
  }
  saveDB(db);
  io.to('group_' + gid).emit('group_updated', { group: publicGroup(g) });
  res.json({ group: publicGroup(g) });
});

app.post('/api/groups/:id/members', requireAuth, (req, res) => {
  const gid = Number(req.params.id);
  const g = db.groups.find(x => x.id === gid);
  const me = membership(gid, req.user.id);
  if (!g || !me) return res.status(404).json({ error: 'Grupo não encontrado.' });
  if (me.role !== 'admin') return res.status(403).json({ error: 'Só administradores podem adicionar membros.' });
  let target = null;
  if (req.body.user_id) target = db.users.find(u => u.id === Number(req.body.user_id));
  else if (req.body.username) target = db.users.find(u => u.username === String(req.body.username).trim().toLowerCase().replace('@',''));
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado.' });
  if (membership(gid, target.id)) return res.status(400).json({ error: 'Essa pessoa já está no grupo.' });
  db.group_members.push({ id: db.seq.group_member++, group_id: gid, user_id: target.id, role: 'member', last_read_id: 0, joined_at: new Date().toISOString() });
  saveDB(db);
  emitToUser(target.id, 'added_to_group', { group: groupSummary(g, target.id) });
  io.to('group_' + gid).emit('group_updated', { group: publicGroup(g) });
  res.json({ ok: true });
});

app.delete('/api/groups/:id/members/:userId', requireAuth, (req, res) => {
  const gid = Number(req.params.id);
  const uid = Number(req.params.userId);
  const g = db.groups.find(x => x.id === gid);
  const me = membership(gid, req.user.id);
  if (!g || !me) return res.status(404).json({ error: 'Grupo não encontrado.' });
  const isSelf = uid === req.user.id;
  if (!isSelf && me.role !== 'admin') return res.status(403).json({ error: 'Só administradores podem remover membros.' });
  if (!membership(gid, uid)) return res.status(404).json({ error: 'Membro não encontrado.' });
  db.group_members = db.group_members.filter(m => !(m.group_id === gid && m.user_id === uid));
  // se saiu o último admin, promove o mais antigo
  const rest = db.group_members.filter(m => m.group_id === gid);
  if (rest.length && !rest.some(m => m.role === 'admin')) {
    rest.sort((a,b) => new Date(a.joined_at) - new Date(b.joined_at));
    rest[0].role = 'admin';
  }
  // se não sobrou ninguém, apaga o grupo
  if (!rest.length) {
    db.groups = db.groups.filter(x => x.id !== gid);
    db.messages = db.messages.filter(m => m.group_id !== gid);
    saveDB(db);
    io.to('group_' + gid).emit('group_deleted', { groupId: gid });
    return res.json({ ok: true, deleted: true });
  }
  saveDB(db);
  emitToUser(uid, 'removed_from_group', { groupId: gid, groupName: g.name });
  io.to('group_' + gid).emit('group_updated', { group: publicGroup(g) });
  res.json({ ok: true });
});

app.delete('/api/groups/:id', requireAuth, (req, res) => {
  const gid = Number(req.params.id);
  const g = db.groups.find(x => x.id === gid);
  const me = membership(gid, req.user.id);
  if (!g || !me) return res.status(404).json({ error: 'Grupo não encontrado.' });
  if (me.role !== 'admin') return res.status(403).json({ error: 'Só administradores podem apagar o grupo.' });
  db.groups = db.groups.filter(x => x.id !== gid);
  db.group_members = db.group_members.filter(m => m.group_id !== gid);
  db.messages = db.messages.filter(m => m.group_id !== gid);
  saveDB(db);
  io.to('group_' + gid).emit('group_deleted', { groupId: gid });
  res.json({ ok: true });
});

app.get('/api/groups/:id/messages', requireAuth, (req, res) => {
  const gid = Number(req.params.id);
  const me = membership(gid, req.user.id);
  if (!me) return res.status(403).json({ error: 'Você não está nesse grupo.' });
  const msgs = groupMessages(gid, req.user.id);
  if (msgs.length) {
    me.last_read_id = msgs[msgs.length - 1].id;
    saveDB(db);
  }
  const senders = {};
  for (const m of msgs) {
    if (!senders[m.sender_id]) {
      const u = db.users.find(x => x.id === m.sender_id);
      if (u) senders[m.sender_id] = { ...publicUser(u), nickname: nickFor(req.user.id, u.id) };
    }
  }
  res.json({ messages: msgs, senders, pin: pinForGroup(gid, req.user.id) });
});

app.post('/api/groups/:id/messages', requireAuth, (req, res) => {
  const gid = Number(req.params.id);
  const me = membership(gid, req.user.id);
  if (!me) return res.status(403).json({ error: 'Você não está nesse grupo.' });
  const text = String(req.body.content || '').trim().slice(0, 2000);
  const att = parseAttachment(req.body);
  if (att.error) return res.status(400).json({ error: att.error });
  if (att.msgType === 'text' && !text) return res.status(400).json({ error: 'Mensagem vazia.' });
  let reply = null;
  if (req.body.reply_to) {
    const rm = db.messages.find(x => x.id === Number(req.body.reply_to));
    if (rm && rm.group_id === gid) reply = replySnapshot(rm);
  }
  const msg = {
    id: db.seq.message++, sender_id: req.user.id, receiver_id: null, group_id: gid,
    type: att.msgType, content: text, image: att.payload,
    file_name: att.file_name || null, mime: att.mime || null,
    file_size: att.file_size || 0, duration: att.duration || 0,
    reply, forwarded: !!req.body.forwarded, poll: att.poll || null,
    created_at: new Date().toISOString(), read: true, reactions: {}, deleted: false
  };
  db.messages.push(msg);
  me.last_read_id = msg.id;
  touchSeen(req.user);
  saveDB(db);
  const g = db.groups.find(x => x.id === gid);
  io.to('group_' + gid).emit('new_group_message', { message: msg, sender: publicUser(req.user), group: publicGroup(g) });
  res.json({ message: msg });
});

// ═══════════ BLOQUEIO ═══════════
app.get('/api/blocks', requireAuth, (req, res) => {
  res.json({ blocked: blocksArr().filter(x => x.blocker_id === req.user.id).map(x => x.blocked_id) });
});
app.post('/api/blocks', requireAuth, (req, res) => {
  const tid = Number(req.body.user_id);
  const target = db.users.find(u => u.id === tid);
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado.' });
  if (tid === req.user.id) return res.status(400).json({ error: 'Você não pode bloquear a si mesmo.' });
  const arr = blocksArr();
  if (!arr.some(x => x.blocker_id === req.user.id && x.blocked_id === tid))
    arr.push({ blocker_id: req.user.id, blocked_id: tid, created_at: new Date().toISOString() });
  saveDB(db);
  res.json({ ok: true });
});
app.delete('/api/blocks/:userId', requireAuth, (req, res) => {
  const tid = Number(req.params.userId);
  const arr = blocksArr();
  const i = arr.findIndex(x => x.blocker_id === req.user.id && x.blocked_id === tid);
  if (i >= 0) arr.splice(i, 1);
  saveDB(db);
  res.json({ ok: true });
});

// ═══════════ APAGAR PARA MIM ═══════════
app.post('/api/messages/:id/delete-for-me', requireAuth, (req, res) => {
  const m = db.messages.find(x => x.id === Number(req.params.id));
  if (!m) return res.status(404).json({ error: 'Mensagem não encontrada.' });
  if (m.group_id) {
    if (!membership(m.group_id, req.user.id)) return res.status(403).json({ error: 'Você não está nesse grupo.' });
  } else {
    if (m.sender_id !== req.user.id && m.receiver_id !== req.user.id)
      return res.status(403).json({ error: 'Sem permissão.' });
  }
  m.deleted_for = m.deleted_for || [];
  if (!m.deleted_for.includes(req.user.id)) m.deleted_for.push(req.user.id);
  saveDB(db);
  res.json({ ok: true });
});

// ═══════════ EDITAR MENSAGEM ═══════════
app.put('/api/messages/:id', requireAuth, (req, res) => {
  const m = db.messages.find(x => x.id === Number(req.params.id));
  if (!m || m.deleted) return res.status(404).json({ error: 'Mensagem não encontrada.' });
  if (m.sender_id !== req.user.id) return res.status(403).json({ error: 'Só o autor pode editar.' });
  if (!['text','image','video','audio','file'].includes(m.type))
    return res.status(400).json({ error: 'Essa mensagem não pode ser editada.' });
  if (Date.now() - new Date(m.created_at).getTime() > 15 * 60 * 1000)
    return res.status(400).json({ error: 'Só dá para editar até 15 minutos depois.' });
  const text = String(req.body.content || '').trim().slice(0, 2000);
  if (m.type === 'text' && !text) return res.status(400).json({ error: 'Mensagem vazia.' });
  m.content = text;
  m.edited = true;
  saveDB(db);
  if (m.group_id) io.to('group_' + m.group_id).emit('message_edited', { message: m });
  else emitToUser(m.receiver_id, 'message_edited', { message: m });
  res.json({ message: m });
});

// ═══════════ VOTAR EM ENQUETE ═══════════
app.post('/api/messages/:id/vote', requireAuth, (req, res) => {
  const m = db.messages.find(x => x.id === Number(req.params.id));
  if (!m || m.deleted || m.type !== 'poll' || !m.poll)
    return res.status(404).json({ error: 'Enquete não encontrada.' });
  if (m.group_id) {
    if (!membership(m.group_id, req.user.id)) return res.status(403).json({ error: 'Você não está nesse grupo.' });
  } else {
    if (m.sender_id !== req.user.id && m.receiver_id !== req.user.id)
      return res.status(403).json({ error: 'Sem permissão.' });
  }
  const idx = Number(req.body.option);
  if (!Number.isInteger(idx) || idx < 0 || idx >= m.poll.options.length)
    return res.status(400).json({ error: 'Opção inválida.' });
  const had = (m.poll.options[idx].votes || []).includes(req.user.id);
  for (const o of m.poll.options) o.votes = (o.votes || []).filter(v => v !== req.user.id);
  if (!had) m.poll.options[idx].votes.push(req.user.id);
  saveDB(db);
  if (m.group_id) io.to('group_' + m.group_id).emit('poll_voted', { message: m });
  else emitToUser(m.receiver_id === req.user.id ? m.sender_id : m.receiver_id, 'poll_voted', { message: m });
  res.json({ poll: m.poll });
});

// ═══════════ STATUS 24H ═══════════
function statusesArr() { if (!db.statuses) db.statuses = []; return db.statuses; }
function purgeStatuses() {
  const cut = Date.now() - 24 * 3600 * 1000;
  const a = statusesArr();
  const before = a.length;
  for (let i = a.length - 1; i >= 0; i--)
    if (new Date(a[i].created_at).getTime() < cut) a.splice(i, 1);
  if (a.length !== before) saveDB(db);
}
app.post('/api/status', requireAuth, (req, res) => {
  const kind = String(req.body.kind || 'image');
  let image = null, text = '', bgcolor = '#075E54';
  if (kind === 'text') {
    text = String(req.body.text || '').trim().slice(0, 200);
    if (!text) return res.status(400).json({ error: 'Escreva algo.' });
    if (/^#[0-9a-fA-F]{6}$/.test(String(req.body.bgcolor || ''))) bgcolor = req.body.bgcolor;
  } else if (kind === 'image' || kind === 'video') {
    const v = kind === 'image' ? validPhoto(req.body.image, MAX_CHAT_IMG) : validFile(req.body.image, MAX_FILE);
    if (v === 'invalid') return res.status(400).json({ error: 'Arquivo inválido.' });
    if (v === 'big') return res.status(400).json({ error: 'Arquivo muito grande.' });
    image = v;
  } else return res.status(400).json({ error: 'Tipo inválido.' });
  const st = { id: db.seq.status++, user_id: req.user.id, kind, image, text, bgcolor,
    caption: String(req.body.caption || '').slice(0, 200),
    created_at: new Date().toISOString(), views: [] };
  statusesArr().push(st);
  purgeStatuses();
  saveDB(db);
  res.json({ status: st });
});
app.get('/api/status', requireAuth, (req, res) => {
  purgeStatuses();
  const friendIds = new Set(db.friendships.filter(f => f.status === 'accepted' &&
    (f.requester_id === req.user.id || f.addressee_id === req.user.id))
    .map(f => f.requester_id === req.user.id ? f.addressee_id : f.requester_id));
  const items = statusesArr().filter(s => s.user_id === req.user.id || friendIds.has(s.user_id))
    .sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
  const lite = (s) => ({ id: s.id, user_id: s.user_id, kind: s.kind, text: s.text || '',
    bgcolor: s.bgcolor || '#075E54', caption: s.caption || '', created_at: s.created_at,
    viewsCount: (s.views || []).length, viewed: (s.views || []).includes(req.user.id) });
  const mine = items.filter(s => s.user_id === req.user.id).map(lite);
  const byUser = {};
  for (const s of items.filter(s => s.user_id !== req.user.id))
    (byUser[s.user_id] = byUser[s.user_id] || []).push(lite(s));
  const friends = Object.entries(byUser).map(([uid, list]) => {
    const u = db.users.find(x => x.id === Number(uid));
    return u ? { user: { ...publicUser(u), nickname: nickFor(req.user.id, u.id) }, items: list } : null;
  }).filter(Boolean);
  res.json({ mine, friends });
});
app.get('/api/status/:id', requireAuth, (req, res) => {
  const s = statusesArr().find(x => x.id === Number(req.params.id));
  if (!s || (Date.now() - new Date(s.created_at).getTime() > 24 * 3600 * 1000))
    return res.status(404).json({ error: 'Status não encontrado.' });
  const isMine = s.user_id === req.user.id;
  const f = findFriendship(req.user.id, s.user_id);
  if (!isMine && (!f || f.status !== 'accepted')) return res.status(403).json({ error: 'Sem permissão.' });
  if (!isMine) {
    s.views = s.views || [];
    if (!s.views.includes(req.user.id)) { s.views.push(req.user.id); saveDB(db); }
  }
  const u = db.users.find(x => x.id === s.user_id);
  const out = { ...s, user: u ? publicUser(u) : null };
  if (isMine) out.viewers = (s.views || []).map(vid => publicUser(db.users.find(x => x.id === vid))).filter(Boolean);
  else delete out.views;
  res.json({ status: out });
});
app.delete('/api/status/:id', requireAuth, (req, res) => {
  const a = statusesArr();
  const i = a.findIndex(x => x.id === Number(req.params.id));
  if (i < 0) return res.status(404).json({ error: 'Status não encontrado.' });
  if (a[i].user_id !== req.user.id) return res.status(403).json({ error: 'Só o autor pode apagar.' });
  a.splice(i, 1);
  saveDB(db);
  res.json({ ok: true });
});

// ═══════════ FIXADAS ═══════════
app.get('/api/pins/dm/:userId', requireAuth, (req, res) => {
  const fid = Number(req.params.userId);
  const f = findFriendship(req.user.id, fid);
  if (!f || f.status !== 'accepted') return res.status(403).json({ error: 'Vocês precisam ser amigos.' });
  res.json({ pin: pinForDM(req.user.id, fid) });
});
app.post('/api/pins/dm/:userId', requireAuth, (req, res) => {
  const fid = Number(req.params.userId);
  const f = findFriendship(req.user.id, fid);
  if (!f || f.status !== 'accepted') return res.status(403).json({ error: 'Vocês precisam ser amigos.' });
  const m = db.messages.find(x => x.id === Number(req.body.message_id));
  if (!m || m.deleted || m.group_id ||
      !((m.sender_id === req.user.id && m.receiver_id === fid) ||
        (m.sender_id === fid && m.receiver_id === req.user.id)))
    return res.status(404).json({ error: 'Mensagem não encontrada nessa conversa.' });
  const arr = pinsArr();
  for (let i = arr.length - 1; i >= 0; i--)
    if (arr[i].dm_key === dmKey(req.user.id, fid)) arr.splice(i, 1);
  arr.push({ dm_key: dmKey(req.user.id, fid), group_id: null, message_id: m.id, pinned_by: req.user.id, created_at: new Date().toISOString() });
  saveDB(db);
  emitToUser(fid, 'message_pinned', { dm_with: req.user.id, pin: m });
  res.json({ pin: m });
});
app.delete('/api/pins/dm/:userId', requireAuth, (req, res) => {
  const fid = Number(req.params.userId);
  const f = findFriendship(req.user.id, fid);
  if (!f || f.status !== 'accepted') return res.status(403).json({ error: 'Vocês precisam ser amigos.' });
  const arr = pinsArr();
  const i = arr.findIndex(x => x.dm_key === dmKey(req.user.id, fid));
  if (i >= 0) arr.splice(i, 1);
  saveDB(db);
  emitToUser(fid, 'message_unpinned', { dm_with: req.user.id });
  res.json({ ok: true });
});
app.get('/api/pins/group/:groupId', requireAuth, (req, res) => {
  const gid = Number(req.params.groupId);
  if (!membership(gid, req.user.id)) return res.status(403).json({ error: 'Você não está nesse grupo.' });
  res.json({ pin: pinForGroup(gid, req.user.id) });
});
app.post('/api/pins/group/:groupId', requireAuth, (req, res) => {
  const gid = Number(req.params.groupId);
  if (!membership(gid, req.user.id)) return res.status(403).json({ error: 'Você não está nesse grupo.' });
  const m = db.messages.find(x => x.id === Number(req.body.message_id));
  if (!m || m.deleted || m.group_id !== gid)
    return res.status(404).json({ error: 'Mensagem não encontrada nesse grupo.' });
  const arr = pinsArr();
  for (let i = arr.length - 1; i >= 0; i--)
    if (arr[i].group_id === gid) arr.splice(i, 1);
  arr.push({ dm_key: null, group_id: gid, message_id: m.id, pinned_by: req.user.id, created_at: new Date().toISOString() });
  saveDB(db);
  io.to('group_' + gid).emit('message_pinned', { group_id: gid, pin: m });
  res.json({ pin: m });
});
app.delete('/api/pins/group/:groupId', requireAuth, (req, res) => {
  const gid = Number(req.params.groupId);
  if (!membership(gid, req.user.id)) return res.status(403).json({ error: 'Você não está nesse grupo.' });
  const arr = pinsArr();
  const i = arr.findIndex(x => x.group_id === gid);
  if (i >= 0) arr.splice(i, 1);
  saveDB(db);
  io.to('group_' + gid).emit('message_unpinned', { group_id: gid });
  res.json({ ok: true });
});

// ═══════════ SYNC (tudo de uma vez — usado pela atualização automática) ═══════════
function buildFriendsList(meId) {
  const rels = db.friendships.filter(f =>
    f.status === 'accepted' && (f.requester_id === meId || f.addressee_id === meId)
  );
  return rels.map(f => {
    const fid = f.requester_id === meId ? f.addressee_id : f.requester_id;
    const u = db.users.find(x => x.id === fid);
    if (!u) return null;
    const conv = db.messages.filter(m =>
      !m.group_id && msgVisibleTo(m, meId) &&
      ((m.sender_id === meId && m.receiver_id === fid) ||
       (m.sender_id === fid && m.receiver_id === meId))
    ).sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    const vis = conv.filter(m => !m.deleted);
    const last = vis[vis.length - 1] || null;
    const unread = conv.filter(m => m.receiver_id === meId && !m.read && !m.deleted).length;
    return { ...publicUser(u), online: isOnline(u.id), friendship_id: f.id,
      nickname: nickFor(meId, fid),
      last_message: last, last_preview: last ? previewOf(last) : null,
      unread, friends_since: f.created_at };
  }).filter(Boolean).sort((a,b) => {
    const ta = a.last_message ? new Date(a.last_message.created_at) : new Date(a.friends_since);
    const tb = b.last_message ? new Date(b.last_message.created_at) : new Date(b.friends_since);
    return tb - ta;
  });
}
function buildGroupsList(meId) {
  const gids = myGroupIds(meId);
  return db.groups.filter(g => gids.includes(g.id))
    .map(g => groupSummary(g, meId))
    .sort((a,b) => {
      const ta = a.last_message ? new Date(a.last_message.created_at) : new Date(a.created_at);
      const tb = b.last_message ? new Date(b.last_message.created_at) : new Date(b.created_at);
      return tb - ta;
    });
}
function buildRequests(meId) {
  const received = db.friendships
    .filter(f => f.status === 'pending' && f.addressee_id === meId)
    .map(f => ({ id: f.id, created_at: f.created_at, user: publicUser(db.users.find(u => u.id === f.requester_id)) }));
  const sent = db.friendships
    .filter(f => f.status === 'pending' && f.requester_id === meId)
    .map(f => ({ id: f.id, created_at: f.created_at, user: publicUser(db.users.find(u => u.id === f.addressee_id)) }));
  return { received, sent };
}
app.get('/api/sync', requireAuth, (req, res) => {
  touchSeen(req.user);
  res.json({
    friends: buildFriendsList(req.user.id),
    groups: buildGroupsList(req.user.id),
    requests: buildRequests(req.user.id),
    topics: buildTopics(req.user.id),
    online: Array.from(onlineUsers.keys())
  });
});

// ═══════════ TÓPICOS (listas personalizadas) ═══════════
app.get('/api/topics', requireAuth, (req, res) => {
  res.json({ topics: buildTopics(req.user.id) });
});
app.post('/api/topics', requireAuth, (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 30);
  if (!name) return res.status(400).json({ error: 'Dê um nome ao tópico.' });
  const mine = db.topics.filter(t => t.user_id === req.user.id);
  if (mine.length >= 20) return res.status(400).json({ error: 'Limite de 20 tópicos.' });
  if (mine.some(t => t.name.toLowerCase() === name.toLowerCase()))
    return res.status(400).json({ error: 'Você já tem um tópico com esse nome.' });
  const t = { id: db.seq.topic++, user_id: req.user.id, name,
    color: String(req.body.color || '#128C7E').slice(0, 20),
    created_at: new Date().toISOString() };
  db.topics.push(t); saveDB(db);
  res.json({ topic: { ...t, items: [] } });
});
app.put('/api/topics/:id', requireAuth, (req, res) => {
  const t = db.topics.find(x => x.id === Number(req.params.id) && x.user_id === req.user.id);
  if (!t) return res.status(404).json({ error: 'Tópico não encontrado.' });
  if (req.body.name !== undefined) {
    const n = String(req.body.name).trim().slice(0, 30);
    if (!n) return res.status(400).json({ error: 'Nome inválido.' });
    t.name = n;
  }
  if (req.body.color !== undefined) t.color = String(req.body.color).slice(0, 20);
  saveDB(db);
  res.json({ topic: buildTopics(req.user.id).find(x => x.id === t.id) });
});
app.delete('/api/topics/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const t = db.topics.find(x => x.id === id && x.user_id === req.user.id);
  if (!t) return res.status(404).json({ error: 'Tópico não encontrado.' });
  db.topics = db.topics.filter(x => x.id !== id);
  db.topic_items = db.topic_items.filter(i => i.topic_id !== id);
  saveDB(db);
  res.json({ ok: true });
});
app.post('/api/topics/:id/items', requireAuth, (req, res) => {
  const t = db.topics.find(x => x.id === Number(req.params.id) && x.user_id === req.user.id);
  if (!t) return res.status(404).json({ error: 'Tópico não encontrado.' });
  const { kind, ref_id } = req.body;
  const rid = Number(ref_id);
  if (kind === 'dm') {
    const u = db.users.find(x => x.id === rid);
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const f = findFriendship(req.user.id, rid);
    if (!f || f.status !== 'accepted') return res.status(403).json({ error: 'Vocês precisam ser amigos.' });
  } else if (kind === 'group') {
    if (!membership(rid, req.user.id)) return res.status(403).json({ error: 'Você não está nesse grupo.' });
  } else return res.status(400).json({ error: 'Tipo inválido.' });
  if (!db.topic_items.some(i => i.topic_id === t.id && i.kind === kind && i.ref_id === rid)) {
    db.topic_items.push({ id: db.seq.topic_item++, topic_id: t.id, kind, ref_id: rid });
    saveDB(db);
  }
  res.json({ ok: true });
});
app.delete('/api/topics/:id/items', requireAuth, (req, res) => {
  const t = db.topics.find(x => x.id === Number(req.params.id) && x.user_id === req.user.id);
  if (!t) return res.status(404).json({ error: 'Tópico não encontrado.' });
  const { kind, ref_id } = req.query;
  const rid = Number(ref_id);
  db.topic_items = db.topic_items.filter(i => !(i.topic_id === t.id && i.kind === kind && i.ref_id === rid));
  saveDB(db);
  res.json({ ok: true });
});

// ═══════════ APELIDOS ═══════════
app.put('/api/friends/:id/nickname', requireAuth, (req, res) => {
  const fid = Number(req.params.id);
  const f = findFriendship(req.user.id, fid);
  if (!f || f.status !== 'accepted') return res.status(403).json({ error: 'Vocês precisam ser amigos.' });
  const nick = String(req.body.nickname || '').trim().slice(0, 40);
  db.nicknames = db.nicknames.filter(x => !(x.user_id === req.user.id && x.friend_id === fid));
  if (nick) db.nicknames.push({ id: db.seq.nickname++, user_id: req.user.id, friend_id: fid, nickname: nick });
  saveDB(db);
  res.json({ ok: true, nickname: nick || null });
});

// ═══════════ CARGO NO GRUPO ═══════════
app.put('/api/groups/:id/members/:userId/role', requireAuth, (req, res) => {
  const gid = Number(req.params.id), uid = Number(req.params.userId);
  const me = membership(gid, req.user.id);
  if (!me) return res.status(404).json({ error: 'Grupo não encontrado.' });
  if (me.role !== 'admin') return res.status(403).json({ error: 'Só administradores podem mudar cargos.' });
  const target = membership(gid, uid);
  if (!target) return res.status(404).json({ error: 'Membro não encontrado.' });
  const role = req.body.role === 'admin' ? 'admin' : 'member';
  if (target.role !== role) {
    if (role === 'member') {
      const admins = db.group_members.filter(m => m.group_id === gid && m.role === 'admin');
      if (admins.length <= 1 && admins[0].user_id === uid)
        return res.status(400).json({ error: 'O grupo precisa de pelo menos 1 admin. Promova alguém antes.' });
    }
    target.role = role;
    saveDB(db);
  }
  const g = db.groups.find(x => x.id === gid);
  io.to('group_' + gid).emit('group_updated', { group: publicGroup(g) });
  emitToUser(uid, 'role_changed', { groupId: gid, groupName: g.name, role });
  res.json({ ok: true, role });
});

// ═══════════ FIGURINHAS ═══════════
app.get('/api/stickers', requireAuth, (req, res) => {
  res.json({ stickers: db.stickers.filter(s => s.user_id === req.user.id).sort((a, b) => b.id - a.id) });
});
app.post('/api/stickers', requireAuth, (req, res) => {
  const v = validPhoto(req.body.image, MAX_STICKER);
  if (v === 'invalid') return res.status(400).json({ error: 'Figurinha inválida. Use uma imagem.' });
  if (v === 'big') return res.status(400).json({ error: 'Figurinha muito grande.' });
  const mine = db.stickers.filter(s => s.user_id === req.user.id);
  if (mine.length >= 100) return res.status(400).json({ error: 'Limite de 100 figurinhas.' });
  const st = { id: db.seq.sticker++, user_id: req.user.id, image: v, created_at: new Date().toISOString() };
  db.stickers.push(st); saveDB(db);
  res.json({ sticker: st });
});
app.delete('/api/stickers/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const before = db.stickers.length;
  db.stickers = db.stickers.filter(s => !(s.id === id && s.user_id === req.user.id));
  if (db.stickers.length === before) return res.status(404).json({ error: 'Figurinha não encontrada.' });
  saveDB(db);
  res.json({ ok: true });
});

// ═══════════ ESTATÍSTICAS ═══════════
app.get('/api/stats', requireAuth, (req, res) => {
  const friends = db.friendships.filter(f =>
    f.status === 'accepted' && (f.requester_id === req.user.id || f.addressee_id === req.user.id)
  ).length;
  const groups = db.group_members.filter(m => m.user_id === req.user.id).length;
  const sent = db.messages.filter(m => m.sender_id === req.user.id && !m.deleted).length;
  const received = db.messages.filter(m => m.receiver_id === req.user.id && !m.deleted).length;
  res.json({ friends, groups, sent, received });
});

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🟢 ZapFamily rodando em http://0.0.0.0:${PORT}`);
});
