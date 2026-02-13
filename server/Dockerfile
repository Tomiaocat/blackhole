FROM node:20-alpine

WORKDIR /app

COPY server/package*.json ./
COPY shared ./shared
COPY client ./client
COPY server/config ./config

RUN npm ci --only=production

COPY server/ ./

EXPOSE 3000

CMD ["node", "index.js"]
