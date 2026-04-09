# Multi-stage build for the Pathfinder Nexus Next.js app.
# Produces a minimal standalone image suitable for Scaleway Serverless
# Containers. Follows the official Next.js standalone pattern so the
# runner stage never carries devDependencies, source files, or the full
# node_modules tree.

# ---- base ----
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ---- deps ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- builder ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runner ----
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root user for the running container.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Standalone output contains its own minimal node_modules.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# Scaleway Serverless Containers probes /api/health over HTTP; no Docker
# HEALTHCHECK needed since Scaleway uses its own liveness configuration.
CMD ["node", "server.js"]
