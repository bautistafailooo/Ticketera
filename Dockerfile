# Imagen de producción de ecko.
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE}

WORKDIR /app
ENV NODE_ENV=production

# Primero las dependencias (se reutilizan entre versiones si no cambian).
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# postinstall genera el cliente de Prisma; better-sqlite3 baja su binario precompilado.
RUN npm ci --omit=dev

COPY . .

# La base, los flyers, las copias y los mails de prueba viven en /data (volumen persistente).
ENV DATABASE_URL=file:/data/ecko.db \
    UPLOAD_DIR=/data/uploads \
    BACKUP_DIR=/data/backups \
    MAIL_OUTBOX_DIR=/data/mail-outbox \
    PORT=3000 \
    TRUST_PROXY=1

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD node -e "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Aplica las migraciones pendientes y arranca.
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/server.ts"]
