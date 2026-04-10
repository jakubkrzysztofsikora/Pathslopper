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
# No `public/` directory exists in the repo yet, so we skip copying it.
# Re-add `COPY --from=builder /app/public ./public` once static assets land.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# RAG JSON files are loaded at runtime via fs.readFileSync (not static import)
# so Next.js standalone does not bundle them automatically. Copy explicitly.
# srd-embeddings.json ships as a placeholder stub when real vectors haven't been
# computed yet; the app falls back to uniform-score retrieval in that case.
# Re-run `compute-srd-embeddings` whenever srd-chunks.json changes and commit
# the updated srd-embeddings.json before the next Docker build.
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/rag/srd-chunks.json ./src/lib/rag/srd-chunks.json
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/rag/srd-embeddings.json ./src/lib/rag/srd-embeddings.json

USER nextjs
EXPOSE 3000

# Scaleway Serverless Containers probes /api/health over HTTP; no Docker
# HEALTHCHECK needed since Scaleway uses its own liveness configuration.
CMD ["node", "server.js"]
