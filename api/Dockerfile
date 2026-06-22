FROM node:20-alpine
RUN apk add --no-cache docker-cli python3 make g++ postgresql16-client
WORKDIR /app
ENV NODE_ENV=production
COPY package.json .
COPY prisma ./prisma
RUN npm install --production
RUN npx prisma generate
COPY src ./src
COPY start.sh .
RUN chmod +x start.sh
EXPOSE 3000
CMD ["./start.sh"]
