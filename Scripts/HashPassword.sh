#!/bin/sh
# Generates a bcrypt hash for LOGIN_PASSWORD_HASH inside the container:
#   docker run --rm -it landscape:latest hash-password
#   docker run --rm landscape:latest hash-password 'my password'
exec node /app/Scripts/dist/HashPassword.js "$@"
