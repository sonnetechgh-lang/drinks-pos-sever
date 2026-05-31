import express from 'express'
import * as productsController from '../../controllers/products.controller.js'
import { auth } from '../../middleware/auth.js'
import { roleGuard } from '../../middleware/roleGuard.js'

const router = express.Router()

router.get('/', auth, productsController.getAllProducts)
router.get('/:id', auth, productsController.getProductById)
router.post('/', auth, roleGuard(['ADMIN']), productsController.createProduct)
router.patch('/:id', auth, roleGuard(['ADMIN']), productsController.updateProduct)
router.delete('/:id', auth, roleGuard(['ADMIN']), productsController.deleteProduct)

export default router
