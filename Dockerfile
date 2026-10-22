FROM node:22-alpine
WORKDIR /app
COPY package.json server.mjs ./
COPY public ./public
ENV DATA_DIR=/data PORT=8787
VOLUME /data
EXPOSE 8787
CMD ["node", "--no-warnings", "server.mjs"]
