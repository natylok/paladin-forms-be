# Use node debian instead of alpine for better compatibility
FROM node:20-slim AS builder

WORKDIR /usr/src/app

# Install necessary dependencies for Prisma
RUN apt-get update && apt-get install -y \
    openssl \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install dependencies
COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

# Generate Prisma client
RUN npx prisma generate

# Copy source code and build
COPY . .
RUN npm run build

# Verify build output
RUN ls -la dist/ && \
    cat dist/main.js || echo "main.js not found"

# Production stage
FROM node:20-slim

WORKDIR /usr/src/app

# Install necessary dependencies for Prisma
RUN apt-get update && apt-get install -y \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy Prisma files and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy built application
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma

# Verify the dist directory contents
RUN ls -la dist/

EXPOSE 3333

CMD ["npm", "run", "start:migrate:prod"] 