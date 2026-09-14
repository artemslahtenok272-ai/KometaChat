/* ============ СОСТОЯНИЕ ============ */
const state = {
  me: null,            // { uid, username, displayName, email, avatar }
  chats: [],           // список чатов
  activeChat: null,    // { id, peer } — открытый чат
  unsubChats: null,    // отписка от списка чатов
  unsubMessages: null, // отписка от сообщений
  usersCache: {}
};

/* ============ ЗВЁЗДЫ ============ */
(function stars() {
  const c = document.getElementById('stars');
  const ctx = c.getContext('2d');
  let arr = [];
  const resize = () => {
    c.width = innerWidth; c.height = innerHeight;
    arr = Array.from({ length: 90 }, () => ({
      x: Math.random() * c.width, y: Math.random() * c.height,
      r: Math.random() * 1.4 + .4, s: Math.random() * .35 + .08
    }));
  };
  const draw = () => {
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(255,255,255,.28)';
    for (const s of arr) {
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      s.y += s.s; if (s.y > c.height) { s.y = 0; s.x = Math.random() * c.width; }
    }
    requestAnimationFrame(draw);
  };
  addEventListener('resize', resize); resize(); draw();
})();

/* ============ УТИЛИТЫ ============ */
const $ = id => document.getElementById(id);
const showScreen = id => {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
};
const esc = s => { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; };
const timeStr = ts => {
  const d = ts?.toDate ? ts.toDate() : new Date(ts || Date.now());
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
};
let toastTimer;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}
function modal(title, text, onOk) {
  $('modal-title').textContent = title;
  $('modal-text').textContent = text || '';
  $('modal').classList.remove('hidden');
  $('modal-ok').onclick = () => { $('modal').classList.add('hidden'); onOk?.(); };
  $('modal-cancel').onclick = () => $('modal').classList.add('hidden');
}

/* ============ АВТОРИЗАЦИЯ (UI) ============ */
document.querySelectorAll('.seg-btn').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('.seg-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    const reg = b.dataset.mode === 'register';
    $('form-register').classList.toggle('hidden', !reg);
    $('form-login').classList.toggle('hidden', reg);
  };
});
document.querySelectorAll('.eye').forEach(b => {
  b.onclick = () => {
    const inp = $(b.dataset.toggle);
    inp.type = inp.type === 'password' ? 'text' : 'password';
  };
});
$('gen-pass').onclick = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let p = ''; for (let i = 0; i < 14; i++) p += chars[Math.floor(Math.random() * chars.length)];
  $('reg-password').value = p;
  toast('Пароль сгенерирован — сохрани его!');
};

/* ============ РЕГИСТРАЦИЯ ============ */
$('btn-register').onclick = async () => {
  const email = $('reg-email').value.trim();
  const username = $('reg-username').value.trim().toLowerCase();
  const password = $('reg-password').value;

  if (!email.toLowerCase().endsWith('@gmail.com')) return toast('Нужен Gmail');
  if (!username.startsWith('@') || username.length < 4) return toast('Username: @ и минимум 4 символа');
  if (!/^@[a-z0-9_]{3,}$/.test(username)) return toast('Только a-z, 0-9 и _');
  if (password.length < 8) return toast('Пароль минимум 8 символов');

  try {
    // Проверка что username свободен
    const exists = await db.collection('users').where('username', '==', username).limit(1).get();
    if (!exists.empty) return toast('Этот @username уже занят');

    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await db.collection('users').doc(cred.user.uid).set({
      uid: cred.user.uid,
      username,
      displayName: username.slice(1),
      email,
      avatar: '☄️',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast('Аккаунт создан ☄️');
  } catch (e) {
    console.error(e);
    toast(errMsg(e));
  }
};

/* ============ ВХОД ============ */
$('btn-login').onclick = async () => {
  const email = $('login-email').value.trim();
  const password = $('login-password').value;
  if (!email || !password) return toast('Заполни email и пароль');
  try {
    await auth.signInWithEmailAndPassword(email, password);
    toast('Выполнен вход');
  } catch (e) { toast(errMsg(e)); }
};

$('btn-reset').onclick = async () => {
  const email = $('login-email').value.trim();
  if (!email) return toast('Введи email');
  try { await auth.sendPasswordResetEmail(email); toast('Письмо отправлено'); }
  catch (e) { toast(errMsg(e)); }
};

function errMsg(e) {
  const c = e?.code || '';
  if (c.includes('email-already-in-use')) return 'Email уже используется';
  if (c.includes('invalid-email')) return 'Неверный email';
  if (c.includes('weak-password')) return 'Слабый пароль';
  if (c.includes('user-not-found')) return 'Пользователь не найден';
  if (c.includes('wrong-password') || c.includes('invalid-credential')) return 'Неверный пароль';
  if (c.includes('unauthorized-domain')) return 'Домен не разрешён в Firebase';
  if (c.includes('network')) return 'Нет сети';
  return e?.message || 'Ошибка';
}

/* ============ СОСТОЯНИЕ AUTH ============ */
auth.onAuthStateChanged(async user => {
  if (!user) {
    state.me = null;
    if (state.unsubChats) state.unsubChats();
    if (state.unsubMessages) state.unsubMessages();
    showScreen('auth-screen');
    return;
  }
  const snap = await db.collection('users').doc(user.uid).get();
  if (!snap.exists) { await auth.signOut(); return; }
  state.me = snap.data();
  renderMe();
  showScreen('main-screen');
  loadChats();
});

/* ============ ПРОФИЛЬ / SETTINGS ============ */
function renderMe() {
  $('me-avatar').textContent = state.me.avatar || '☄️';
  $('me-name').textContent = state.me.displayName;
  $('me-username').textContent = state.me.username;
  $('me-email').textContent = state.me.email;
  $('set-name').value = state.me.displayName;
  $('set-avatar').value = state.me.avatar;
}

$('btn-save-profile').onclick = async () => {
  const name = $('set-name').value.trim() || state.me.displayName;
  const avatar = $('set-avatar').value.trim() || '☄️';
  await db.collection('users').doc(state.me.uid).update({ displayName: name, avatar });
  state.me.displayName = name; state.me.avatar = avatar;
  renderMe(); toast('Профиль сохранён');
};

$('btn-logout').onclick = () => modal('Выйти?', 'Ты выйдешь из аккаунта на этом устройстве.', () => auth.signOut());
$('open-notify').onclick = () => modal('Уведомления', 'Здесь будут настройки звуков и вибро. Пока в разработке.');
$('open-privacy').onclick = () => modal('Конфиденциальность', 'Настройки приватности появятся позже.');
$('open-about').onclick = () => modal('KometaChat', 'Версия 1.0 • SwiftUI-дизайн • Firebase backend');

/* ============ НАВИГАЦИЯ ТАБОВ ============ */
document.querySelectorAll('.tab-btn').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
    $('page-' + b.dataset.page).classList.add('active');
  };
});

/* ============ СПИСОК ЧАТОВ ============ */
function loadChats() {
  if (state.unsubChats) state.unsubChats();
  state.unsubChats = db.collection('chats')
    .where('members', 'array-contains', state.me.uid)
    .orderBy('updatedAt', 'desc')
    .onSnapshot(async snap => {
      const list = [];
      for (const doc of snap.docs) {
        const data = doc.data();
        const peerUid = data.members.find(u => u !== state.me.uid);
        if (!peerUid) continue;
        const peer = await getUser(peerUid);
        list.push({ id: doc.id, peer, last: data.lastMessage || null });
      }
      state.chats = list;
      renderChats();
    }, e => { console.error(e); toast('Ошибка списка чатов'); });
}

function renderChats() {
  const q = ($('search-chats').value || '').toLowerCase();
  const filtered = state.chats.filter(c =>
    !q || c.peer.displayName.toLowerCase().includes(q) || c.peer.username.toLowerCase().includes(q)
  );
  const box = $('chat-list');
  if (!filtered.length) { box.innerHTML = `<div class="empty">Пока нет чатов.<br>Найди друга во вкладке 🔍 Поиск.</div>`; return; }
  box.innerHTML = filtered.map(c => `
    <div class="chat-row" data-chat="${c.id}">
      <div class="avatar">${esc(c.peer.avatar || '☄️')}</div>
      <div class="chat-meta">
        <div class="row"><h4>${esc(c.peer.displayName)}</h4></div>
        <p>${esc(c.last?.text || 'Нет сообщений')}</p>
      </div>
      <span class="muted small">${c.last ? timeStr(c.last.date) : ''}</span>
    </div>
  `).join('');
  box.querySelectorAll('[data-chat]').forEach(el => {
    el.onclick = () => openChat(state.chats.find(x => x.id === el.dataset.chat));
  });
}
$('search-chats').oninput = renderChats;

async function getUser(uid) {
  if (state.usersCache[uid]) return state.usersCache[uid];
  const s = await db.collection('users').doc(uid).get();
  const u = s.exists ? s.data() : { uid, displayName: 'User', username: '@user', avatar: '☄️' };
  state.usersCache[uid] = u; return u;
}

/* ============ ПОИСК ПОЛЬЗОВАТЕЛЕЙ ============ */
let searchTimer;
$('search-users').oninput = e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => searchUsers(e.target.value.trim().toLowerCase()), 300);
};

async function searchUsers(q) {
  const box = $('user-results');
  if (!q) { box.innerHTML = ''; return; }
  const norm = q.startsWith('@') ? q : '@' + q;
  box.innerHTML = `<div class="empty">Ищем…</div>`;
  try {
    const snap = await db.collection('users')
      .where('username', '>=', norm).where('username', '<=', norm + '\uf8ff').limit(15).get();
    if (snap.empty) { box.innerHTML = `<div class="empty">Никого не найдено</div>`; return; }
    box.innerHTML = snap.docs.filter(d => d.id !== state.me.uid).map(d => {
      const u = d.data();
      return `<div class="chat-row" data-uid="${u.uid}">
        <div class="avatar">${esc(u.avatar || '☄️')}</div>
        <div class="chat-meta"><h4>${esc(u.displayName)}</h4><p>${esc(u.username)}</p></div>
        <span class="round-btn ghost">💬</span>
      </div>`;
    }).join('') || `<div class="empty">Никого не найдено</div>`;

    box.querySelectorAll('[data-uid]').forEach(el => {
      el.onclick = () => startChatWith(el.dataset.uid);
    });
  } catch (e) { console.error(e); box.innerHTML = `<div class="empty">Ошибка поиска</div>`; }
}

async function startChatWith(peerUid) {
  const ids = [state.me.uid, peerUid].sort();
  const chatId = ids.join('_');
  const ref = db.collection('chats').doc(chatId);
  const doc = await ref.get();
  if (!doc.exists) {
    await ref.set({
      members: ids,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastMessage: null
    });
  }
  const peer = await getUser(peerUid);
  openChat({ id: chatId, peer });
}

/* ============ ЭКРАН ЧАТА ============ */
async function openChat(chat) {
  if (!chat) return;
  state.activeChat = chat;
  $('chat-title').textContent = chat.peer.displayName;
  $('chat-status').textContent = chat.peer.username;
  $('chat-avatar').textContent = chat.peer.avatar || '☄️';
  $('messages').innerHTML = '';
  showScreen('chat-screen');
  listenMessages(chat.id);
}

function listenMessages(chatId) {
  if (state.unsubMessages) state.unsubMessages();
  state.unsubMessages = db.collection('chats').doc(chatId)
    .collection('messages').orderBy('date', 'asc').limit(200)
    .onSnapshot(snap => {
      const box = $('messages');
      box.innerHTML = snap.docs.map(d => {
        const m = d.data();
        const mine = m.senderId === state.me.uid;
        return `<div class="msg ${mine ? 'mine' : 'theirs'}">${esc(m.text)}<span class="time">${timeStr(m.date)}</span></div>`;
      }).join('') || `<div class="empty">Начни диалог 👋</div>`;
      box.scrollTop = box.scrollHeight;
    });
}

$('btn-close-chat').onclick = () => {
  if (state.unsubMessages) { state.unsubMessages(); state.unsubMessages = null; }
  state.activeChat = null;
  showScreen('main-screen');
};

$('btn-send').onclick = sendMessage;
$('msg-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

async function sendMessage() {
  const inp = $('msg-input');
  const text = inp.value.trim();
  if (!text || !state.activeChat) return;
  inp.value = '';
  const chatId = state.activeChat.id;
  try {
    await db.collection('chats').doc(chatId).collection('messages').add({
      senderId: state.me.uid,
      text,
      date: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('chats').doc(chatId).update({
      lastMessage: { text, senderId: state.me.uid, date: firebase.firestore.FieldValue.serverTimestamp() },
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) { console.error(e); toast('Не удалось отправить'); }
}

/* ============ ЗВОНКИ ============ */
let callState = { type: 'audio', muted: false, speaker: false };

function openCall(type) {
  if (!state.activeChat) return;
  callState = { type, muted: false, speaker: false };
  $('call-avatar').textContent = state.activeChat.peer.avatar || '☄️';
  $('call-name').textContent = state.activeChat.peer.displayName;
  $('call-type').textContent = type === 'video' ? 'Видеозвонок' : 'Аудиозвонок';
  $('call-status').textContent = 'Соединение…';
  $('btn-mute').textContent = '🎤';
  $('btn-speaker').textContent = '🔊';
  showScreen('call-screen');
  setTimeout(() => { if ($('call-screen').classList.contains('active')) $('call-status').textContent = 'На связи'; }, 1500);
}
$('btn-call-audio').onclick = () => openCall('audio');
$('btn-call-video').onclick = () => openCall('video');
$('btn-mute').onclick = () => { callState.muted = !callState.muted; $('btn-mute').textContent = callState.muted ? '🔇' : '🎤'; };
$('btn-speaker').onclick = () => { callState.speaker = !callState.speaker; $('btn-speaker').textContent = callState.speaker ? '🔊' : '🔈'; };
$('btn-end').onclick = () => { showScreen('main-screen'); toast('Звонок завершён'); };

/* ============ НОВЫЙ ЧАТ ============ */
$('btn-new-chat').onclick = () => {
  document.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active'));
  document.querySelector('.tab-btn[data-page="search"]').classList.add('active');
  document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
  $('page-search').classList.add('active');
  $('search-users').focus();
};