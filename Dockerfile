# Use node debian instead of alpine for better compatibility
FROM node:20-slim AS builder

WORKDIR /usr/src/app

# Install necessary dependencies for Prisma and build
RUN apt-get update && apt-get install -y \
    openssl \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy configuration files first
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

# Install ALL dependencies (including devDependencies)
RUN npm install

# Copy Prisma files and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source code and other necessary files
COPY . .

# Debug: Show contents before build
RUN echo "=== Contents before build ===" && \
    ls -la && \
    echo "=== Source directory ===" && \
    ls -la src/

# Clean and build
RUN npm run prebuild && \
    npm run build

# Debug: Show build output
RUN echo "=== Build output ===" && \
    ls -la dist/ && \
    echo "=== Main file contents ===" && \
    cat dist/main.js || echo "main.js not found" && \
    echo "=== Directory structure ===" && \
    find . -type f -name "main.js"

# Production stage
FROM node:20-slim

WORKDIR /usr/src/app

# Install only the necessary runtime dependency
RUN apt-get update && apt-get install -y \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Copy ALL files from builder
COPY --from=builder /usr/src/app .

# Install only production dependencies
RUN npm ci --only=production

# Debug: Show production contents
RUN echo "=== Production dist contents ===" && \
    ls -la dist/ && \
    echo "=== Production main.js location ===" && \
    find . -type f -name "main.js" && \
    echo "=== Production main.js contents ===" && \
    cat dist/main.js || echo "main.js not found"

EXPOSE 3333

# Use direct path to ensure we're running the right file
CMD ["node", "dist/main.js"] 