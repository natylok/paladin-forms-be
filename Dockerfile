FROM node:18-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY . .
RUN npm run prisma:generate
RUN npm run build

FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma

EXPOSE 3333

CMD ["npm", "run", "start:migrate:prod"] 