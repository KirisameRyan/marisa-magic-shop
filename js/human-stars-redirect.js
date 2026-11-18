(() => {
  const { hostname, pathname, protocol, search } = window.location;
  const local = protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
  const origin = local ? 'http://127.0.0.1:8099' : 'https://wiki.azureflame.cloud';
  const id = new URLSearchParams(search).get('id');
  const isEpisode = pathname.endsWith('/human-star.html') && id === 'hs-001';
  const title = isEpisode ? 'Z先生异闻录' : '丙午东海道';

  window.location.replace(origin + '/index.php/' + encodeURIComponent(title));
})();
