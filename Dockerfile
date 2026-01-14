FROM node:18-alpine

# Create app directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --production

# Copy source code
COPY . .

# App runs on this port
EXPOSE 4000

# Start the service
CMD ["node", "index.js"]
