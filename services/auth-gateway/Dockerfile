# SEC-A2 auth gateway. Not built, not pushed, not deployed by this round.
FROM node:20-slim

# Dependencies first, so a source change does not reinstall them.
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src

# Run as a non-root user. The base image ships one; using it costs nothing and removes a whole class
# of container escape from the conversation.
USER node

# Cloud Run supplies PORT and expects the container to listen on it. Hard-coding 8080 works today and
# is exactly the kind of assumption that breaks on a platform change, so it is read from the
# environment with 8080 only as a local default.
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "src/index.js"]
