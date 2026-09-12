# ==================================================================================================
# KM AUTH GATEWAY — PRODUCTION IMAGE                                             SEC-A2R §6
# ==================================================================================================
# NOT BUILT, NOT PUSHED, NOT DEPLOYED BY ANY ROUND SO FAR. There is no Artifact Registry repository,
# no image, and no Cloud Run service. This file is a specification that has never been executed:
# the machine this was written on has no container runtime, which is recorded as
# STOP_LOCAL_CONTAINER_RUNTIME_UNAVAILABLE rather than papered over.
#
# THE BUILD IS TWO STAGES BECAUSE AN IMAGE LAYER IS FOREVER. `rm` in a later layer does not remove a
# file from an earlier one — it is still in the image, still in the registry, and still pullable by
# anyone who can pull the tag. So the runtime stage does not DELETE the build tooling; it never
# receives it. Only `node_modules` and `src` cross the stage boundary.
# ==================================================================================================

# --------------------------------------------------------------------------------------------------
# Stage 1 — dependencies only
# --------------------------------------------------------------------------------------------------
# PINNED TO THE EXACT NODE THAT RAN EVERY TEST IN THIS ROUND. `node:24` would float to a new patch
# without a commit, and `node:latest` would float across major versions — a base image that changes
# on its own is a change nobody reviewed.
#
# USER: PIN THE DIGEST ON FIRST BUILD. A tag is a mutable pointer; `@sha256:...` is the image. The
# runbook has the step, and it is the difference between "we build Node 24.14.0" and "we build
# whatever is called 24.14.0 today".
FROM node:24.14.0-bookworm-slim AS deps

WORKDIR /app

# The lockfile is copied WITH the manifest because `npm ci` refuses to run without it — which is the
# property being bought here. `npm install` would resolve versions afresh at build time and could
# produce a tree that no one has audited; `npm ci` installs the audited one or fails.
COPY package.json package-lock.json ./

# --omit=dev       nothing that only a test needs reaches the runtime stage
# --ignore-scripts no package may execute code during install. The tree was inspected: it declares
#                  ZERO preinstall/install/postinstall hooks, and the five `prepare` hooks belong to
#                  packages built from source only when installed from git — npm does not run them
#                  for a registry tarball. So this flag removes a capability nothing is using, which
#                  is the only kind of hardening that costs nothing.
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

# --------------------------------------------------------------------------------------------------
# Stage 2 — the runtime
# --------------------------------------------------------------------------------------------------
FROM node:24.14.0-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=8080 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

# Ownership is set during COPY rather than by a later `chown`, which would duplicate every file into
# a new layer at twice the size for no benefit.
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src

# WHAT IS DELIBERATELY ABSENT: apps-script-verifier/ (Apps Script source, not runtime), README.md and
# every runbook (they describe how to reach production), .env.example, and the whole of assets/tests —
# which generates RSA key pairs and mints JWTs. A test private key inside a production container has
# exactly one possible use, and it is not testing.

# NON-ROOT. The base image ships an unprivileged `node` user; using it costs nothing and takes a whole
# class of container escape out of the conversation. Declared AFTER the copies so the copies can set
# ownership, and before anything runs.
USER node

EXPOSE 8080

# The process handles SIGTERM itself and drains — see src/index.js. Node as PID 1 does not reap
# orphans, which is irrelevant here because this process never forks.
STOPSIGNAL SIGTERM

# Cloud Run uses its own probes and ignores this; it is here so that a local `docker run` reports the
# same readiness the platform will. `node -e` is used because the slim image has no curl and adding
# one would put an HTTP client into a production image to check a service that is already an HTTP
# client.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Exec form, so the process IS PID 1 and receives SIGTERM directly. The shell form would put /bin/sh
# at PID 1, and sh does not forward signals — the drain in index.js would never run, and every deploy
# would cut its in-flight requests.
CMD ["node", "src/index.js"]

# --------------------------------------------------------------------------------------------------
# Running it locally, once a runtime exists:
#
#   docker build -t km-auth-gateway:dev .
#   docker run --rm -p 8080:8080 \
#     --read-only --tmpfs /tmp \
#     --cap-drop ALL --security-opt no-new-privileges \
#     -e GOOGLE_OAUTH_CLIENT_ID=... -e ALLOWED_ORIGINS=... -e APPS_SCRIPT_EXEC_URL=... \
#     -e HMAC_ACTIVE_KEY_ID=k1 -e HMAC_ACTIVE_KEY_FILE=/var/secrets/kmga/active \
#     -e OPERATOR_REGISTRY_FILE=/var/run/operators.json \
#     -v "$PWD/secrets:/var/secrets/kmga:ro" km-auth-gateway:dev
#
# --read-only is expected to work unmodified: the process writes nothing to disk. It reads the mounted
# secret on every request and logs to stdout, which is where a container's logs belong — a log FILE
# inside a container is lost when the instance goes away, which on Cloud Run is constantly.
# --------------------------------------------------------------------------------------------------
