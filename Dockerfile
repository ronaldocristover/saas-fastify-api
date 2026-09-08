# Build stage: Bun compiles the app into a self-contained bytecode bundle
FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN bun build --compile --minify --sourcemap --bytecode --target=bun ./src/server.ts --outfile ./dist/server

# Production stage: slimmer image with only runtime
FROM oven/bun:1-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --from=build /app/dist/server ./dist/server

EXPOSE 3000
USER bun
CMD ["./dist/server"]
