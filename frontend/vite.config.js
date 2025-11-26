import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      usePolling: true, // BẮT BUỘC cho Windows để cập nhật code khi sửa
    },
    host: true, // Mở cửa cho Docker kết nối vào (tương đương 0.0.0.0)
    strictPort: true,
    port: 5173, 
  }
})