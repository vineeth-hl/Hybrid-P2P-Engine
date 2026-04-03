FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install standard production dependencies
RUN npm install --omit=dev

# Copy Node.js WebRTC service logic
COPY . .

# Switch to the inherent 'node' non-root user included in the official alpine bundle
RUN chown -R node:node /app
USER node

EXPOSE 3001

# Boot Matchmaker script
CMD ["node", "index.js"]
