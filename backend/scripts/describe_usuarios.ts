import db from '../src/access-data/config/db';

async function describe() {
    try {
        const [rows] = await db.query('DESCRIBE usuarios;');
        console.log(rows);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
describe();
