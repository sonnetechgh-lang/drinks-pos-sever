import 'dotenv/config'
import pkg from 'pg'
const { Client } = pkg

const client = new Client({ connectionString: process.env.DATABASE_URL })

try {
  await client.connect()
  console.log('Connected successfully')

  const tables = await client.query("SELECT n.nspname AS schema_name, c.relname AS table_name, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r','v','m','f','p') ORDER BY n.nspname, c.relname")
  console.log('Tables:')
  console.table(tables.rows)

  const publicTables = await client.query("SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name")
  console.log('Public information_schema tables:')
  console.table(publicTables.rows)

  const schemaInfo = await client.query("SELECT nspname, nspowner, nspacl FROM pg_namespace WHERE nspname = 'public'")
  console.log('Public schema permissions:')
  console.table(schemaInfo.rows)

  const currentUser = await client.query('SELECT current_user, session_user, current_schema()')
  console.log('Current user/session/schema:')
  console.table(currentUser.rows)
} catch (error) {
  console.error('Error during metadata check:')
  console.error(error)
  process.exit(1)
} finally {
  await client.end()
}
