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
    apt-get install -y openssl python3 make g++ && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm install --production

# Copy Prisma files and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy built application
COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3333

CMD ["npm", "run", "start:migrate:prod"] 