FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm config set registry https://registry.npmjs.org/ && \
    npm config set strict-ssl false && \
    npm install --legacy-peer-deps --no-package-lock --no-audit --loglevel=info

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
