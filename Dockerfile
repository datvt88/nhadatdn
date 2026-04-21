FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/frontend/package.json ./apps/frontend/package.json
RUN if [ -f package-lock.json ]; then \
      npm ci --include=dev --no-audit --fund=false --loglevel=error \
      || npm install --include=dev --no-audit --fund=false --loglevel=error; \
    else \
      npm install --include=dev --no-audit --fund=false --loglevel=error; \
    fi \
 && npm dedupe --workspaces --loglevel=error \
 && npm cache clean --force

FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace @proptech/frontend

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup -S nextjs && adduser -S nextjs -G nextjs

COPY --from=builder /app/apps/frontend/public ./apps/frontend/public
COPY --from=builder /app/apps/frontend/.next/standalone ./
COPY --from=builder /app/apps/frontend/.next/static ./apps/frontend/.next/static
RUN mkdir -p /app/apps/frontend/.next/cache && chown -R nextjs:nextjs /app

USER nextjs
EXPOSE 3000
CMD ["node", "apps/frontend/server.js"]