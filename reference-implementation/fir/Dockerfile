FROM node:20-alpine
FROM node:20-alpine AS dev

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

RUN apk add --no-cache curl

ENV NODE_ENV=development
EXPOSE 3006
CMD ["npx", "nodemon", "server.js"]

FROM node:20-alpine AS production

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

RUN apk add --no-cache curl

ENV NODE_ENV=production
EXPOSE 3006
CMD ["node", "server.js"]

