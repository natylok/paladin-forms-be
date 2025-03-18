FROM node:20-slim

WORKDIR /usr/src/app

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    libc6-compat

# Create cache directory with proper permissions
RUN mkdir -p /tmp/xenova_cache && chmod 777 /tmp/xenova_cache

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "run", "start:prod"] 