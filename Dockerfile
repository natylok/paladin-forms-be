# Use locally tagged node image
FROM local/node:20-slim AS builder

WORKDIR /usr/src/app

# Install necessary dependencies for Prisma and build
RUN apt-get update && apt-get install -y \
    openssl \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy only package files first to leverage Docker cache
COPY package*.json ./
COPY yarn.lock ./

# Install ALL dependencies (including devDependencies)
# Use cache mount to speed up installations
RUN --mount=type=cache,target=/usr/src/app/.npm \
    npm set cache /usr/src/app/.npm && \
    npm install

# Copy configuration files
COPY tsconfig*.json ./
COPY nest-cli.json ./

# Copy Prisma files and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source code and other necessary files
COPY . .

# Clean and build
RUN npm run prebuild && \
    npm run build

# Debug: Show build output
RUN echo "=== Build output ===" && \
    ls -la dist/ && \
    echo "=== Directory structure ===" && \
    find . -type f -name "main.js"

# Production stage
FROM local/node:20-slim

WORKDIR /usr/src/app

# Install only the necessary runtime dependency
RUN apt-get update && apt-get install -y \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Copy only package files first to leverage Docker cache
COPY package*.json ./
COPY yarn.lock ./

# Install only production dependencies with cache
RUN --mount=type=cache,target=/usr/src/app/.npm \
    npm set cache /usr/src/app/.npm && \
    npm ci --only=production

# Copy configuration files
COPY tsconfig*.json ./
COPY nest-cli.json ./

# Copy Prisma files and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy built application from builder
COPY --from=builder /usr/src/app/dist ./dist

# Debug: Show production contents
RUN echo "=== Production dist contents ===" && \
    ls -la dist/ && \
    echo "=== Production main.js location ===" && \
    find . -type f -name "main.js"

EXPOSE 3333

# Use direct path to ensure we're running the right file
CMD ["node", "dist/main.js"] 