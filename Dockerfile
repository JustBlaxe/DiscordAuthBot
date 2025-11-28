FROM oven/bun:1-debian AS base

WORKDIR /app

RUN apt-get update && apt-get install -y \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgif7 \
    libjpeg62-turbo \
    librsvg2-2 \
    && rm -rf /var/lib/apt/lists/*

FROM base AS install
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

FROM base AS release
COPY --from=install /app/node_modules ./node_modules
COPY . .

VOLUME ["/app/data"]

ENV DB_PATH=/app/data/authbot.db

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]