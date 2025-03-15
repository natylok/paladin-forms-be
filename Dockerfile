# Use node debian instead of alpine for better compatibility
FROM node:18-slim AS builder

WORKDIR /usr/src/app

# Install necessary dependencies
RUN apt-get update && \
    apt-get install -y openssl python3 make g++ && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy package files and prisma
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm install

# Generate Prisma Client
RUN npx prisma generate

# Copy the rest of the code
COPY . .

# Build the application
RUN npm run build

# Production image
FROM node:18-slim

WORKDIR /usr/src/app

# Install necessary dependencies for production
RUN apt-get update && \
    apt-get install -y openssl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma

# Generate Prisma Client in production environment
RUN npx prisma generate

EXPOSE 3333

CMD ["npm", "run", "start:migrate:prod"] 