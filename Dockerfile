# Use locally tagged node image
FROM node:20-slim AS builder

WORKDIR /usr/src/app

# Install necessary dependencies for Prisma, build, and Python
RUN apt-get update && apt-get install -y \
    openssl \
    make \
    g++ \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"


# Create models directory with correct permissions
RUN mkdir -p models && chmod 777 models

# Copy only package files first to leverage Docker cache
COPY package*.json ./

# Create .npmrc file with GitHub authentication
ARG GITHUB_TOKEN
RUN echo "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}" > .npmrc \
    && echo "@natylok:registry=https://npm.pkg.github.com" >> .npmrc

# Install ALL dependencies (including devDependencies)
# Use cache mount to speed up installations
RUN --mount=type=cache,target=/usr/src/app/.npm \
    npm set cache /usr/src/app/.npm && \
    npm install

# Remove .npmrc after install
RUN rm -f .npmrc

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

# Install necessary runtime dependencies including Python
RUN apt-get update && apt-get install -y \
    openssl \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="/opt/venv/bin:$PATH"
# Set environment variables for Python
ENV TRANSFORMERS_CACHE=/usr/src/app/models
ENV PYTHONUNBUFFERED=1

# Copy package files
COPY package*.json ./

# Create .npmrc file with GitHub authentication for production install
ARG GITHUB_TOKEN
RUN echo "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}" > .npmrc \
    && echo "@natylok:registry=https://npm.pkg.github.com" >> .npmrc

# Install production dependencies
RUN --mount=type=cache,target=/usr/src/app/.npm \
    npm set cache /usr/src/app/.npm && \
    npm ci --only=production

# Remove .npmrc after install
RUN rm -f .npmrc

# Copy configuration files
COPY tsconfig*.json ./
COPY nest-cli.json ./

# Copy Prisma files and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy built application and necessary files
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules/.prisma/client ./node_modules/.prisma/client

EXPOSE 3333

# Start both the Node.js application and the Python model loader
CMD ["node dist/main"] 