FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
RUN apk add --no-cache \
    chromium \
    chromium-chromedriver \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    pango \
    gcompat \
    python3 \
    make \
    g++

FROM deps AS builder
COPY . .
RUN npm install -g pnpm@8 && pnpm install && pnpm add -w puppeteer esbuild
WORKDIR /app/apps/scraper
RUN npx esbuild src/index.ts --bundle --platform=node --outfile=dist/index.cjs --format=cjs --packages=external
RUN npx esbuild src/db/migrate-runner.ts --bundle --platform=node --outfile=dist/migrate.cjs --format=cjs --packages=external

FROM base AS production
WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer
ENV npm_config_shamefully_hoist=true

RUN apk add --no-cache \
    chromium \
    chromium-chromedriver \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    pango \
    gcompat

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/scraper/package.json ./apps/scraper/
COPY packages/shared ./packages/shared
COPY --from=builder /app/apps/scraper/dist ./apps/scraper/dist
COPY --from=builder /app/tsconfig.base.json ./
COPY db ./db
COPY apps/scraper/src ./apps/scraper/src

RUN npm install -g pnpm@8 && pnpm install --force

# Create non-root user (Alpine BusyBox) for runtime; chown all paths the
# scraper or Puppeteer/Chromium will need to write to (cache, logs, tmp,
# and the user's home for Chromium's runtime cache fallback).
RUN addgroup --system --gid 1001 scraper \
    && adduser --system --uid 1001 --ingroup scraper scraper \
    && mkdir -p /app/.cache/puppeteer /app/logs /app/tmp /home/scraper/.cache \
    && chown -R scraper:scraper /app /home/scraper

USER scraper

# Run migrations first; fail deployment on migration errors.
CMD ["sh", "-c", "node apps/scraper/dist/migrate.cjs && node apps/scraper/dist/index.cjs"]
