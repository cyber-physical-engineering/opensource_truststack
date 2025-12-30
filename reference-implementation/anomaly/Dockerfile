FROM node:20-alpine
FROM node:20-alpine AS dev
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY server.js ./
EXPOSE 3011
CMD ["npx", "nodemon", "server.js"]

FROM node:20-alpine AS production
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY server.js ./
EXPOSE 3011
CMD ["node", "server.js"]

