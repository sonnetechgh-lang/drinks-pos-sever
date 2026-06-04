import express from 'express'
import * as stockController from '../../controllers/stock.controller.js'
import { auth } from '../../middleware/auth.js'
import { roleGuard } from '../../middleware/roleGuard.js'

const router = express.Router()

router.get('/levels', auth, roleGuard(['ADMIN']), stockController.getStockLevels)
router.patch('/adjust', auth, roleGuard(['ADMIN']), stockController.updateStock)
router.post('/audit', auth, roleGuard(['ADMIN']), stockController.performStockAudit)

export default router
