FROM node:18-slim

WORKDIR /home/natylok/paladin-forms-be/analyzer-feedback
# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

CMD ["npm", "run", "start:prod"] 