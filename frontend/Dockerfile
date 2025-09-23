# Frontend Dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY frontend .
# Copy PDF.js worker to public directory
RUN mkdir -p ./public && cp ./node_modules/pdfjs-dist/build/pdf.worker.min.mjs ./public/pdf.worker.min.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app .
EXPOSE 3000
CMD ["npm", "run", "start"]
