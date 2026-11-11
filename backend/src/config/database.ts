import dotenv from 'dotenv';
import { Sequelize } from 'sequelize';

dotenv.config({ quiet: true });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Thiếu biến môi trường bắt buộc: ${name} (xem .env.example)`);
  }
  return value;
}

export const sequelize = new Sequelize(
  requireEnv('DB_NAME'),
  requireEnv('DB_USER'),
  process.env.DB_PASSWORD ?? '',
  {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    dialect: 'postgres',
    logging: process.env.DB_LOGGING === 'true' ? console.log : false,
    define: {
      // camelCase trong code <-> snake_case trong DB (boardId -> board_id)
      underscored: true,
      timestamps: true,
    },
    pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
  },
);
