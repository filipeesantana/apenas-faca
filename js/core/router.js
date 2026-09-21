/** Roteamento por hash: funciona em qualquer hospedagem estática (inclusive GitHub Pages). */

export function parseHash(hash = location.hash) {
  const raw = hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return {
    name: parts[0] || 'inicio',
    param: parts[1] ? decodeURIComponent(parts[1]) : null,
    query: Object.fromEntries(new URLSearchParams(qs || '')),
  };
}

export function go(path) {
  const target = `#/${path.replace(/^#?\/?/, '')}`;
  if (location.hash === target) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = target;
}

export function onRoute(fn) {
  window.addEventListener('hashchange', () => {
    // Âncoras internas (ex.: "#fluxo") não são rotas.
    if (location.hash && !location.hash.startsWith('#/')) return;
    fn(parseHash());
  });
}
