(function () {
  'use strict';

  /* ---------- helpers ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
  const pad = n => String(n).padStart(3, '0');
  const fmtNo = n => 'A' + pad(n);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const todayKey = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const hhmm = ms => { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + '.' + String(d.getMinutes()).padStart(2, '0'); };
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  };

  const CATS = [{ id: 'nasi', label: 'Nasi & Mie' }, { id: 'camilan', label: 'Camilan' }, { id: 'minum', label: 'Minuman' }];
  const SLOTS = [{ id: 'i1', label: 'Istirahat 1', time: '09.30' }, { id: 'i2', label: 'Istirahat 2', time: '12.00' }, { id: 'pulang', label: 'Pulang sekolah', time: '14.30' }];
  const PROVIDERS = ['QRIS', 'GoPay', 'DANA', 'OVO', 'ShopeePay'];
  const STATUS = { baru: 'Menunggu penjual', diproses: 'Sedang disiapkan', siap: 'Siap diambil', selesai: 'Selesai', ditolak: 'Ditolak', dibatalkan: 'Dibatalkan' };
  const ICON = {
    nasi: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 22h36c0 10-7 18-18 18S6 32 6 22z"/><path d="M18 11c0 3 3 3 3 7M27 9c0 3 3 3 3 7"/></svg>',
    camilan: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 40L40 8"/><circle cx="17" cy="31" r="5"/><circle cx="26" cy="22" r="5"/><circle cx="35" cy="13" r="5"/></svg>',
    minum: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16h24l-3 24H15z"/><path d="M14 25h20"/><path d="M28 16l4-10h6"/></svg>'
  };

  /* contoh menu untuk mode demo (di mode tersimpan, menu dibaca dari penyimpanan bersama) */
  const DEFAULT_MENU = [
    ['nasgor', 'Nasi Goreng Telur', 13000, 'nasi', 'Nasi goreng kampung, telur mata sapi, kerupuk'],
    ['mieayam', 'Mie Ayam Bakso', 12000, 'nasi', 'Mie, ayam kecap, 3 bakso, pangsit'],
    ['geprek', 'Nasi Ayam Geprek', 14000, 'nasi', 'Ayam crispy, sambal bawang, lalapan'],
    ['soto', 'Soto Ayam', 12000, 'nasi', 'Kuah kuning, suwiran ayam, soun, nasi'],
    ['uduk', 'Nasi Uduk Komplit', 11000, 'nasi', 'Orek tempe, bihun, telur dadar, sambal kacang'],
    ['batagor', 'Batagor', 8000, 'camilan', '5 potong, bumbu kacang'],
    ['siomay', 'Siomay', 9000, 'camilan', '4 potong, kentang, kol, bumbu kacang'],
    ['tahu', 'Tahu Isi', 1500, 'camilan', 'Harga per buah, goreng hangat'],
    ['rotibakar', 'Roti Bakar Cokelat', 8000, 'camilan', 'Cokelat dan keju parut'],
    ['pisgor', 'Pisang Goreng', 5000, 'camilan', '3 potong, tepung renyah'],
    ['esteh', 'Es Teh Manis', 4000, 'minum', 'Gelas besar'],
    ['esjeruk', 'Es Jeruk', 5000, 'minum', 'Jeruk peras asli'],
    ['air', 'Air Mineral', 3000, 'minum', 'Botol 600 ml'],
    ['susucoklat', 'Susu Cokelat', 6000, 'minum', 'Dingin, kemasan kotak']
  ].map((m, i) => ({ id: m[0], name: m[1], price: m[2], cat: m[3], desc: m[4], ok: true, ord: i }));

  /* ---------- state ---------- */
  const S = {
    live: false, db: null, uid: null, canSeller: true,
    menu: [], orders: [], shop: { open: true },
    cart: {}, cat: 'all', role: 'buyer', bview: 'menu', sview: 'antrian',
    prev: null, sheet: null, busy: false, err: null, fresh: null, confirmDel: null, dirty: false,
    draft: Object.assign({ name: '', kelas: '', note: '', slot: 'i1', pay: 'cod', prov: 'QRIS' }, LS.get('kk-buyer', {})),
    seen: new Set(LS.get('kk-seen', [])),
    localNo: 4, lastFocus: null
  };
  let deviceId = LS.get('kk-dev', null);
  if (!deviceId) { deviceId = 'dv-' + Math.random().toString(36).slice(2, 10); LS.set('kk-dev', deviceId); }
  const myId = () => S.uid || deviceId;
  const isMine = o => o.buyerId === myId();
  const slotOf = id => SLOTS.find(s => s.id === id) || SLOTS[0];
  const isOpen = () => S.shop.open !== false;

  /* ---------- audio, vibration, toasts ---------- */
  let actx = null;
  function unlockAudio() {
    try {
      if (!actx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; actx = new C(); }
      if (actx.state === 'suspended') actx.resume();
    } catch (e) { }
  }
  document.addEventListener('pointerdown', unlockAudio);
  document.addEventListener('keydown', unlockAudio);
  function chime() {
    try {
      unlockAudio(); if (!actx) return;
      const t = actx.currentTime;
      [[880, 0], [1175, .16], [1568, .32]].forEach(([f, d]) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + d);
        g.gain.exponentialRampToValueAtTime(.18, t + d + .02);
        g.gain.exponentialRampToValueAtTime(.0001, t + d + .4);
        o.connect(g); g.connect(actx.destination);
        o.start(t + d); o.stop(t + d + .45);
      });
    } catch (e) { }
  }
  function buzz() { try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) { } }
  function toast(msg, opt) {
    opt = opt || {};
    const el = document.createElement('div');
    el.className = 'toast' + (opt.kind ? ' ' + opt.kind : '');
    el.setAttribute('role', 'status');
    const p = document.createElement('span'); p.textContent = msg;
    const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Tutup'; b.setAttribute('aria-label', 'Tutup pesan');
    b.addEventListener('click', () => el.remove());
    el.appendChild(p); el.appendChild(b);
    $('#toasts').appendChild(el);
    const ttl = opt.ttl == null ? 5000 : opt.ttl;
    if (ttl > 0) setTimeout(() => el.remove(), ttl);
  }

  /* ---------- notifications (derived from my orders' log) ---------- */
  function noteText(o, s) {
    const n = fmtNo(o.no);
    const m = {
      baru: 'Pesanan ' + n + ' terkirim. Menunggu penjual menerima.',
      diproses: 'Pesanan ' + n + ' diterima penjual dan sedang disiapkan.',
      siap: 'Pesanan ' + n + ' sudah siap. Ambil di counter kantin dan sebutkan nomor antrian.',
      selesai: 'Pesanan ' + n + ' selesai. Selamat makan!',
      ditolak: 'Pesanan ' + n + ' ditolak. ' + (o.reason || ''),
      dibatalkan: 'Pesanan ' + n + ' dibatalkan.'
    };
    return m[s] || '';
  }
  function notifs() {
    const out = [];
    S.orders.filter(isMine).forEach(o => {
      (o.log || []).forEach(l => { out.push({ key: o.id + ':' + l.s + ':' + l.t, t: l.t, s: l.s, text: noteText(o, l.s) }); });
    });
    return out.sort((a, b) => b.t - a.t);
  }
  const unseenCount = () => notifs().filter(n => ['diproses', 'siap', 'selesai', 'ditolak'].includes(n.s) && !S.seen.has(n.key)).length;
  function markSeen() {
    notifs().forEach(n => S.seen.add(n.key));
    LS.set('kk-seen', Array.from(S.seen).slice(-300));
  }
  function notifyChange(o) {
    const text = noteText(o, o.status);
    if (o.status === 'siap') {
      toast('Pesanan ' + fmtNo(o.no) + ' sudah siap! Ambil di counter kantin.', { kind: 'ready', ttl: 15000 });
      chime(); buzz();
    } else if (o.status === 'diproses') {
      toast(text, { ttl: 6000 });
    } else if (o.status === 'ditolak') {
      toast(text, { kind: 'bad', ttl: 9000 }); buzz();
    } else if (o.status === 'selesai') {
      toast(text, { ttl: 5000 });
    }
  }

  /* ---------- data layer ---------- */
  function applyOrders(list) {
    list.sort((a, b) => b.createdAt - a.createdAt);
    if (S.prev) {
      list.forEach(o => {
        if (isMine(o) && S.prev[o.id] !== undefined && S.prev[o.id] !== o.status) notifyChange(o);
        if (!isMine(o) && S.prev[o.id] === undefined && S.role === 'seller' && S.canSeller) {
          toast('Pesanan baru ' + fmtNo(o.no) + ' dari ' + o.name, { ttl: 6000 }); chime();
        }
      });
    }
    S.prev = Object.fromEntries(list.map(o => [o.id, o.status]));
    S.orders = list;
    render();
  }
  function seedLocal() {
    const t = Date.now(), date = todayKey();
    const mk = (ids) => { const items = ids.map(([id, q]) => { const m = DEFAULT_MENU.find(x => x.id === id); return { id, name: m.name, price: m.price, qty: q }; }); return { items, total: items.reduce((s, i) => s + i.price * i.qty, 0) }; };
    const a = mk([['mieayam', 1], ['esteh', 1]]), b = mk([['geprek', 2], ['esjeruk', 2]]), c = mk([['batagor', 1], ['susucoklat', 1]]);
    const saved = LS.get('kk-menu', null);
    S.menu = (Array.isArray(saved) && saved.length) ? saved : DEFAULT_MENU.map(m => Object.assign({}, m));
    S.shop = { open: true };
    S.orders = [
      Object.assign({ id: 'd3', no: 3, date, buyerId: 'demo-c', name: 'Nadia', kelas: 'X IPS 1', pay: 'cod', paid: false, slot: 'i1', note: '', status: 'baru', createdAt: t - 2 * 60e3, updatedAt: t - 2 * 60e3, log: [{ s: 'baru', t: t - 2 * 60e3 }] }, c),
      Object.assign({ id: 'd2', no: 2, date, buyerId: 'demo-b', name: 'Dimas', kelas: 'XII IPA 3', pay: 'online', prov: 'GoPay', paid: true, slot: 'i1', note: 'Sambal dipisah', status: 'diproses', createdAt: t - 6 * 60e3, updatedAt: t - 4 * 60e3, log: [{ s: 'baru', t: t - 6 * 60e3 }, { s: 'diproses', t: t - 4 * 60e3 }] }, b),
      Object.assign({ id: 'd1', no: 1, date, buyerId: 'demo-a', name: 'Raka', kelas: 'XI IPA 2', pay: 'cod', paid: false, slot: 'i1', note: '', status: 'siap', createdAt: t - 11 * 60e3, updatedAt: t - 1 * 60e3, log: [{ s: 'baru', t: t - 11 * 60e3 }, { s: 'diproses', t: t - 9 * 60e3 }, { s: 'siap', t: t - 1 * 60e3 }] }, a)
    ];
    S.prev = Object.fromEntries(S.orders.map(o => [o.id, o.status]));
  }
  async function allocNo() {
    if (!S.live) return S.localNo++;
    const lock = S.db.doc('locks/queue'), ctr = S.db.doc('meta/queue');
    const holder = myId() + ':' + Math.random().toString(36).slice(2, 8);
    for (let i = 0; i < 10; i++) {
      const r = await lock.acquire({ holder, ttlMs: 1500 });
      if (r.acquired) {
        const snap = await ctr.get();
        const d = snap.exists ? snap.data() : {};
        const n = (d.date === todayKey() ? d.n : 0) + 1;
        await ctr.set({ date: todayKey(), n });
        return n;
      }
      await sleep(350 + Math.random() * 450);
    }
    throw new Error('antrian sibuk');
  }
  async function saveOrder(order) {
    if (S.live) { await S.db.collection('orders').doc().set(order); return; }
    const o = Object.assign({ id: 'o' + Date.now() }, order);
    S.fresh = o.id;
    applyOrders([o].concat(S.orders));
  }
  async function setStatus(id, status, extra) {
    const o = S.orders.find(x => x.id === id); if (!o) return;
    const now = Date.now();
    const patch = Object.assign({ status, updatedAt: now, log: (o.log || []).concat([{ s: status, t: now }]) }, extra || {});
    try {
      if (S.live) await S.db.doc('orders/' + id).update(patch);
      else applyOrders(S.orders.map(x => x.id === id ? Object.assign({}, x, patch) : x));
    } catch (e) { toast('Perubahan belum tersimpan. Coba lagi.', { kind: 'bad' }); }
  }
  /* foto menu: dipotong persegi dan dikecilkan supaya muat di penyimpanan bersama */
  function photoToData(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) { reject(new Error('bukan gambar')); return; }
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('gagal membaca'));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('gambar rusak'));
        img.onload = () => {
          try {
            const size = 288, c = document.createElement('canvas');
            c.width = size; c.height = size;
            const ctx = c.getContext('2d');
            const s = Math.min(img.width, img.height), sx = (img.width - s) / 2, sy = (img.height - s) / 2;
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size);
            ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
            let out = c.toDataURL('image/jpeg', 0.8);
            if (out.length > 150000) out = c.toDataURL('image/jpeg', 0.6);
            resolve(out);
          } catch (err) { reject(err); }
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  function persistLocalMenu() { if (!S.live) LS.set('kk-menu', S.menu); }
  async function saveMenuItem(item) {
    try {
      if (S.live) { await S.db.doc('menu/' + item.id).set(item); }
      else { const i = S.menu.findIndex(m => m.id === item.id); if (i < 0) S.menu.push(item); else S.menu[i] = item; persistLocalMenu(); render(); }
    } catch (e) { toast('Menu belum tersimpan. Coba lagi.', { kind: 'bad' }); }
  }
  async function patchMenu(id, patch) {
    const m = S.menu.find(x => x.id === id); if (!m) return;
    await saveMenuItem(Object.assign({}, m, patch));
  }
  async function deleteMenu(id) {
    try {
      if (S.live) await S.db.doc('menu/' + id).delete();
      else { S.menu = S.menu.filter(m => m.id !== id); persistLocalMenu(); render(); }
    } catch (e) { toast('Menu belum terhapus. Coba lagi.', { kind: 'bad' }); }
  }
  async function setShopOpen(open) {
    try {
      if (S.live) await S.db.doc('meta/shop').set({ open });
      else { S.shop = { open }; render(); }
    } catch (e) { toast('Status kantin belum tersimpan.', { kind: 'bad' }); }
  }

  async function initLive() {
    if (!window.claude || typeof window.claude.use !== 'function') return;
    let db = null, user = null;
    try { const r = await Promise.all([window.claude.use('db'), window.claude.use('user')]); db = r[0]; user = r[1]; } catch (e) { }
    if (!db) return;
    S.live = true; S.db = db;
    if (user) {
      try { S.uid = await user.id(); } catch (e) { }
      try { S.canSeller = await user.canEdit(); } catch (e) { S.canSeller = false; }
    } else { S.canSeller = false; }
    if (!S.canSeller) S.role = 'buyer';
    S.menu = []; S.orders = []; S.cart = {}; S.prev = null; S.shop = { open: true };
    render();
    const fail = e => { if (e && e.code !== 'revoked') toast('Koneksi data terputus. Muat ulang halaman.', { kind: 'bad', ttl: 0 }); };
    db.collection('menu').onSnapshot(snap => {
      S.menu = snap.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => (a.ord || 0) - (b.ord || 0));
      render();
    }, fail);
    db.collection('orders').where('date', '==', todayKey()).onSnapshot(snap => {
      applyOrders(snap.docs.map(d => Object.assign({ id: d.id }, d.data())));
    }, fail);
    db.doc('meta/shop').onSnapshot(s => { S.shop = s.exists ? s.data() : { open: true }; render(); }, fail);
  }

  /* ---------- views ---------- */
  function myOrders() { return S.orders.filter(isMine); }
  function cartItems() {
    return Object.keys(S.cart).map(id => {
      const m = S.menu.find(x => x.id === id), q = S.cart[id];
      return (m && m.ok !== false && q > 0) ? { id, name: m.name, price: m.price, qty: q } : null;
    }).filter(Boolean);
  }
  const cartTotal = () => cartItems().reduce((s, i) => s + i.price * i.qty, 0);
  const cartCount = () => cartItems().reduce((s, i) => s + i.qty, 0);

  function numChips(list, cls) {
    if (!list.length) return '<span class="none">Belum ada</span>';
    const shown = list.slice(0, 8).map(o => '<span class="num ' + cls + '">' + fmtNo(o.no) + '</span>').join('');
    return shown + (list.length > 8 ? '<span class="none">+' + (list.length - 8) + ' lagi</span>' : '');
  }
  function heroHtml() {
    const prep = S.orders.filter(o => o.status === 'baru' || o.status === 'diproses').sort((a, b) => a.no - b.no);
    const ready = S.orders.filter(o => o.status === 'siap').sort((a, b) => a.no - b.no);
    const d = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
    return '<section class="hero">'
      + '<div class="hero-copy"><div><p class="eyebrow">Kantin hari ini</p><h1 style="margin-top:10px">Pesan dari kelas,<br>ambil pas istirahat.</h1></div>'
      + '<div class="hero-meta"><span class="chip-info"><span class="led' + (isOpen() ? '' : ' off') + '"></span>' + (isOpen() ? 'Kantin buka' : 'Kantin tutup') + '</span><span class="chip-info">' + esc(d) + '</span></div></div>'
      + '<div class="board" aria-label="Papan antrian"><h2>Papan antrian</h2>'
      + '<div class="board-row"><p class="eyebrow" style="color: var(--f-body)">Siap diambil</p><div class="nums">' + numChips(ready, 'ready') + '</div></div>'
      + '<div class="board-row"><p class="eyebrow" style="color: var(--f-body)">Dalam antrian</p><div class="nums">' + numChips(prep, '') + '</div></div>'
      + '</div></section>';
  }
  function thumbHtml(m) {
    if (m.img && /^data:image\/(jpeg|png|webp);base64,/.test(m.img)) return '<img src="' + m.img + '" alt="' + esc(m.name) + '">';
    return ICON[m.cat] || ICON.nasi;
  }
  function itemHtml(m) {
    const q = S.cart[m.id] || 0, off = m.ok === false;
    let ctl;
    if (off) ctl = '<button type="button" class="btn sm" disabled>Habis</button>';
    else if (q > 0) ctl = '<div class="stepper" role="group" aria-label="Jumlah ' + esc(m.name) + '"><button type="button" data-act="dec" data-id="' + esc(m.id) + '" aria-label="Kurangi ' + esc(m.name) + '">−</button><span aria-live="polite">' + q + '</span><button type="button" data-act="inc" data-id="' + esc(m.id) + '" aria-label="Tambah ' + esc(m.name) + '">+</button></div>';
    else ctl = '<button type="button" class="btn sm primary" data-act="add" data-id="' + esc(m.id) + '">Tambah</button>';
    return '<article class="item' + (off ? ' off' : '') + '"><div class="tile t-' + esc(m.cat) + '">' + thumbHtml(m) + '</div>'
      + '<div class="info"><h3>' + esc(m.name) + '</h3><p class="desc">' + esc(m.desc || '') + '</p></div>'
      + '<div class="buy"><span class="price">' + rp(m.price) + '</span>' + ctl + '</div></article>';
  }
  function menuViewHtml() {
    const chips = '<div class="chips" role="group" aria-label="Kategori menu"><button type="button" class="chip" data-act="cat" data-cat="all" aria-pressed="' + (S.cat === 'all') + '">Semua</button>'
      + CATS.map(c => '<button type="button" class="chip" data-act="cat" data-cat="' + c.id + '" aria-pressed="' + (S.cat === c.id) + '">' + c.label + '</button>').join('') + '</div>';
    const list = S.menu.filter(m => S.cat === 'all' || m.cat === S.cat);
    let body;
    if (!S.menu.length) body = '<div class="empty"><b>Menu belum diisi</b><p>Penjual bisa menambahkan menu lewat mode Penjual, tab Menu.</p></div>';
    else body = '<div class="grid">' + list.map(itemHtml).join('') + '</div>';
    const closed = isOpen() ? '' : '<div class="notice" role="status">Kantin sedang tutup. Kamu masih bisa melihat menu, tapi pesanan belum bisa dikirim.</div>';
    const demo = S.live ? '' : '<div class="notice info" role="note">Mode contoh: data hanya ada di perangkat ini. Buka lewat tautan yang dibagikan penjual agar pesanan masuk ke kantin.</div>';
    return demo + closed + chips + body;
  }
  function ticketHtml(o) {
    const idxMap = { baru: 0, diproses: 1, siap: 2, selesai: 3 }, idx = idxMap[o.status];
    const sl = slotOf(o.slot);
    const labels = ['Menunggu', 'Disiapkan', 'Siap', 'Selesai'];
    let steps = '';
    if (idx !== undefined) {
      steps = '<div class="steps" aria-label="Tahap pesanan">' + labels.map((l, i) => '<div class="step ' + (o.status === 'selesai' || i < idx ? 'done' : (i === idx ? 'now' : '')) + '"><i></i>' + l + '</div>').join('') + '</div>';
    }
    const ahead = S.orders.filter(x => (x.status === 'baru' || x.status === 'diproses') && x.no < o.no).length;
    let msg = '';
    if (o.status === 'baru') msg = 'Menunggu penjual menerima pesanan. Antrian di depanmu: <b>' + ahead + ' pesanan</b>.';
    else if (o.status === 'diproses') msg = 'Pesananmu sedang disiapkan. Antrian di depanmu: <b>' + ahead + ' pesanan</b>.';
    else if (o.status === 'siap') msg = '<b>Pesanan sudah siap.</b> Ambil di counter dan sebutkan nomor ' + fmtNo(o.no) + '.' + (o.pay === 'cod' && !o.paid ? ' Siapkan uang pas ' + rp(o.total) + '.' : '');
    else if (o.status === 'selesai') msg = 'Selesai. Selamat makan!';
    else if (o.status === 'ditolak') msg = '<b>Pesanan ditolak.</b> ' + esc(o.reason || '') + (o.paid ? ' Pembayaran online akan dikembalikan oleh penjual.' : '');
    else msg = 'Pesanan dibatalkan.';
    const payTag = o.pay === 'online' ? '<span class="pill tag-ok">Lunas online' + (o.prov ? ' · ' + esc(o.prov) : '') + '</span>' : '<span class="pill tag-warn">Bayar di tempat</span>';
    const cancel = (o.status === 'baru' && !o.paid) ? '<div class="actions"><button type="button" class="btn sm danger" data-act="cancel" data-id="' + esc(o.id) + '">Batalkan pesanan</button></div>' : '';
    return '<article class="ticket' + (S.fresh === o.id ? ' fresh' : '') + '"><div class="stub"><span class="lbl">Antrian</span><span class="no">' + fmtNo(o.no) + '</span></div>'
      + '<div class="tbody"><div class="trow"><span class="pill s-' + o.status + '">' + STATUS[o.status] + '</span><span class="msg">' + esc(sl.label) + ' · ' + sl.time + ' · dipesan ' + hhmm(o.createdAt) + '</span></div>'
      + '<ul class="lines">' + o.items.map(i => '<li><span class="q">' + i.qty + '×</span><span>' + esc(i.name) + '</span></li>').join('') + '</ul>'
      + '<div class="total-row"><span>Total</span><span class="tnum">' + rp(o.total) + '</span></div>'
      + '<div class="trow">' + payTag + '</div>' + steps + '<p class="msg">' + msg + '</p>' + cancel + '</div></article>';
  }
  function ordersViewHtml() {
    const mine = myOrders();
    if (!mine.length) return '<div class="empty"><b>Belum ada pesanan hari ini</b><p>Pilih menu, kirim pesanan, dan nomor antrianmu akan muncul di sini.</p><button type="button" class="btn primary" data-act="bview" data-v="menu">Lihat menu</button></div>';
    return '<div class="tickets">' + mine.map(ticketHtml).join('') + '</div>';
  }
  function buyerHtml() {
    const active = myOrders().filter(o => ['baru', 'diproses', 'siap'].includes(o.status)).length;
    const tabs = '<nav class="tabs" role="tablist" aria-label="Bagian pembeli">'
      + '<button type="button" role="tab" data-act="bview" data-v="menu" aria-selected="' + (S.bview === 'menu') + '">Menu</button>'
      + '<button type="button" role="tab" data-act="bview" data-v="orders" aria-selected="' + (S.bview === 'orders') + '">Pesanan saya' + (active ? '<span class="badge">' + active + '</span>' : '') + '</button></nav>';
    return (S.bview === 'menu' ? heroHtml() : '') + tabs + (S.bview === 'orders' ? ordersViewHtml() : menuViewHtml());
  }

  /* seller */
  function ocardHtml(o) {
    const sl = slotOf(o.slot);
    const payTag = o.pay === 'online' ? '<span class="pill tag-ok">Lunas online' + (o.prov ? ' · ' + esc(o.prov) : '') + '</span>' : '<span class="pill tag-warn">Bayar di tempat</span>';
    let act = '';
    const id = esc(o.id);
    if (o.status === 'baru') act = '<button type="button" class="btn sm leaf" data-act="accept" data-id="' + id + '">Terima pesanan</button><button type="button" class="btn sm danger" data-act="reject" data-id="' + id + '">Tolak</button>';
    else if (o.status === 'diproses') act = '<button type="button" class="btn sm primary" data-act="ready" data-id="' + id + '">Tandai siap dan beri tahu pembeli</button>';
    else if (o.status === 'siap') act = '<button type="button" class="btn sm leaf" data-act="done" data-id="' + id + '">' + (o.pay === 'cod' && !o.paid ? 'Terima tunai dan selesai' : 'Sudah diambil, selesai') + '</button>';
    return '<article class="ocard"><div class="hd"><span class="no">' + fmtNo(o.no) + '</span><div class="who"><b>' + esc(o.name) + '</b><small>' + esc(o.kelas) + ' · ' + esc(sl.label) + ' ' + sl.time + '</small></div></div>'
      + '<ul class="lines">' + o.items.map(i => '<li><span class="q">' + i.qty + '×</span><span>' + esc(i.name) + '</span></li>').join('') + '</ul>'
      + (o.note ? '<p class="note">Catatan: ' + esc(o.note) + '</p>' : '')
      + '<div class="total-row"><span>Total</span><span class="tnum">' + rp(o.total) + '</span></div>'
      + '<div class="trow">' + payTag + '<span class="msg">' + hhmm(o.createdAt) + '</span></div>'
      + (act ? '<div class="actions">' + act + '</div>' : '') + '</article>';
  }
  function antrianHtml() {
    const by = s => S.orders.filter(o => o.status === s).sort((a, b) => a.no - b.no);
    const cols = [['baru', 'Baru masuk'], ['diproses', 'Disiapkan'], ['siap', 'Siap diambil']];
    const done = S.orders.filter(o => ['selesai', 'ditolak', 'dibatalkan'].includes(o.status)).length;
    return '<div class="cols">' + cols.map(c => {
      const l = by(c[0]);
      return '<section class="col" aria-label="' + c[1] + '"><h2>' + c[1] + '<em>' + l.length + '</em></h2>' + (l.length ? l.map(ocardHtml).join('') : '<p class="coln-empty">Tidak ada pesanan</p>') + '</section>';
    }).join('') + '</div><p class="msg">Selesai atau dibatalkan hari ini: <b class="tnum">' + done + '</b> pesanan. Lihat ringkasannya di tab Rekap.</p>';
  }
  function menuAdminHtml() {
    const form = '<form class="form" id="menuForm" autocomplete="off"><h2 style="font:700 17px/1.2 var(--f-display)">Tambah menu</h2>'
      + '<div class="two"><label class="f" for="mf-name">Nama menu<input type="text" id="mf-name" maxlength="40" required></label>'
      + '<label class="f" for="mf-price">Harga (Rp)<input type="number" id="mf-price" min="500" step="500" inputmode="numeric" required></label></div>'
      + '<div class="two"><label class="f" for="mf-cat">Kategori<select id="mf-cat">' + CATS.map(c => '<option value="' + c.id + '">' + c.label + '</option>').join('') + '</select></label>'
      + '<label class="f" for="mf-desc">Keterangan<input type="text" id="mf-desc" maxlength="70"></label></div>'
      + '<label class="f" for="mf-photo">Foto makanan (opsional)<input type="file" id="mf-photo" accept="image/*"></label>'
      + '<div><button type="submit" class="btn primary">Simpan menu</button></div></form>';
    const rows = S.menu.length ? S.menu.map(m => {
      const id = esc(m.id), c = CATS.find(x => x.id === m.cat);
      const del = S.confirmDel === m.id ? '<button type="button" class="btn sm danger" data-act="menuDelYes" data-id="' + id + '">Ya, hapus</button><button type="button" class="btn sm" data-act="menuDelNo">Batal</button>' : '<button type="button" class="btn sm danger" data-act="menuDel" data-id="' + id + '">Hapus</button>';
      const hasImg = !!(m.img && /^data:image\//.test(m.img));
      const photoBtns = '<label class="btn sm file-btn">' + (hasImg ? 'Ganti foto' : 'Pilih foto') + '<input type="file" accept="image/*" data-change="photo" data-id="' + id + '" aria-label="' + (hasImg ? 'Ganti foto ' : 'Pilih foto ') + esc(m.name) + '"></label>'
        + (hasImg ? '<button type="button" class="btn sm" data-act="photoDel" data-id="' + id + '">Hapus foto</button>' : '');
      return '<div class="mrow"><div class="nm"><div class="mname"><span class="mthumb t-' + esc(m.cat) + '">' + thumbHtml(m) + '</span><span><b>' + esc(m.name) + '</b><small>' + (c ? c.label : '') + '</small></span></div></div>'
        + '<div class="ctl">' + photoBtns + '<label class="f" style="display:block"><span class="eyebrow" style="display:block;margin-bottom:2px">Harga</span><input type="number" min="500" step="500" inputmode="numeric" value="' + Number(m.price) + '" data-change="price" data-id="' + id + '" aria-label="Harga ' + esc(m.name) + '"></label>'
        + '<button type="button" class="btn sm ' + (m.ok === false ? '' : 'leaf') + '" data-act="menuToggle" data-id="' + id + '" aria-pressed="' + (m.ok !== false) + '">' + (m.ok === false ? 'Habis' : 'Tersedia') + '</button>' + del + '</div></div>';
    }).join('') : '<div class="empty"><b>Menu masih kosong</b><p>Isi form di atas untuk menambahkan menu pertama.</p></div>';
    return form + '<div class="rows">' + rows + '</div>';
  }
  function rekapHtml() {
    const valid = S.orders.filter(o => o.status !== 'ditolak' && o.status !== 'dibatalkan');
    const done = S.orders.filter(o => o.status === 'selesai');
    const income = done.reduce((s, o) => s + o.total, 0);
    const online = done.filter(o => o.pay === 'online').reduce((s, o) => s + o.total, 0);
    const tally = {};
    valid.forEach(o => o.items.forEach(i => { tally[i.name] = (tally[i.name] || 0) + i.qty; }));
    const top = Object.keys(tally).map(k => [k, tally[k]]).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = top.length ? top[0][1] : 1;
    return '<div class="recap">'
      + '<div class="rc"><span class="eyebrow">Pesanan masuk</span><b>' + valid.length + '</b></div>'
      + '<div class="rc"><span class="eyebrow">Sudah selesai</span><b>' + done.length + '</b></div>'
      + '<div class="rc"><span class="eyebrow">Pendapatan selesai</span><b>' + rp(income) + '</b></div>'
      + '<div class="rc"><span class="eyebrow">Dibayar online</span><b>' + rp(online) + '</b></div></div>'
      + '<section class="bars" aria-label="Menu terlaris"><h2 style="font:700 17px/1.2 var(--f-display)">Menu terlaris hari ini</h2>'
      + (top.length ? top.map(t => '<div class="bar"><span class="nm">' + esc(t[0]) + '</span><span class="tr"><i style="width:' + Math.round(t[1] / max * 100) + '%"></i></span><span class="v">' + t[1] + '</span></div>').join('') : '<p class="msg">Belum ada pesanan hari ini.</p>')
      + '</section>';
  }
  function sellerHtml() {
    const c = s => S.orders.filter(o => o.status === s).length;
    const bar = '<div class="sbar"><div class="stats"><div class="stat"><b>' + c('baru') + '</b><span>Baru</span></div><div class="stat"><b>' + c('diproses') + '</b><span>Disiapkan</span></div><div class="stat"><b>' + c('siap') + '</b><span>Siap diambil</span></div></div>'
      + '<button type="button" class="btn ' + (isOpen() ? 'leaf' : '') + '" data-act="shopToggle" aria-pressed="' + isOpen() + '">' + (isOpen() ? 'Kantin buka. Ketuk untuk menutup' : 'Kantin tutup. Ketuk untuk membuka') + '</button></div>';
    const tabs = '<nav class="tabs" role="tablist" aria-label="Bagian penjual">'
      + [['antrian', 'Antrian'], ['menu', 'Menu'], ['rekap', 'Rekap hari ini']].map(t => '<button type="button" role="tab" data-act="sview" data-v="' + t[0] + '" aria-selected="' + (S.sview === t[0]) + '">' + t[1] + '</button>').join('') + '</nav>';
    const body = S.sview === 'menu' ? menuAdminHtml() : (S.sview === 'rekap' ? rekapHtml() : antrianHtml());
    return bar + tabs + body;
  }

  function renderTop() {
    const seg = $('#roleSeg'); seg.hidden = !S.canSeller;
    seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.role === S.role)));
    const n = unseenCount(), d = $('#bellDot');
    d.hidden = !n; d.textContent = n > 9 ? '9+' : String(n);
    $('#bell').hidden = (S.role === 'seller' && S.canSeller);
  }
  function renderCart() {
    const n = cartCount(), el = $('#cartbar');
    if (!n || S.role === 'seller' || S.bview !== 'menu') { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="wrap"><button type="button" class="cartbtn" data-act="openCheckout"><span><span class="sub">' + n + ' item</span><br>' + rp(cartTotal()) + '</span><span>Lanjut pesan →</span></button></div>';
  }
  function render() {
    const ae = document.activeElement;
    if (ae && ae !== document.body && $('#main').contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.type !== 'file') { S.dirty = true; return; }
    S.dirty = false;
    if (!S.canSeller && S.role === 'seller') S.role = 'buyer';
    renderTop();
    $('#main').innerHTML = (S.role === 'seller' && S.canSeller) ? sellerHtml() : buyerHtml();
    renderCart();
    if (S.sheet === 'notif') renderNotif();
  }

  /* ---------- sheets ---------- */
  function openSheet(type) {
    S.lastFocus = document.activeElement; S.sheet = type;
    $('#sheet').hidden = false;
    if (type === 'checkout') renderCheckout(); else renderNotif();
    $('#panel').focus();
  }
  function closeSheet() {
    S.sheet = null; S.err = null; $('#sheet').hidden = true;
    if (S.lastFocus && S.lastFocus.focus && document.contains(S.lastFocus)) try { S.lastFocus.focus(); } catch (e) { }
  }
  function renderNotif() {
    const list = notifs();
    $('#panel').innerHTML = '<div class="ph"><h2 id="sheetTitle">Notifikasi</h2><button type="button" class="btn sm" data-act="closeSheet">Tutup</button></div>'
      + (list.length ? '<div class="nlist">' + list.map(n => '<div class="nrow' + (['diproses', 'siap', 'selesai', 'ditolak'].includes(n.s) && !S.seen.has(n.key) ? ' new' : '') + '"><time>' + hhmm(n.t) + '</time><span>' + esc(n.text) + '</span></div>').join('') + '</div>'
        : '<div class="empty"><b>Belum ada notifikasi</b><p>Kamu akan diberi tahu di sini saat pesanan diterima, siap diambil, atau selesai.</p></div>');
  }
  function renderCheckout() {
    const d = S.draft, items = cartItems(), total = cartTotal();
    const lines = items.map(i => '<div class="sumrow"><span class="nm">' + esc(i.name) + '<small>' + rp(i.price) + ' × ' + i.qty + '</small></span>'
      + '<div class="stepper" role="group" aria-label="Jumlah ' + esc(i.name) + '"><button type="button" data-act="dec" data-id="' + esc(i.id) + '" aria-label="Kurangi ' + esc(i.name) + '">−</button><span>' + i.qty + '</span><button type="button" data-act="inc" data-id="' + esc(i.id) + '" aria-label="Tambah ' + esc(i.name) + '">+</button></div></div>').join('');
    const slots = SLOTS.map(s => '<label class="opt"><input type="radio" name="slot" value="' + s.id + '" data-draft="slot"' + (d.slot === s.id ? ' checked' : '') + '><span><b>' + s.label + '</b><small>Jam ' + s.time + '</small></span></label>').join('');
    const prov = PROVIDERS.map(p => '<label class="opt"><input type="radio" name="prov" value="' + p + '" data-draft="prov"' + (d.prov === p ? ' checked' : '') + '><span><b>' + p + '</b></span></label>').join('');
    $('#panel').innerHTML = '<div class="ph"><h2 id="sheetTitle">Pesanan kamu</h2><button type="button" class="btn sm" data-act="closeSheet">Tutup</button></div>'
      + (items.length ? '<form id="ckForm" class="form" autocomplete="off" novalidate>'
        + '<div class="sumlist">' + lines + '</div>'
        + '<div class="two"><label class="f" for="ck-name">Nama<input type="text" id="ck-name" data-draft="name" maxlength="30" value="' + esc(d.name) + '" autocomplete="given-name"></label>'
        + '<label class="f" for="ck-kelas">Kelas<input type="text" id="ck-kelas" data-draft="kelas" maxlength="14" value="' + esc(d.kelas) + '" placeholder="mis. X IPS 1"></label></div>'
        + '<fieldset style="border:0;padding:0;margin:0;min-width:0"><legend class="eyebrow" style="margin-bottom:8px">Ambil saat</legend><div class="opts cols3">' + slots + '</div></fieldset>'
        + '<label class="f" for="ck-note">Catatan untuk penjual (opsional)<textarea id="ck-note" data-draft="note" maxlength="80" placeholder="mis. tanpa sambal">' + esc(d.note) + '</textarea></label>'
        + '<fieldset style="border:0;padding:0;margin:0;min-width:0"><legend class="eyebrow" style="margin-bottom:8px">Cara bayar</legend><div class="opts">'
        + '<label class="opt"><input type="radio" name="pay" value="cod" data-draft="pay"' + (d.pay === 'cod' ? ' checked' : '') + '><span><b>Bayar di tempat</b><small>Bayar tunai ke penjual saat mengambil pesanan.</small></span></label>'
        + '<label class="opt"><input type="radio" name="pay" value="online" data-draft="pay"' + (d.pay === 'online' ? ' checked' : '') + '><span><b>Bayar online</b><small>Bayar sekarang dengan QRIS atau dompet digital.</small></span></label></div></fieldset>'
        + (d.pay === 'online' ? '<div class="opts cols3" role="radiogroup" aria-label="Metode pembayaran online">' + prov + '</div><p class="sim">Simulasi: halaman ini belum terhubung ke penyedia pembayaran sungguhan, jadi tidak ada uang yang dipindahkan.</p>' : '')
        + '<div class="total-row" style="font-size:18px"><span>Total</span><span class="tnum">' + rp(total) + '</span></div>'
        + (S.err ? '<p class="err" role="alert">' + esc(S.err.msg) + '</p>' : '')
        + (isOpen() ? '' : '<p class="err" role="alert">Kantin sedang tutup, pesanan belum bisa dikirim.</p>')
        + '<button type="submit" class="btn primary block" ' + ((S.busy || !isOpen()) ? 'disabled' : '') + '>' + (S.busy ? (d.pay === 'online' ? 'Memproses pembayaran…' : 'Mengirim pesanan…') : (d.pay === 'online' ? 'Bayar ' + rp(total) + ' dan pesan' : 'Kirim pesanan')) + '</button></form>'
        : '<div class="empty"><b>Keranjang kosong</b><p>Tambahkan menu dulu.</p><button type="button" class="btn primary" data-act="closeSheet">Lihat menu</button></div>');
    if (S.err && S.err.field) { const f = document.getElementById(S.err.field); if (f) f.focus(); }
  }

  async function submitOrder() {
    const d = S.draft, items = cartItems();
    if (!items.length || S.busy) return;
    if (!d.name.trim()) { S.err = { msg: 'Isi nama kamu dulu.', field: 'ck-name' }; renderCheckout(); return; }
    if (!d.kelas.trim()) { S.err = { msg: 'Isi kelas kamu, mis. X IPS 1.', field: 'ck-kelas' }; renderCheckout(); return; }
    if (!isOpen()) return;
    S.err = null; S.busy = true; renderCheckout();
    try {
      let paid = false, payRef = null;
      if (d.pay === 'online') { await sleep(1400); paid = true; payRef = 'SIM-' + Math.random().toString(36).slice(2, 8).toUpperCase(); }
      const no = await allocNo(), now = Date.now();
      const total = items.reduce((s, i) => s + i.price * i.qty, 0);
      await saveOrder({ no, date: todayKey(), buyerId: myId(), name: d.name.trim(), kelas: d.kelas.trim(), items, total, pay: d.pay, prov: d.pay === 'online' ? d.prov : null, paid, payRef, slot: d.slot, note: d.note.trim(), status: 'baru', createdAt: now, updatedAt: now, log: [{ s: 'baru', t: now }] });
      LS.set('kk-buyer', { name: d.name.trim(), kelas: d.kelas.trim() });
      S.cart = {}; S.busy = false; S.bview = 'orders'; S.draft.note = '';
      closeSheet(); render();
      toast('Pesanan terkirim. Nomor antrian kamu ' + fmtNo(no) + '.', { ttl: 7000 });
      window.scrollTo(0, 0);
    } catch (e) {
      S.busy = false;
      S.err = { msg: 'Pesanan belum terkirim. Pastikan kamu masuk dengan akun yang punya akses Kontributor, lalu coba lagi.' };
      renderCheckout();
    }
  }

  /* ---------- events ---------- */
  function keepFocus(act, id) {
    const el = document.querySelector('[data-act="' + act + '"][data-id="' + id + '"]') || document.querySelector('[data-act="add"][data-id="' + id + '"]') || document.querySelector('[data-act="inc"][data-id="' + id + '"]');
    if (el) try { el.focus(); } catch (e) { }
  }
  function changeCart(id, delta) {
    const q = Math.max(0, Math.min(9, (S.cart[id] || 0) + delta));
    if (q) S.cart[id] = q; else delete S.cart[id];
    render(); if (S.sheet === 'checkout') renderCheckout();
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act, id = b.dataset.id;
    switch (act) {
      case 'role': S.role = b.dataset.role; render(); break;
      case 'bview': S.bview = b.dataset.v; render(); break;
      case 'sview': S.sview = b.dataset.v; S.confirmDel = null; render(); break;
      case 'cat': S.cat = b.dataset.cat; render(); break;
      case 'add': case 'inc': changeCart(id, 1); keepFocus(act === 'add' ? 'inc' : act, id); break;
      case 'dec': changeCart(id, -1); keepFocus('dec', id); break;
      case 'openCheckout': openSheet('checkout'); break;
      case 'bell': openSheet('notif'); markSeen(); renderTop(); break;
      case 'closeSheet': closeSheet(); break;
      case 'accept': setStatus(id, 'diproses'); break;
      case 'reject': setStatus(id, 'ditolak', { reason: 'Maaf, pesanan ini belum bisa dibuat. Silakan pesan menu lain.' }); break;
      case 'ready': setStatus(id, 'siap'); break;
      case 'done': { const o = S.orders.find(x => x.id === id); setStatus(id, 'selesai', o && o.pay === 'cod' ? { paid: true } : {}); break; }
      case 'cancel': setStatus(id, 'dibatalkan'); break;
      case 'shopToggle': setShopOpen(!isOpen()); break;
      case 'menuToggle': { const m = S.menu.find(x => x.id === id); if (m) patchMenu(id, { ok: m.ok === false }); break; }
      case 'menuDel': S.confirmDel = id; render(); break;
      case 'menuDelNo': S.confirmDel = null; render(); break;
      case 'menuDelYes': S.confirmDel = null; deleteMenu(id); break;
      case 'photoDel': patchMenu(id, { img: '' }).then(() => toast('Foto dihapus. Menu kembali memakai ikon.')); break;
    }
  });
  document.addEventListener('input', e => {
    const k = e.target.dataset && e.target.dataset.draft;
    if (k && e.target.type !== 'radio') S.draft[k] = e.target.value;
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset && t.dataset.draft && t.type === 'radio') {
      S.draft[t.dataset.draft] = t.value;
      if (t.dataset.draft === 'pay') { renderCheckout(); const r = document.querySelector('input[name="pay"]:checked'); if (r) r.focus(); }
    }
    if (t.dataset && t.dataset.change === 'photo') {
      const file = t.files && t.files[0], id = t.dataset.id;
      if (file) {
        photoToData(file)
          .then(d => patchMenu(id, { img: d }))
          .then(() => toast('Foto menu diperbarui.'))
          .catch(() => toast('Foto tidak bisa dipakai. Pilih file gambar JPG atau PNG.', { kind: 'bad' }));
      }
      try { t.value = ''; } catch (err) { }
    }
    if (t.dataset && t.dataset.change === 'price') {
      const v = Math.round(Number(t.value));
      if (v >= 500) patchMenu(t.dataset.id, { price: v }); else { toast('Harga minimal Rp 500.', { kind: 'bad' }); S.dirty = true; }
    }
  });
  document.addEventListener('submit', async e => {
    e.preventDefault();
    if (e.target.id === 'ckForm') submitOrder();
    if (e.target.id === 'menuForm') {
      const name = $('#mf-name').value.trim(), price = Math.round(Number($('#mf-price').value));
      if (!name || !(price >= 500)) { toast('Isi nama menu dan harga minimal Rp 500.', { kind: 'bad' }); return; }
      const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'menu';
      let id = base; if (S.menu.some(m => m.id === id)) id = base + '-' + Math.random().toString(36).slice(2, 5);
      const ord = S.menu.reduce((mx, m) => Math.max(mx, m.ord || 0), 0) + 1;
      const form = e.target, file = $('#mf-photo').files[0];
      let img = '';
      if (file) {
        try { img = await photoToData(file); }
        catch (err) { toast('Foto tidak bisa dipakai. Pilih file gambar JPG atau PNG.', { kind: 'bad' }); return; }
      }
      const item = { id, name, price, cat: $('#mf-cat').value, desc: $('#mf-desc').value.trim(), ok: true, ord };
      if (img) item.img = img;
      await saveMenuItem(item);
      try { form.reset(); } catch (err) { }
      toast('Menu ' + name + ' ditambahkan.');
    }
  });
  document.addEventListener('focusout', () => {
    if (S.dirty) setTimeout(() => { if (S.dirty) render(); }, 0);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && S.sheet) closeSheet();
  });

  /* ---------- start ---------- */
  seedLocal();
  render();
  initLive();
})();
