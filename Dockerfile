# Use locally tagged node image
FROM node:20-slim AS builder

WORKDIR /usr/src/app

# Install necessary dependencies for Prisma and build
RUN apt-get update && apt-get install -y \
    openssl \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy only package files first to leverage Docker cache
COPY package*.json ./

# Install ALL dependencies (including devDependencies)
# Use cache mount to speed up installations
RUN --mount=type=cache,target=/usr/src/app/.npm \
    npm set cache /usr/src/app/.npm && \
    npm install

# Download the model during build
RUN mkdir -p /usr/src/app/models && \
    git clone https://huggingface.co/siebert/sentiment-roberta-large-english /usr/src/app/models/sentiment-roberta-large-english

# Copy configuration files
COPY tsconfig*.json ./
COPY nest-cli.json ./

# Copy Prisma files and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source code
COPY src ./src/

# Clean and build
RUN npm run prebuild && \
    npm run build && \
    ls -la dist/ && \
    echo "=== Contents of dist directory ===" && \
    find dist/ -type f

# Production stage
FROM node:20-slim

WORKDIR /usr/src/app

# Install only the necessary runtime dependency
RUN apt-get update && apt-get install -y \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install production dependencies
COPY package*.json ./
RUN --mount=type=cache,target=/usr/src/app/.npm \
    npm set cache /usr/src/app/.npm && \
    npm ci --only=production

# Copy configuration files
COPY tsconfig*.json ./
COPY nest-cli.json ./

# Copy Prisma files and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy built application and necessary files
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules/.prisma/client ./node_modules/.prisma/client
# Copy the downloaded model
COPY --from=builder /usr/src/app/models ./models

# Verify the dist directory contents
RUN ls -la dist/ && \
    echo "=== Contents of dist directory ===" && \
    find dist/ -type f

EXPOSE 3333

# Start the application with the correct path
CMD ["node", "dist/main"] 