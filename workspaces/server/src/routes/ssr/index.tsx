import fs from 'node:fs/promises';

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import jsesc from 'jsesc';
import ReactDOMServer from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { ServerStyleSheet } from 'styled-components';
import { SWRConfig, unstable_serialize } from 'swr';

import { authorApiClient } from '@wsh-2024/app/src/features/author/apiClient/authorApiClient';
import { bookApiClient } from '@wsh-2024/app/src/features/book/apiClient/bookApiClient';
import { episodeApiClient } from '@wsh-2024/app/src/features/episode/apiClient/episodeApiClient';
import { featureApiClient } from '@wsh-2024/app/src/features/feature/apiClient/featureApiClient';
import { rankingApiClient } from '@wsh-2024/app/src/features/ranking/apiClient/rankingApiClient';
import { releaseApiClient } from '@wsh-2024/app/src/features/release/apiClient/releaseApiClient';
import { ClientApp } from '@wsh-2024/app/src/index';
import { getDayOfWeekStr } from '@wsh-2024/app/src/lib/date/getDayOfWeekStr';

import { INDEX_HTML_PATH } from '../../constants/paths';
import { getEntryAssets } from '../../utils/viteManifest';

const app = new Hono();

async function createInjectDataStr(path: string): Promise<Record<string, unknown>> {
  const json: Record<string, unknown> = {};

  {
    const dayOfWeek = getDayOfWeekStr(new Date());
    const releases = await releaseApiClient.fetch({ params: { dayOfWeek } });
    json[unstable_serialize(releaseApiClient.fetch$$key({ params: { dayOfWeek } }))] = releases;
  }

  {
    const features = await featureApiClient.fetchList({ query: {} });
    json[unstable_serialize(featureApiClient.fetchList$$key({ query: {} }))] = features;
  }

  {
    const ranking = await rankingApiClient.fetchList({ query: {} });
    json[unstable_serialize(rankingApiClient.fetchList$$key({ query: {} }))] = ranking;
  }

  // ルート固有データの取得（LCP 画像を SSR HTML に含めるため）
  try {
    const bookMatch = path.match(/^\/books\/([^/]+)$/);
    const episodeMatch = path.match(/^\/books\/([^/]+)\/episodes\/([^/]+)$/);
    const authorMatch = path.match(/^\/authors\/([^/]+)$/);

    if (episodeMatch) {
      const bookId = episodeMatch[1]!;
      const episodeId = episodeMatch[2]!;
      const [book, episode] = await Promise.all([
        bookApiClient.fetch({ params: { bookId } }),
        episodeApiClient.fetch({ params: { episodeId } }),
      ]);
      json[unstable_serialize(bookApiClient.fetch$$key({ params: { bookId } }))] = book;
      json[unstable_serialize(episodeApiClient.fetch$$key({ params: { episodeId } }))] = episode;
      // 各エピソード個別データも注入（EpisodeListItem が useEpisode を呼ぶため）
      const episodeDetails = await Promise.all(
        (book.episodes ?? []).map((ep: { id: string }) => episodeApiClient.fetch({ params: { episodeId: ep.id } })),
      );
      for (const ep of episodeDetails) {
        json[unstable_serialize(episodeApiClient.fetch$$key({ params: { episodeId: ep.id } }))] = ep;
      }
    } else if (bookMatch) {
      const bookId = bookMatch[1]!;
      const [book, episodeList] = await Promise.all([
        bookApiClient.fetch({ params: { bookId } }),
        episodeApiClient.fetchList({ query: { bookId } }),
      ]);
      json[unstable_serialize(bookApiClient.fetch$$key({ params: { bookId } }))] = book;
      json[unstable_serialize(episodeApiClient.fetchList$$key({ query: { bookId } }))] = episodeList;
      // 各エピソード個別データも注入（EpisodeListItem が useEpisode を呼ぶため）
      const episodeDetails = await Promise.all(
        episodeList.map((ep) => episodeApiClient.fetch({ params: { episodeId: ep.id } })),
      );
      for (const ep of episodeDetails) {
        json[unstable_serialize(episodeApiClient.fetch$$key({ params: { episodeId: ep.id } }))] = ep;
      }
    } else if (authorMatch) {
      const authorId = authorMatch[1]!;
      const author = await authorApiClient.fetch({ params: { authorId } });
      json[unstable_serialize(authorApiClient.fetch$$key({ params: { authorId } }))] = author;
    }
  } catch {
    // ルート固有データの取得失敗はページ表示に影響しない（クライアントが再取得する）
  }

  return json;
}

function getViteAssetTags(): { scriptTags: string; linkTags: string } {
  const { scripts, styles } = getEntryAssets('src/index.tsx');
  const scriptTags = scripts.map((src) => `<script type="module" src="${src}"></script>`).join('\n    ');
  const linkTags = styles.map((href) => `<link rel="stylesheet" href="${href}">`).join('\n    ');
  return { scriptTags, linkTags };
}

async function createHTML({
  body,
  injectData,
  styleTags,
}: {
  body: string;
  injectData: Record<string, unknown>;
  styleTags: string;
}): Promise<string> {
  const htmlContent = await fs.readFile(INDEX_HTML_PATH, 'utf-8');

  const { scriptTags, linkTags } = getViteAssetTags();

  const content = htmlContent
    .replaceAll('<div id="root"></div>', `<div id="root">${body}</div>`)
    .replaceAll('<style id="tag"></style>', styleTags)
    .replaceAll('<!-- VITE_SCRIPTS -->', scriptTags)
    .replaceAll('<!-- VITE_STYLES -->', linkTags)
    .replaceAll(
      '<script id="inject-data" type="application/json"></script>',
      `<script id="inject-data" type="application/json">
        ${jsesc(injectData, {
          isScriptContext: true,
          json: true,
          minimal: true,
        })}
      </script>`,
    );

  return content;
}

app.get('*', async (c) => {
  const injectData = await createInjectDataStr(c.req.path);
  const sheet = new ServerStyleSheet();

  try {
    const body = ReactDOMServer.renderToString(
      sheet.collectStyles(
        <SWRConfig value={{ fallback: injectData, suspense: true }}>
          <StaticRouter location={c.req.path}>
            <ClientApp />
          </StaticRouter>
        </SWRConfig>,
      ),
    );

    const styleTags = sheet.getStyleTags();
    const html = await createHTML({ body, injectData, styleTags });

    return c.html(html);
  } catch (cause) {
    throw new HTTPException(500, { cause, message: 'SSR error.' });
  } finally {
    sheet.seal();
  }
});

export { app as ssrApp };
