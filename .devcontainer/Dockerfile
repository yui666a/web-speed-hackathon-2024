FROM node:22-bookworm

# Chrome / Lighthouse / native-module build deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-ipafont-gothic \
    fonts-noto-cjk \
    python3 \
    make \
    g++ \
    git \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Lighthouse needs CHROME_PATH
ENV CHROME_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# pnpm
RUN corepack enable pnpm

# Global CLI tools
RUN npm install -g lighthouse chrome-devtools-mcp

WORKDIR /workspace
