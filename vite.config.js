import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // 로컬 개발 시 `vercel dev` 실행 권장
  // vercel dev는 프론트엔드 + /api 함수를 함께 실행합니다
});
