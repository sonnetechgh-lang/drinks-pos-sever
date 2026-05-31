import express from 'express'
import * as salesController from '../../controllers/sales.controller.js'
import { auth } from '../../middleware/auth.js'

const router = express.Router()

router.post('/sync', auth, salesController.syncSales)
router.get('/summary', auth, salesController.getSalesSummary)

export default router
