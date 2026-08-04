// =============================================
//  霧雨魔法店 · 账号模块 (全局)
//  注入: 右上角登录入口 + 登录/注册/找回弹窗
//  依赖: css/common.css 中的 .mms-auth-* 样式
//  API: Auth.login/register/logout/forgot/reset/verify
//        Auth.user() Auth.isLoggedIn() Auth.onAuth(fn)
//        Auth.openModal(view, onLoggedIn) Auth.loginPrompt(el, onLoggedIn)
// =============================================
(function() {
  var TOKEN_KEY = 'mms_token';
  var USER_KEY  = 'mms_user';
  var listeners = [];
  var loginCb   = null;

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (e) { return null; }
  }
  function setSession(token, user) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (e) {}
    notify();
  }
  function clearSession() {
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch (e) {}
    notify();
  }
  function notify() {
    var u = getUser();
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](u); } catch (e) {}
    }
  }
  function isLoggedIn() { return !!getToken(); }

  // ── 请求封装：自动带 token，401 时清除本地会话 ──
  function api(path, opts) {
    opts = opts || {};
    var headers = opts.headers || {};
    var token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var cfg = { method: opts.method || 'GET', headers: headers };
    if (opts.body) cfg.body = opts.body;
    return fetch(API_BASE + path, cfg).then(function(r) {
      return r.json().then(function(j) {
        if (r.status === 401 && !opts.silent) clearSession();
        return j;
      });
    });
  }

  function formAction(action, extra) {
    var f = new FormData();
    f.append('action', action);
    for (var k in (extra || {})) f.append(k, extra[k]);
    return f;
  }

  function login(username, password) {
    return api('api/auth.php', {
      method: 'POST', silent: true,
      body: formAction('login', { username: username, password: password })
    }).then(function(res) {
      if (res.ok) setSession(res.token, res.user);
      return res;
    });
  }
  function register(username, email, password) {
    return api('api/auth.php', {
      method: 'POST', silent: true,
      body: formAction('register', { username: username, email: email, password: password })
    }).then(function(res) {
      if (res.ok) setSession(res.token, res.user);
      return res;
    });
  }
  function logout() {
    api('api/auth.php', { method: 'POST', silent: true, body: formAction('logout') });
    clearSession();
  }
  function forgot(email) {
    return api('api/auth.php', { method: 'POST', silent: true, body: formAction('forgot', { email: email }) });
  }
  function reset(token, password) {
    return api('api/auth.php', { method: 'POST', silent: true, body: formAction('reset', { token: token, password: password }) });
  }
  // 打开页面时校验一次会话
  function verify() {
    if (!isLoggedIn()) return;
    api('api/auth.php', { silent: true }).then(function(res) {
      if (!res.ok) clearSession();
    });
  }
  function onAuth(fn) {
    listeners.push(fn);
    fn(getUser());
    return fn;
  }

  // ═══════════ 弹窗 ═══════════
  var mask = null;

  function ensureModal() {
    if (mask) return;
    mask = document.createElement('div');
    mask.id = 'mmsAuthModal';
    mask.className = 'mms-auth-mask';
    mask.style.display = 'none';
    mask.innerHTML =
      '<div class="mms-auth-card">' +
        '<button class="mms-auth-close" id="mmsAuthClose" aria-label="关闭">✕</button>' +
        '<div class="mms-auth-title">霧雨魔法店 · 账号</div>' +
        '<div class="mms-auth-tabs">' +
          '<button type="button" data-view="login" class="on">登录</button>' +
          '<button type="button" data-view="register">注册</button>' +
        '</div>' +
        '<form id="mmsAuthLoginForm" class="mms-auth-view">' +
          '<input name="username" maxlength="12" autocomplete="username" placeholder="用户名">' +
          '<input name="password" type="password" maxlength="32" autocomplete="current-password" placeholder="密码">' +
          '<div class="mms-auth-err"></div>' +
          '<button type="submit" class="mms-auth-btn">登 录</button>' +
          '<a href="javascript:void(0)" class="mms-auth-link" id="mmsAuthGoForgot">忘记密码？</a>' +
        '</form>' +
        '<form id="mmsAuthRegForm" class="mms-auth-view" style="display:none">' +
          '<input name="username" maxlength="12" autocomplete="username" placeholder="用户名（2-12位 中英文/数字/_）">' +
          '<input name="email" type="email" maxlength="100" autocomplete="email" placeholder="邮箱（找回密码用）">' +
          '<input name="password" type="password" maxlength="32" autocomplete="new-password" placeholder="密码（6-32位）">' +
          '<label class="mms-auth-terms"><input type="checkbox" id="mmsAuthAgree">我已阅读并同意<a href="javascript:void(0)" id="mmsAuthTermsLink">《用户须知》</a></label>' +
          '<div class="mms-auth-terms-box" id="mmsAuthTermsBox">' +
            '<b>账户用途</b><br>' +
            '账号用于排行榜身份、游戏成绩，以及未来的记账等新功能。<br>' +
            '<b>邮箱用途</b><br>' +
            '仅用于找回密码，不会发送广告或营销邮件。<br>' +
            '<b>数据存储</b><br>' +
            '你的用户名、邮箱和成绩仅保存在本站服务器（azureflame.cloud），不会提供给任何第三方。<br>' +
            '<b>账号安全</b><br>' +
            '请勿在其他网站使用相同密码。忘记密码可通过注册邮箱重置。' +
          '</div>' +
          '<div class="mms-auth-err"></div>' +
          '<button type="submit" class="mms-auth-btn">注 册</button>' +
        '</form>' +
        '<form id="mmsAuthForgotForm" class="mms-auth-view" style="display:none">' +
          '<div class="mms-auth-hint">输入注册邮箱，重置链接将发送到该邮箱（30 分钟内有效）</div>' +
          '<input name="email" type="email" maxlength="100" placeholder="注册邮箱">' +
          '<div class="mms-auth-err"></div>' +
          '<button type="submit" class="mms-auth-btn">发送重置链接</button>' +
          '<a href="javascript:void(0)" class="mms-auth-link" id="mmsAuthBackLogin">← 返回登录</a>' +
        '</form>' +
      '</div>';
    document.body.appendChild(mask);

    mask.addEventListener('click', function(e) {
      if (e.target === mask) closeModal();
    });
    document.getElementById('mmsAuthClose').addEventListener('click', closeModal);
    document.getElementById('mmsAuthGoForgot').addEventListener('click', function() { showView('forgot'); });
    document.getElementById('mmsAuthBackLogin').addEventListener('click', function() { showView('login'); });

    var termsLink = document.getElementById('mmsAuthTermsLink');
    var termsBox = document.getElementById('mmsAuthTermsBox');
    if (termsLink) {
      termsLink.addEventListener('click', function() {
        var show = termsBox.style.display !== 'block';
        termsBox.style.display = show ? 'block' : 'none';
      });
    }

    var tabs = mask.querySelectorAll('.mms-auth-tabs button');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function() { showView(this.getAttribute('data-view')); });
    }
    bindSubmit('mmsAuthLoginForm', function(f) {
      var btn = f.querySelector('.mms-auth-btn');
      setBusy(btn, true, '登录中...');
      return login(f.username.value.trim(), f.password.value).then(function(res) {
        setBusy(btn, false);
        if (res.ok) { onLoggedIn(); return; }
        showErr(f, res.error || '登录失败');
      });
    });
    bindSubmit('mmsAuthRegForm', function(f) {
      var agree = document.getElementById('mmsAuthAgree');
      if (!agree || !agree.checked) {
        showErr(f, '请先阅读并勾选同意《用户须知》');
        return;
      }
      var btn = f.querySelector('.mms-auth-btn');
      setBusy(btn, true, '注册中...');
      return register(f.username.value.trim(), f.email.value.trim(), f.password.value).then(function(res) {
        setBusy(btn, false);
        if (res.ok) { onLoggedIn(); return; }
        showErr(f, res.error || '注册失败');
      });
    });
    bindSubmit('mmsAuthForgotForm', function(f) {
      var btn = f.querySelector('.mms-auth-btn');
      setBusy(btn, true, '发送中...');
      return forgot(f.email.value.trim()).then(function(res) {
        setBusy(btn, false);
        if (res.ok) {
          f.style.display = 'none';
          mask.querySelector('.mms-auth-title').textContent = '📮 邮件已寄出';
          var ok = document.createElement('div');
          ok.className = 'mms-auth-hint';
          ok.style.marginTop = '8px';
          ok.textContent = '如果该邮箱已注册，重置链接已发送，请查收（含垃圾箱）。';
          f.parentNode.insertBefore(ok, f);
          return;
        }
        showErr(f, res.error || '发送失败');
      });
    });
  }

  function bindSubmit(formId, handler) {
    var f = document.getElementById(formId);
    f.addEventListener('submit', function(e) {
      e.preventDefault();
      handler(f);
    });
  }
  function setBusy(btn, busy, text) {
    if (busy) { btn.dataset.txt = btn.textContent; btn.disabled = true; btn.textContent = text; }
    else { btn.disabled = false; btn.textContent = btn.dataset.txt || btn.textContent; }
  }
  function showErr(form, msg) {
    var el = form.querySelector('.mms-auth-err');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(function() { el.style.display = 'none'; }, 4000);
  }
  function showView(view) {
    ensureModal();
    var forms = { login: 'mmsAuthLoginForm', register: 'mmsAuthRegForm', forgot: 'mmsAuthForgotForm' };
    for (var k in forms) {
      var el = document.getElementById(forms[k]);
      var tab = mask.querySelector('.mms-auth-tabs button[data-view="' + k + '"]');
      if (k === view) {
        el.style.display = '';
        if (tab) tab.classList.add('on');
      } else {
        el.style.display = 'none';
        if (tab) tab.classList.remove('on');
      }
    }
    var title = mask.querySelector('.mms-auth-title');
    if (title) title.textContent = '霧雨魔法店 · 账号';
  }
  function openModal(view, cb) {
    ensureModal();
    loginCb = cb || null;
    showView(view || 'login');
    mask.style.display = 'flex';
    setTimeout(function() {
      var f = document.getElementById(view === 'register' ? 'mmsAuthRegForm' : (view === 'forgot' ? 'mmsAuthForgotForm' : 'mmsAuthLoginForm'));
      if (f) { var inp = f.querySelector('input'); if (inp) inp.focus(); }
    }, 50);
  }
  function closeModal() {
    if (!mask) return;
    mask.style.display = 'none';
    loginCb = null;
  }
  function onLoggedIn() {
    var cb = loginCb;
    closeModal();
    if (cb) try { cb(); } catch (e) {}
  }

  // ═══════════ 排行榜登录提示块 ═══════════
  function loginPrompt(el, onLoggedIn) {
    var d = document.createElement('div');
    d.className = 'lb-wrap';
    d.innerHTML =
      '<p class="lb-note">🔒 排行榜需登录后使用</p>' +
      '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">' +
        '<button class="lb-btn" id="mmsLbLoginBtn" style="width:auto;padding:8px 20px">登录 / 注册</button>' +
      '</div>';
    el.innerHTML = '';
    el.appendChild(d);
    document.getElementById('mmsLbLoginBtn').addEventListener('click', function() {
      openModal('login', onLoggedIn);
    });
  }

  // ═══════════ 右上角入口 ═══════════
  function injectEntry() {
    var btn = document.createElement('button');
    btn.id = 'mmsAuthEntry';
    btn.className = 'mms-auth-entry';
    btn.textContent = '👤 登录';
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (isLoggedIn()) toggleMenu();
      else openModal('login');
    });
    document.body.appendChild(btn);

    var menu = document.createElement('div');
    menu.id = 'mmsAuthMenu';
    menu.className = 'mms-auth-menu';
    menu.style.display = 'none';
    menu.innerHTML =
      '<div class="mms-auth-menu-name"></div>' +
      '<button id="mmsAuthLogout" class="mms-auth-menu-item">退出登录</button>';
    document.body.appendChild(menu);
    document.getElementById('mmsAuthLogout').addEventListener('click', function() {
      menu.style.display = 'none';
      logout();
    });

    function toggleMenu() {
      var show = menu.style.display === 'none';
      menu.style.display = show ? 'block' : 'none';
      if (show) {
        var r = btn.getBoundingClientRect();
        menu.style.top = (r.bottom + 6) + 'px';
        menu.style.right = (Math.max(8, window.innerWidth - r.right)) + 'px';
      }
    }
    document.addEventListener('click', function(e) {
      if (!btn.contains(e.target) && !menu.contains(e.target)) menu.style.display = 'none';
    });

    function refresh(user) {
      var name = document.querySelector('.mms-auth-menu-name');
      if (user) {
        btn.textContent = '👤 ' + user.username;
        btn.title = user.email || '';
        if (name) name.textContent = user.username + ' · 已登录';
      } else {
        btn.textContent = '👤 登录';
        if (name) name.textContent = '';
      }
    }
    onAuth(refresh);
    verify();
  }

  // ── 导出 ──
  window.Auth = {
    isLoggedIn: isLoggedIn,
    user: getUser,
    token: getToken,
    login: login,
    register: register,
    logout: logout,
    forgot: forgot,
    reset: reset,
    verify: verify,
    onAuth: onAuth,
    openModal: openModal,
    closeModal: closeModal,
    loginPrompt: loginPrompt,
    api: api
  };

  // ── 启动（等 DOM 就绪）──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectEntry);
  } else {
    injectEntry();
  }
})();
