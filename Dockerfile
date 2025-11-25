FROM node:20-alpine

WORKDIR /app

# Copy package manifests first for better layer caching
COPY backend/package*.json ./backend/

# Install dependencies (production)
RUN cd backend && npm install --production

# Copy the rest of the project
COPY . .

WORKDIR /app/backend

ENV NODE_ENV=production

CMD ["node", "server.js"]
