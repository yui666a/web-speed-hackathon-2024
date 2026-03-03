// Minimal path shim to avoid bundling path-browserify
export function parse(p: string) {
  const lastSlash = p.lastIndexOf('/');
  const base = lastSlash !== -1 ? p.slice(lastSlash + 1) : p;
  const dotIndex = base.lastIndexOf('.');
  const ext = dotIndex !== -1 ? base.slice(dotIndex) : '';
  const name = dotIndex !== -1 ? base.slice(0, dotIndex) : base;
  return {
    dir: lastSlash !== -1 ? p.slice(0, lastSlash) : '',
    root: p.startsWith('/') ? '/' : '',
    base,
    name,
    ext,
  };
}

export default { parse };
