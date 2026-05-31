import 'dotenv/config'
import pkg from 'pg'
const { Client } = pkg

const client = new Client({ connectionString: process.env.DATABASE_URL })
try {
  await client.connect()
  const tableRows = await client.query(
    `SELECT n.nspname, c.relname, c.relkind
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
     ORDER BY c.relname`
  )
  console.log('public tables:')
  console.log(tableRows.rows)

  const schemaRows = await client.query(
    `SELECT current_user, session_user, current_schema()`
  )
  console.log('current user/schema:')
  console.log(schemaRows.rows)
} catch (error) {
  console.error(error)
  process.exit(1)
} finally {
  await client.end()
}
