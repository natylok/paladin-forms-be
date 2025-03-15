FROM node:18-slim

WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

EXPOSE 3334

CMD ["npm", "run", "start:prod"] 