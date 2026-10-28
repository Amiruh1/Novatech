import { createPool } from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const db = createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'novatech_db',
    port: Number(process.env.DB_PORT || 3306),
    ssl: process.env.DB_SSL === 'rds' ? 'Amazon RDS' : undefined,
    connectTimeout: 5000,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

export default db;
