(() => {
  const panel = document.getElementById('wikiSignIn');
  const status = document.getElementById('wikiSignInStatus');
  const button = document.getElementById('wikiSignInButton');

  async function signIn() {
    const params = new URLSearchParams(panel.dataset.request);
    params.set('action', 'issue');
    button.hidden = true;
    status.textContent = '正在登录 Wiki。';
    const result = await Auth.api('api/wiki-auth.php', { method: 'POST', body: params });
    if (!result.ok) {
      status.textContent = result.error || '当前无法登录 Wiki，请重试。';
      button.hidden = false;
      return;
    }
    const callback = new URL(params.get('callback'));
    callback.searchParams.set('mmsWikiCode', result.code);
    window.location.replace(callback);
  }

  button.addEventListener('click', () => Auth.openModal('login', signIn));
  Auth.verify().then(result => {
    if (result.ok && !result.user.is_guest) {
      signIn();
      return;
    }
    status.textContent = '请登录已注册的官网账号。游客仍可直接浏览 Wiki。';
    button.hidden = false;
  });
})();
