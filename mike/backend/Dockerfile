FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim
# poppler-utils liefert pdftoppm — wird zum Rastern gescannter und
# handschriftlicher PDFs vor der Bilderkennung gebraucht. Ohne das Paket fällt
# der Code auf eine deutlich schlechtere Eigenimplementierung zurück, die
# Handschrift unlesbar macht (siehe renderPdfPagesToBase64 in chatTools.ts).
RUN apt-get update && \
    apt-get install -y --no-install-recommends libreoffice poppler-utils curl && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3001
CMD ["node", "dist/index.js"]
