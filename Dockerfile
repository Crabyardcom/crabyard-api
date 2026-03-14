FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src/ src/
COPY migrations/ migrations/

EXPOSE 3000
CMD ["bun", "src/index.ts"]
