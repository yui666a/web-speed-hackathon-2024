FROM node:20.11.1-alpine

WORKDIR /usr/src/app

# ビルドツールのインストール
RUN apk --no-cache add \
    tzdata \
    python3 \
    make \
    g++ && \
    cp /usr/share/zoneinfo/Asia/Tokyo /etc/localtime && \
    apk del tzdata

RUN apk --no-cache add jemalloc
ENV LD_PRELOAD=/usr/lib/libjemalloc.so.2

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY workspaces/client/package.json workspaces/client/
COPY workspaces/server/package.json workspaces/server/
COPY workspaces/app/package.json workspaces/app/
COPY workspaces/admin/package.json workspaces/admin/
COPY workspaces/schema/package.json workspaces/schema/
COPY workspaces/image-encrypt/package.json workspaces/image-encrypt/
COPY workspaces/testing/package.json workspaces/testing/

RUN corepack enable pnpm
RUN pnpm install
RUN cd node_modules/.pnpm/better-sqlite3@9.3.0/node_modules/better-sqlite3 && npx --yes prebuild-install -r napi || npx --yes node-gyp rebuild --release

COPY . .
RUN pnpm build

ENV PORT 8000
EXPOSE 8000

ENTRYPOINT ["pnpm"]
CMD ["start"]
