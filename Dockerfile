# Works on Fly.io, Railway, Google Cloud Run, a VPS — anything that runs containers.
FROM node:20-alpine
WORKDIR /app
COPY index.html package.json ./
COPY css ./css
COPY js ./js
COPY assets ./assets
COPY server ./server
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
EXPOSE 8080
RUN mkdir -p /data && chown node:node /data
USER node
CMD ["node", "server/index.mjs"]
