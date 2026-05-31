import 'dotenv/config'
import pkg from 'pg'
const { Client } = pkg

const client = new Client({ connectionString: process.env.DATABASE_URL })

try {
  await client.connect()
  const users = await client.query('SELECT count(*)::int AS count FROM "User"')
  const products = await client.query('SELECT count(*)::int AS count FROM "Product"')
  console.log('users', users.rows[0].count)
  console.log('products', products.rows[0].count)
} catch (error) {
  console.error(error)
  process.exit(1)
} finally {
  await client.end()
}
