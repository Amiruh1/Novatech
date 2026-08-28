import pool from './src/config/database';
async function test() {
  const [rows] = await pool.query('SELECT * FROM categorias');
  console.log(rows);
  process.exit();
}
test();
