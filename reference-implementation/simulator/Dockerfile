FROM node:20-alpine AS dev
RUN apk add --no-cache curl

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

ENV NODE_ENV=development
EXPOSE 3010
CMD ["npx", "nodemon", "server.js"]

FROM node:20-alpine AS production
RUN apk add --no-cache curl

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3010
CMD ["node", "server.js"]

