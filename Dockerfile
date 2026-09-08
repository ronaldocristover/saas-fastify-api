# Build stage
FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

# Production stage: Alpine for size. argon2@0.45 ships a musl prebuild
# (prebuilds/linux-x64/argon2.musl.node), so no build tools are needed.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod \
  # Prune non-runtime artifacts pnpm leaves behind (headers, maps, docs).
  && find node_modules -name "*.md" -o -name "*.map" -o -name "*.d.ts" -o -name "*.ts" | xargs rm -f 2>/dev/null || true

COPY --from=build /app/dist ./dist

EXPOSE 3000
USER node
CMD ["node", "dist/server.js"]