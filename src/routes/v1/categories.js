import express from 'express'
import { getAllCategories } from '../../controllers/products.controller.js'
import { auth } from '../../middleware/auth.js'

const router = express.Router()

router.get('/', auth, getAllCategories)

export default router
