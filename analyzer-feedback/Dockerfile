FROM node:18-slim AS builder

WORKDIR /usr/src/app

# Install necessary dependencies
RUN apt-get update && \
    apt-get install -y openssl python3 make g++ && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production image
FROM node:18-slim

WORKDIR /usr/src/app

# Install necessary dependencies
RUN apt-get update && \
    apt-get install -y openssl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm install --production

# Copy built application and dependencies
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma || true

EXPOSE 3334

CMD ["npm", "run", "start:prod"] 