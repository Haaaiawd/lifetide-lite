# ── Lifetide-Lite production image ──
# Multi-stage build: install deps → build → runtime

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.24.0 --activate

# ── Stage 1: install all dependencies ──
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# ── Stage 2: build ──
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ── Stage 3: runtime ──
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy all node_modules (includes prisma CLI for migrations)
COPY --from=deps /app/node_modules ./node_modules

# Copy build output and app files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts

# Create data directory for SQLite
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

# Run migrations then start
CMD ["sh", "-c", "npx prisma db push --skip-generate && node node_modules/next/dist/bin/next start"]
