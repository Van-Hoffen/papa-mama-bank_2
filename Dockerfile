# Multi-stage Dockerfile for Papa Mama Bank 2

# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Production Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE=/app/data/bank.db

# Create directory for persistent SQLite database
RUN mkdir -p /app/data

# Copy backend package dependencies and install production modules
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --only=production

# Copy backend code and production runner
COPY backend/ ./backend/
COPY start-prod.js ./

# Copy compiled frontend from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

EXPOSE 3000

VOLUME ["/app/data"]

CMD ["node", "start-prod.js"]
