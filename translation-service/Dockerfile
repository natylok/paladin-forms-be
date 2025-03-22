FROM node:20-slim AS builder

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
FROM node:20-slim

WORKDIR /usr/src/app

# Install necessary dependencies
RUN apt-get update && \
    apt-get install -y openssl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm install --production

# Copy built application
COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3009

CMD ["npm", "run", "start:prod"] 