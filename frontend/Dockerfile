# --- STAGE 1: Build React ---
FROM node:20-alpine as build
WORKDIR /app
COPY package.json ./
# Cài đặt thư viện
RUN npm install
# Copy code và Build ra file tĩnh
COPY . .
RUN npm run build

# --- STAGE 2: Chạy Nginx ---
FROM nginx:alpine
# Copy file build từ Stage 1 sang folder của Nginx
COPY --from=build /app/dist /usr/share/nginx/html
# Copy file cấu hình Nginx mình vừa tạo
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]