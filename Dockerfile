FROM node:18-alpine AS builder

WORKDIR /usr/src/app

# Add OpenSSL and other dependencies
RUN apk add --no-cache openssl python3 make g++

# First copy only package files and prisma
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm install

# Generate Prisma Client BEFORE copying the rest of the code
RUN npx prisma generate

# Now copy the rest of the code
COPY . .

# Build the application
RUN npm run build

FROM node:18-alpine

WORKDIR /usr/src/app

# Add OpenSSL for Prisma in production
RUN apk add --no-cache openssl

COPY package*.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma

# Generate Prisma Client again in production environment
RUN npx prisma generate

EXPOSE 3333

CMD ["npm", "run", "start:migrate:prod"] 