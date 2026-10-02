FROM node:20-alpine AS dev
RUN apk add --no-cache curl
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY server.js ./
EXPOSE 3011
CMD ["npx", "nodemon", "server.js"]

FROM node:20-alpine AS production
RUN apk add --no-cache curl
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY server.js ./
EXPOSE 3011
CMD ["node", "server.js"]

