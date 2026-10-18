# syntax=docker/dockerfile:1.7
#
# LANdscape — single-container build.
#   docker build -t landscape:latest https://github.com/eliasertl/LANdscape.git#main
#
# Stages:
#   build      compiles the client, server and scripts, generates wallpapers
#   prod-deps  installs only the runtime dependencies of the server
#   runtime    slim image, starts as root only to fix data-dir ownership, then drops to "node"

ARG NODE_IMAGE=node:24-alpine

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV CI=true

COPY package.json package-lock.json ./
COPY Shared/package.json Shared/
COPY Server/package.json Server/
COPY Client/package.json Client/
COPY Scripts/package.json Scripts/
RUN npm ci --no-audit --no-fund

COPY tsconfig.base.json ./
COPY Shared Shared
COPY Server Server
COPY Client Client
COPY Scripts Scripts
COPY Assets Assets

# Wallpapers are generated (not downloaded) into Client/public so Vite copies them into the build.
RUN npm run wallpapers -w Scripts \
 && npm run build -w Server \
 && npm run build -w Client \
 && npm run build -w Scripts

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
ENV CI=true
COPY package.json package-lock.json ./
COPY Shared/package.json Shared/
COPY Server/package.json Server/
COPY Client/package.json Client/
COPY Scripts/package.json Scripts/
# Only the server's runtime dependencies; the client is static and sharp is build-only.
RUN npm ci --omit=dev --no-audit --no-fund --workspace=Server --workspace=Shared \
 && npm cache clean --force

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
LABEL org.opencontainers.image.title="LANdscape" \
      org.opencontainers.image.description="A self-hosted macOS-style web desktop for your homeserver." \
      org.opencontainers.image.source="https://github.com/eliasertl/LANdscape" \
      org.opencontainers.image.licenses="MIT"

RUN apk add --no-cache su-exec tini

WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/etc/landscape \
    HOST_PROC=/host/proc \
    HOST_SYS=/host/sys \
    HOST_ROOT=/host/root \
    DOCKER_SOCKET=/var/run/docker.sock \
    SSH_HOST=host.docker.internal \
    SSH_PORT=22 \
    SSH_KEY_PATH=/etc/landscape/ssh/id_ed25519 \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/package.json ./package.json
COPY --from=build /app/Shared/package.json ./Shared/package.json
COPY --from=build /app/Shared/src ./Shared/src
COPY --from=build /app/Server/package.json ./Server/package.json
COPY --from=build /app/Server/dist ./Server/dist
COPY --from=build /app/Client/dist ./Client/dist
COPY --from=build /app/Scripts/dist ./Scripts/dist
COPY Scripts/Entrypoint.sh /usr/local/bin/landscape-entrypoint
COPY Scripts/HashPassword.sh /usr/local/bin/hash-password
RUN chmod +x /usr/local/bin/landscape-entrypoint /usr/local/bin/hash-password \
 && mkdir -p /etc/landscape && chown node:node /etc/landscape

VOLUME ["/etc/landscape"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/landscape-entrypoint"]
CMD ["node", "Server/dist/Main.js"]
