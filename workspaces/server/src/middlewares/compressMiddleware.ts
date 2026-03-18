import { Readable } from 'node:stream';
import { createBrotliCompress, createGzip, constants as zlibConstants } from 'node:zlib';

import { encoding } from '@hapi/accept';
import { ZstdInit } from '@oneidentity/zstd-js/asm/index.cjs.js';
import { createMiddleware } from 'hono/factory';

const zstdInit = ZstdInit();

export const compressMiddleware = createMiddleware(async (c, next) => {
  await next();

  if (!c.res.body) return;

  // SW 用のカスタム zstd 圧縮（X-Accept-Encoding ヘッダ経由）
  const xAccept = encoding(c.req.header('X-Accept-Encoding'), ['zstd']);
  if (xAccept === 'zstd') {
    const { ZstdStream } = await zstdInit;
    const transform = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(ZstdStream.compress(chunk, 12, false));
      },
    });

    c.res = new Response(c.res.body.pipeThrough(transform), c.res);
    c.res.headers.delete('Content-Length');
    c.res.headers.append('Cache-Control', 'no-transform');
    c.res.headers.set('X-Content-Encoding', 'zstd');
    return;
  }

  // 標準の gzip/brotli 圧縮（Accept-Encoding ヘッダ経由）
  const accept = encoding(c.req.header('Accept-Encoding'), ['br', 'gzip']);

  if (accept !== 'br' && accept !== 'gzip') {
    c.res.headers.append('Cache-Control', 'no-transform');
    return;
  }

  const compressStream = accept === 'br'
    ? createBrotliCompress({ params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 } })
    : createGzip({ level: 6 });

  const reader = c.res.body.getReader();
  const nodeReadable = new Readable({
    async read() {
      const { done, value } = await reader.read();
      if (done) {
        this.push(null);
      } else {
        this.push(Buffer.from(value));
      }
    },
  });

  const compressed = Readable.toWeb(nodeReadable.pipe(compressStream)) as ReadableStream<Uint8Array>;

  c.res = new Response(compressed, c.res);
  c.res.headers.delete('Content-Length');
  c.res.headers.set('Content-Encoding', accept);
});
