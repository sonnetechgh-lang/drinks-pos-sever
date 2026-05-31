import dotenv from 'dotenv'
dotenv.config()
import app from './app.js'

const port = process.env.PORT || 4000

if (!process.env.JWT_SECRET) {
  console.warn('Warning: JWT_SECRET is not set. Authentication will fail until it is configured.')
}

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`)
})
