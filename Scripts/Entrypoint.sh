#!/bin/sh
# LANdscape container entrypoint.
#
# Runs as root only long enough to make the data directory writable for the
# unprivileged "node" user and to grant access to the Docker socket, then drops
# privileges with su-exec. Set PUID/PGID to match the owner of the data dir.
set -eu

DATA_DIR="${DATA_DIR:-/etc/landscape}"
DOCKER_SOCKET="${DOCKER_SOCKET:-/var/run/docker.sock}"
PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

# A subcommand such as "hash-password" bypasses privilege handling entirely.
case "${1:-}" in
  hash-password) shift; exec /usr/local/bin/hash-password "$@" ;;
esac

if [ "$(id -u)" != "0" ]; then
  # Already unprivileged (e.g. "user:" set in compose): just run.
  exec "$@"
fi

if [ "$PUID" = "0" ]; then
  # Explicit opt-in to run as root (e.g. Docker Desktop, where the socket is root-only).
  echo "[LANdscape] PUID=0: running as root." >&2
  mkdir -p "$DATA_DIR"
  exec "$@"
fi

# Align the node user with the requested uid/gid.
if [ "$PUID" != "$(id -u node)" ] || [ "$PGID" != "$(id -g node)" ]; then
  if ! getent group "$PGID" >/dev/null 2>&1; then
    addgroup -g "$PGID" landscape >/dev/null 2>&1 || true
  fi
  GROUP_NAME="$(getent group "$PGID" | cut -d: -f1)"
  deluser node >/dev/null 2>&1 || true
  adduser -D -H -u "$PUID" -G "$GROUP_NAME" -s /bin/sh node >/dev/null 2>&1 || true
fi

# Data directory: create it and fix ownership only when needed (cheap on restarts).
mkdir -p "$DATA_DIR"
if [ "$(stat -c %u "$DATA_DIR")" != "$(id -u node)" ]; then
  chown -R node:"$(id -g node)" "$DATA_DIR" 2>/dev/null || \
    echo "[LANdscape] Warning: could not chown $DATA_DIR; the server may fail to write its database." >&2
fi
# The SSH private key must be readable by node but should stay 0600.
if [ -f "$DATA_DIR/ssh/id_ed25519" ]; then
  chown node "$DATA_DIR/ssh/id_ed25519" 2>/dev/null || true
  chmod 600 "$DATA_DIR/ssh/id_ed25519" 2>/dev/null || true
fi

# Docker socket: add node to a group with the socket's gid so dockerode can connect.
if [ -S "$DOCKER_SOCKET" ]; then
  SOCK_GID="$(stat -c %g "$DOCKER_SOCKET")"
  if [ "$SOCK_GID" != "0" ]; then
    if ! getent group "$SOCK_GID" >/dev/null 2>&1; then
      addgroup -g "$SOCK_GID" dockersock >/dev/null 2>&1 || true
    fi
    SOCK_GROUP="$(getent group "$SOCK_GID" | cut -d: -f1)"
    addgroup node "$SOCK_GROUP" >/dev/null 2>&1 || true
  else
    echo "[LANdscape] Docker socket is owned by gid 0; the Docker app will not work unless the socket is group-accessible." >&2
  fi
fi

exec su-exec node "$@"
