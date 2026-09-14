# ==================== BUILDER ====================
FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache make gcc g++ python3 openssl libc6-compat

COPY package*.json ./
COPY prisma ./prisma/
COPY tsconfig*.json ./

RUN npm ci && npm cache clean --force
RUN npx prisma generate

COPY . .
RUN npm run build
RUN test -f dist/src/main.js || (echo "Build failed: dist/src/main.js no encontrado" && ls -la dist/ && exit 1)

# ==================== PRODUCCION ====================
FROM node:22-alpine AS production

RUN apk add --no-cache openssl dumb-init libc6-compat

RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev && npm cache clean --force
RUN npx prisma generate

COPY --from=builder /app/dist ./dist
RUN test -f dist/src/main.js || (echo "Copy failed: dist/src/main.js no encontrado" && exit 1)

COPY --from=builder /app/public ./public

RUN mkdir -p public/images public/documents public/users_avatar public/content && \
    chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 4000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/src/main.js"]
