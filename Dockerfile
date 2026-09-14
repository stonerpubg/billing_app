# ---- Build stage ----
FROM node:20-bookworm-slim AS build

WORKDIR /app

# Install build deps for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
# We build against Node (not Electron), skip electron postinstall step
RUN npm ci --ignore-scripts

COPY . .

# Rebuild native modules for Node (default) — better-sqlite3 (session store)
# and deasync (sync wrapper around libsql). libsql's own prebuilt is a plain
# .node file pulled in via npm's optionalDependencies, no rebuild needed.
RUN npm rebuild better-sqlite3 deasync

# Build the Vite frontend into dist/
RUN npm run build:vite

# ---- Runtime stage ----
FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/data

# libsql's Rust binding uses the OS trust store for TLS to Turso, so the
# runtime image needs ca-certificates even though we don't need any build tools.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy only what's needed to run
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/electron ./electron
COPY --from=build /app/server ./server
COPY --from=build /app/package.json ./package.json

# Local libSQL embedded-replica cache lives here. The authoritative copy is in
# Turso, so /data is a cache, not primary storage. Render's free tier wipes
# this on restart; libSQL just re-hydrates from Turso on next boot.
RUN mkdir -p /data

EXPOSE 8080

CMD ["node", "server/index.js"]
