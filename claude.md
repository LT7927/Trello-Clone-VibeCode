# Kiến trúc Dự án (Monorepo)
- `/frontend`: Next.js (App Router), React, TypeScript, Tailwind CSS, Zustand, `@dnd-kit/core`, Axios.
- `/backend`: Node.js, Express.js, TypeScript, Sequelize ORM, PostgreSQL.

# Quy trình Vibe Coding
1. LUÔN LUÔN phân tích thiết kế Database (Models), luồng API hoặc cấu trúc UI trước khi sinh code.
2. Cấm sử dụng LocalStorage làm database chính. Mọi thao tác dữ liệu phải đi qua REST API.
3. API Response luôn tuân theo chuẩn: `{ success: boolean, data: any, message: string }`.
4. Code Frontend cần bắt lỗi API chặt chẽ và sử dụng Optimistic UI qua Zustand để tăng trải nghiệm kéo thả.