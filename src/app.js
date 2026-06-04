import express from 'express'
import cors from 'cors'
import authRouter from './routes/v1/auth.js'
import usersRouter from './routes/v1/users.js'
import productsRouter from './routes/v1/products.js'
import categoriesRouter from './routes/v1/categories.js'
import stockRouter from './routes/v1/stock.js'
import salesRouter from './routes/v1/sales.js'
import customersRouter from './routes/v1/customers.js'
import customerPaymentsRouter from './routes/v1/customerPayments.js'

const app = express()

const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://drinks-pos-client.vercel.app',
]

const configuredOrigins = [
  process.env.CORS_ORIGIN,
  process.env.FRONTEND_URL,
].filter(Boolean).join(',')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const allowedOrigins = Array.from(new Set([...defaultOrigins, ...configuredOrigins]))

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
      return
    }

    callback(new Error('Not allowed by CORS'))
  },
  credentials: true,
}))
app.use(express.json())

app.use('/v1/auth', authRouter)
app.use('/v1/users', usersRouter)
app.use('/v1/products', productsRouter)
app.use('/v1/categories', categoriesRouter)
app.use('/v1/stock', stockRouter)
app.use('/v1/sales', salesRouter)
app.use('/v1/customers', customersRouter)
app.use('/v1/customer-payments', customerPaymentsRouter)

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Drinks POS backend is running',
    documentation: 'Use /health or /v1/* endpoints for API access'
  })
})

app.get('/health', (req, res) => {
  res.json({ success: true, message: 'Drinks POS backend is running' })
})

export default app
