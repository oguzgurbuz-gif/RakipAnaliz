FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/dashboard ./apps/dashboard
WORKDIR /app
RUN npm install -g pnpm@8.15.0 && pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/tsconfig.base.json ./
COPY --from=deps /app/packages/shared ./packages/shared
COPY --from=deps /app/apps/dashboard ./apps/dashboard
RUN npm install -g pnpm@8.15.0
WORKDIR /app/apps/dashboard
RUN pnpm build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/package.json ./apps/dashboard/package.json
COPY --from=builder --chown=nextjs:nodejs /app/packages/shared ./packages/shared

RUN sed -i '/"@bitalih\/shared": "workspace:\*"/d' ./apps/dashboard/package.json

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

CMD ["node", "server.js"]
