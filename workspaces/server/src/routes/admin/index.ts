import fs from 'node:fs/promises';

import { Hono } from 'hono';

import { INDEX_HTML_PATH } from '../../constants/paths';
import { getEntryAssets } from '../../utils/viteManifest';

const app = new Hono();

async function getAdminHTML(): Promise<string> {
  let html = await fs.readFile(INDEX_HTML_PATH, 'utf-8');

  const { scripts, styles } = getEntryAssets('src/index.tsx');
  const scriptTags = scripts.map((src) => `<script type="module" src="${src}"></script>`).join('\n    ');
  const linkTags = styles.map((href) => `<link rel="stylesheet" href="${href}">`).join('\n    ');

  html = html
    .replaceAll('<!-- VITE_SCRIPTS -->', scriptTags)
    .replaceAll('<!-- VITE_STYLES -->', linkTags);

  return html;
}

app.get('/admin', async (c) => {
  const html = await getAdminHTML();
  return c.html(html);
});

app.get('/admin/*', async (c) => {
  const html = await getAdminHTML();
  return c.html(html);
});

export { app as adminApp };
