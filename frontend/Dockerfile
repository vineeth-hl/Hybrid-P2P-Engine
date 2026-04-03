# -----------------------------------
# STAGE 1: Vite React Build Context
# -----------------------------------
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# -----------------------------------
# STAGE 2: Nginx Production Context
# -----------------------------------
FROM nginx:alpine

# Purge default static site
RUN rm -rf /usr/share/nginx/html/*

# Pull compiled Vite bundle from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Layer in custom Nginx routing configurations
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Execute strict non-root architectural security policies required for K8s compliance
RUN chown -R nginx:nginx /usr/share/nginx/html \
    && chown -R nginx:nginx /var/cache/nginx \
    && chown -R nginx:nginx /var/log/nginx \
    && chown -R nginx:nginx /etc/nginx/conf.d \
    && touch /var/run/nginx.pid \
    && chown -R nginx:nginx /var/run/nginx.pid \
    && mkdir -p /var/cache/nginx/client_temp \
    && chown -R nginx:nginx /var/cache/nginx/client_temp

USER nginx

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
