import pool from './src/access-data/config/db';
async function test() {
  const [rows] = await pool.query('SELECT * FROM categorias');
  console.log(rows);
  process.exit();
}
test();
