FROM node:20-alpine
RUN apk add --no-cache docker-cli
WORKDIR /app
ENV NODE_ENV=production
COPY package.json .
RUN npm install --production
COPY src ./src
EXPOSE 3000
CMD ["node", "src/index.js"]
