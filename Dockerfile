# LiteFS imagen base
FROM flyio/litefs:0.5 AS litefs

# Builder imagen base (Bun)
FROM oven/bun:1.2.18-alpine AS builder
WORKDIR /app

COPY package.json bun.lock tsconfig.json ./

RUN bun install --production --frozen-lockfile

COPY . .

RUN bun build --compile --minify-whitespace --minify-syntax --target bun --outfile server ./src/index.ts

# Production imagen base
FROM alpine:latest

# Install LiteFS on Production File System
COPY --from=litefs /usr/local/bin/litefs /usr/local/bin/litefs

# LiteFS Dependencies
RUN apk add ca-certificates fuse3 sqlite libstdc++ libgcc

RUN mkdir -p /var/lib/litefs /litefs

WORKDIR /app
COPY --from=builder /app/server .

# LiteFS Config
COPY litefs.yml /etc/litefs.yml

ENTRYPOINT ["litefs", "mount", "-config", "/etc/litefs.yml"]
