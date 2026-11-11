import { sequelize } from './models';
import { app } from './app';

const PORT = Number(process.env.PORT ?? 5000);
const isProduction = process.env.NODE_ENV === 'production';

async function bootstrap(): Promise<void> {
  try {
    await sequelize.authenticate();
    console.log('✅ Kết nối PostgreSQL thành công');

    // Chỉ dùng sync({ alter }) ở môi trường dev. Production sẽ chuyển sang migrations.
    if (!isProduction) {
      await sequelize.sync({ alter: true });
      console.log('✅ Đã đồng bộ schema (sync alter)');
    }

    app.listen(PORT, () => {
      console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Không thể khởi động server:', error);
    process.exit(1);
  }
}

void bootstrap();
