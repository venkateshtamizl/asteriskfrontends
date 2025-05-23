# dev.Dockerfile
FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install

# Bind-mount will provide source code, no need to copy it here

EXPOSE 3000

CMD ["npm", "start"]
