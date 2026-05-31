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
app.use(cors())
app.use(express.json())

app.use('/v1/auth', authRouter)
app.use('/v1/users', usersRouter)
app.use('/v1/products', productsRouter)
app.use('/v1/categories', categoriesRouter)
app.use('/v1/stock', stockRouter)
app.use('/v1/sales', salesRouter)
app.use('/v1/customers', customersRouter)
app.use('/v1/customer-payments', customerPaymentsRouter)

app.get('/health', (req, res) => {
  res.json({ success: true, message: 'Drinks POS backend is running' })
})

export default app
