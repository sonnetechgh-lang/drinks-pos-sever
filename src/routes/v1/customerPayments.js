import { Router } from 'express'
import * as customerPaymentsController from '../../controllers/customerPayments.controller.js'
import { auth } from '../../middleware/auth.js'

const router = Router()

router.get('/', auth, customerPaymentsController.getPayments)
router.post('/', auth, customerPaymentsController.createCustomerPayment)
router.post('/sync', auth, customerPaymentsController.syncPayments)

export default router
