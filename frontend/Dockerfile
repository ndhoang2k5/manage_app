# frontend/Dockerfile
# Sử dụng Node image nhẹ
FROM node:20-alpine

WORKDIR /app

# Copy file package để cài thư viện trước (tận dụng cache)
COPY package.json  ./
RUN npm install

# Copy toàn bộ code vào
COPY . .

# Mở port 5173 (Port mặc định của Vite)
EXPOSE 5173

# Chạy server development
CMD ["npm", "run", "dev", "--", "--host"]