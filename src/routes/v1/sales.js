import express from 'express'
import * as salesController from '../../controllers/sales.controller.js'
import { auth } from '../../middleware/auth.js'
import { roleGuard } from '../../middleware/roleGuard.js'

const router = express.Router()

router.post('/sync', auth, salesController.syncSales)
router.get('/summary', auth, salesController.getSalesSummary)
router.get('/today', auth, salesController.getTodaySales)
router.get('/today/total', auth, salesController.getTodayTotal)
router.get('/best-selling', auth, salesController.getBestSellingProducts)
router.get('/outstanding-credit/total', auth, salesController.getOutstandingCredit)
router.get('/reports', auth, salesController.getSalesReport)
router.delete('/:id', auth, roleGuard(['ADMIN']), salesController.deleteSale)

export default router
