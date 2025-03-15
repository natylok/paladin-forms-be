# Use node debian instead of alpine for better compatibility
FROM node:18-slim AS builder
WORKDIR /home/natylok/paladin-forms-be

# Copy package files and prisma

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

EXPOSE 3333

CMD ["npm", "run", "start:prod"] 