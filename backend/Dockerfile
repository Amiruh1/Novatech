# Imagen del backend de NovaTech (para AWS App Runner, ECS o cualquier servicio de contenedores).
# Los secretos NO van en la imagen: se cargan como variables de entorno en el servicio (ver DESPLIEGUE.md).
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
# Logos de los correos y del comprobante PDF
COPY assets ./assets
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
USER node
CMD ["node", "src/server.js"]
