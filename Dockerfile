# Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml* ./
COPY svelte.config.js vite.config.ts tsconfig.json ./

RUN pnpm install --frozen-lockfile || pnpm install

COPY src/ ./src/
COPY static/ ./static/

RUN pnpm build

# Production Stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml* ./

RUN pnpm install --prod --frozen-lockfile || pnpm install --prod

COPY --from=builder /app/build ./build

# Create output directory
RUN mkdir -p /app/output

EXPOSE 3000

CMD ["node", "build/index.js"]
