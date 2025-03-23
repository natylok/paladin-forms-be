# Use Node.js base image
FROM node:20-slim

# Install Python, pip, and venv support
RUN apt-get update && \
    apt-get install -y python3 python3-pip python3-venv && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Create and activate virtual environment
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy Python requirements and install Python dependencies
COPY requirements.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy Python model loader
COPY model_loader.py ./

# Copy package files
COPY package*.json ./

# Create .npmrc file with GitHub authentication
ARG GITHUB_TOKEN
RUN echo "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}" > .npmrc \
    && echo "@natylok:registry=https://npm.pkg.github.com" >> .npmrc

# Install Node.js dependencies
RUN npm install

# Remove .npmrc after install
RUN rm -f .npmrc

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Create models directory with correct permissions
RUN mkdir -p models && chmod 777 models

EXPOSE 3009

CMD ["npm", "run", "start:prod"] 