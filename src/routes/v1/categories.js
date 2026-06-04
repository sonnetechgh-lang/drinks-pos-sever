import express from 'express'
import { getAllCategories, createCategory } from '../../controllers/products.controller.js'
import { auth } from '../../middleware/auth.js'

const router = express.Router()

router.get('/', auth, getAllCategories)
router.post('/', auth, createCategory)

export default router
