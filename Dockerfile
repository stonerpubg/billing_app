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

# Rebuild native modules for Node (default) so better-sqlite3 works in the runtime
RUN npm rebuild better-sqlite3

# Build the Vite frontend into dist/
RUN npm run build:vite

# ---- Runtime stage ----
FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/data

# Copy only what's needed to run
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/electron ./electron
COPY --from=build /app/server ./server
COPY --from=build /app/package.json ./package.json

# Persistent data lives here — mount a volume to /data in production
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 8080

CMD ["node", "server/index.js"]
