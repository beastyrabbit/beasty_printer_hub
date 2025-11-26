# Build stage - compile frontend
FROM oven/bun:1 AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package.json frontend/bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy frontend source
COPY frontend/ ./

# Build the Vue app
RUN bun run build

# Production stage
FROM oven/bun:1-slim

WORKDIR /app

# Copy backend package files
COPY package.json bun.lock* ./

# Install production dependencies only
RUN bun install --frozen-lockfile --production

# Copy backend source
COPY src/ ./src/
COPY public/ ./public/

# Copy built frontend from builder stage
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create data directory for persistent storage
RUN mkdir -p /app/data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose the port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/status || exit 1

# Start the server
CMD ["bun", "run", "src/server.js"]

