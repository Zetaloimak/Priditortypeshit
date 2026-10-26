/* =========================================================
   app.js: all site logic, no server needed
   - accounts are saved in THIS browser (localStorage)
   - passwords are hashed with PBKDF2 before they are saved
   - sign up asks for username, Gmail, password and confirm password
   - pages switch with the URL hash: #product, #download, #admin
   ========================================================= */
(() => {
  'use strict';

  const ADMIN_USERNAMES = ['zetaloimak', 'rakfocus']; // matched without upper/lower case
  const USERS_KEY = 'pts.users';
  const SESSION_KEY = 'pts.session';
  const PAGES = ['product', 'download', 'admin'];
  const USERNAME_RE = /^[A-Za-z0-9_.]{3,20}$/;
  const GMAIL_RE = /^[a-z0-9.]{6,30}@gmail\.com$/;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  let currentUser = localStorage.getItem(SESSION_KEY); // display name, or null when logged out
  let pendingTarget = null;                            // page to open after a successful log in

  const isAdmin = name => Boolean(name) && ADMIN_USERNAMES.includes(name.toLowerCase());
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- accounts (saved in this browser) ---------- */
  function loadUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || {}; }
    catch { return {}; }
  }
  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }
  function getUser(name) {
    const users = loadUsers();
    const key = name.toLowerCase();
    return Object.hasOwn(users, key) ? users[key] : null;
  }
  function findByEmail(email) {
    return Object.values(loadUsers()).some(u => u.email === email);
  }

  /* ---------- password hashing (PBKDF2 with a random salt) ---------- */
  const toHex = buffer => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
  const fromHex = hex => Uint8Array.from(hex.match(/../g), h => parseInt(h, 16));

  async function hashPassword(password, saltHex) {
    const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, key, 256
    );
    return { salt: toHex(salt), hash: toHex(bits) };
  }

  /* ---------- session and navbar ---------- */
  function setSession(name) {
    currentUser = name;
    if (name) localStorage.setItem(SESSION_KEY, name);
    else localStorage.removeItem(SESSION_KEY);
    updateNav();
    route();
  }

  function updateNav() {
    const admin = isAdmin(currentUser);

    $$('[data-auth]').forEach(el => { el.hidden = !currentUser; });
    $$('[data-welcome]').forEach(el => {
      el.textContent = currentUser ? `Welcome, ${currentUser}` : 'Welcome user';
    });

    const navUser = $('#navUser');
    navUser.hidden = !currentUser;
    navUser.textContent = currentUser || '';
    navUser.classList.toggle('is-admin', admin);
    if (admin) {
      navUser.href = '#admin';
      navUser.title = `Admin mode: ${currentUser}`;
    } else {
      navUser.removeAttribute('href');
      navUser.title = currentUser ? `Logged in as ${currentUser}` : '';
    }

    $('#navLogin').textContent = currentUser ? 'Log out' : 'Log in';
  }

  /* ---------- page switching (URL hash) ---------- */
  function route() {
    const name = decodeURIComponent(location.hash.slice(1));
    const page = PAGES.includes(name) ? name : 'home';
    const admin = isAdmin(currentUser);

    $$('.view').forEach(v => { v.hidden = v.id !== `view-${page}`; });

    $('#dlLocked').hidden = Boolean(currentUser);
    $('#dlContent').hidden = !currentUser;

    $('#adminLocked').hidden = admin;
    $('#adminContent').hidden = !admin;
    if (admin) renderAdmin();

    if (page !== 'home') window.scrollTo(0, 0);
    else if (name) document.getElementById(name)?.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, 0);

    const current = name || 'top';
    $$('#navLinks a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#${current}`));
  }

  /* ---------- admin page ---------- */
  function renderAdmin() {
    const users = Object.values(loadUsers()).sort((a, b) => a.created - b.created);

    $('#statTotal').textContent = users.length;
    $('#statAdmins').textContent = users.filter(u => isAdmin(u.name)).length;
    $('#statNewest').textContent = users.length ? users[users.length - 1].name : '—';

    $('#userRows').innerHTML = users.length
      ? users.map((u, i) => {
          const admin = isAdmin(u.name);
          return `<tr>
            <td>${i + 1}</td>
            <td><strong>${escapeHtml(u.name)}</strong></td>
            <td><span class="role-tag${admin ? ' is-admin' : ''}">${admin ? 'Admin' : 'User'}</span></td>
            <td>${escapeHtml(new Date(u.created).toLocaleString())}</td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="4">No accounts yet.</td></tr>';
  }

  /* ---------- log in and sign in popup ---------- */
  const auth = $('#auth');
  const loginForm = $('#loginForm');
  const signinForm = $('#signinForm');
  const msg = $('#authMsg');

  function setMsg(text, type = '') {
    msg.textContent = text;
    msg.className = `auth-msg ${type}`.trim();
  }

  function setTab(mode) {
    $$('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.mode === mode)));
    loginForm.hidden = mode !== 'login';
    signinForm.hidden = mode !== 'signin';
    setMsg('');
  }

  // target = the hash to open after a successful log in, such as #product
  function openAuth(mode = 'login', target = null) {
    pendingTarget = target;
    auth.classList.add('open');
    document.body.classList.add('locked');
    setTab(mode);
    setTimeout(() => $('form:not([hidden]) input', auth)?.focus(), 60);
  }

  function closeAuth() {
    pendingTarget = null;
    auth.classList.remove('open');
    document.body.classList.remove('locked');
  }

  $$('.tab').forEach(t => t.addEventListener('click', () => setTab(t.dataset.mode)));
  $('#authClose').addEventListener('click', closeAuth);
  auth.addEventListener('click', e => { if (e.target === auth) closeAuth(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAuth(); });
  $('#forgotLink').addEventListener('click', e => {
    e.preventDefault();
    setMsg('Password reset is not available here. Please contact us.');
  });

  /* ---------- Log in ---------- */
  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#loginUser').value.trim();
    const password = $('#loginPass').value;
    if (!name || !password) return setMsg('Please enter your username and password.', 'error');

    const user = getUser(name);
    if (!user || (await hashPassword(password, user.salt)).hash !== user.hash) {
      return setMsg('Wrong username or password.', 'error');
    }

    const target = pendingTarget;
    e.target.reset();
    setMsg(`Welcome back, ${user.name}!`, 'success');
    setTimeout(() => {
      closeAuth();
      setSession(user.name);
      if (target) location.hash = target;
    }, 600);
  });

  /* ---------- Sign in (create account) ---------- */
  signinForm.addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#signUser').value.trim();
    const email = $('#signEmail').value.trim().toLowerCase();
    const password = $('#signPass').value;
    const confirm = $('#signConfirm').value;

    if (!USERNAME_RE.test(name)) return setMsg('Username: 3–20 letters, numbers, _ or .', 'error');
    if (!GMAIL_RE.test(email)) return setMsg('Please enter a valid Gmail address (name@gmail.com).', 'error');
    if (password.length < 6) return setMsg('Password must be at least 6 characters.', 'error');
    if (password !== confirm) return setMsg('Passwords do not match.', 'error');
    if (getUser(name)) return setMsg('That username is already taken.', 'error');
    if (findByEmail(email)) return setMsg('That Gmail address already has an account.', 'error');

    const { salt, hash } = await hashPassword(password);
    const users = loadUsers();
    users[name.toLowerCase()] = { name, email, salt, hash, created: Date.now() };
    saveUsers(users);

    e.target.reset();
    setTab('login');
    $('#loginUser').value = name;
    setMsg('Account created! Now log in.', 'success');
  });

  /* ---------- Log in / Log out button in the navbar ---------- */
  $('#navLogin').addEventListener('click', () => {
    if (currentUser) {
      setSession(null);
      toast('You are logged out');
    } else {
      openAuth('login');
    }
  });

  /* ---------- buttons that need a log in first (Product, Start, See more, Download) ---------- */
  $$('[data-login-to]').forEach(el => el.addEventListener('click', e => {
    if (currentUser) return;            // logged in: the link opens the page directly
    e.preventDefault();
    openAuth('login', el.dataset.loginTo);
  }));

  /* ---------- toast and copy ---------- */
  const toastEl = $('#toast');
  let toastTimer;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  $$('[data-copy]').forEach(btn => btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      toast('Number copied');
    } catch {
      toast('Could not copy the number');
    }
  }));

  /* ---------- mobile menu ---------- */
  const topbar = $('#topbar');
  const menuBtn = $('#menuBtn');
  menuBtn.addEventListener('click', () => {
    const open = topbar.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(open));
  });
  $$('#navLinks a').forEach(a => a.addEventListener('click', () => {
    topbar.classList.remove('open');
    menuBtn.setAttribute('aria-expanded', 'false');
  }));

  /* ---------- scroll progress, navbar shadow, reveal, year ---------- */
  const progress = $('.progress');
  function onScroll() {
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
    topbar.classList.toggle('scrolled', scrollY > 40);
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);

  const revealIO = new IntersectionObserver((entries, obs) => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        en.target.classList.add('in');
        obs.unobserve(en.target);
      }
    });
  }, { threshold: 0.12 });
  $$('.reveal').forEach(el => revealIO.observe(el));

  $$('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });

  /* ---------- start ---------- */
  addEventListener('hashchange', route);
  updateNav();
  route();
  onScroll();
})();