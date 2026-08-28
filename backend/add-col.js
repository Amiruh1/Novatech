const db = require('./src/config/db').default;
async function test() {
  await db.query("UPDATE categorias SET imagen = 'https://images.unsplash.com/photo-1531297172814-af26767dd395?q=80&w=400&auto=format&fit=crop' WHERE nombre = 'Computo'");
  await db.query("UPDATE categorias SET imagen = 'https://images.unsplash.com/photo-1527814050087-379381547996?q=80&w=400&auto=format&fit=crop' WHERE nombre = 'Perifericos'");
  await db.query("UPDATE categorias SET imagen = 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?q=80&w=400&auto=format&fit=crop' WHERE nombre = 'Pantallas'");
  await db.query("UPDATE categorias SET imagen = 'https://images.unsplash.com/photo-1531492746076-161ca9bcad58?q=80&w=400&auto=format&fit=crop' WHERE nombre = 'Almacenamiento'");
  
  const [rows] = await db.query('SELECT * FROM categorias');
  console.log(rows);
  process.exit();
}
test();
