import { Router } from 'express'
import * as customersController from '../../controllers/customers.controller.js'
import { auth } from '../../middleware/auth.js'
import { roleGuard } from '../../middleware/roleGuard.js'

const router = Router()

router.get('/', auth, customersController.getCustomers)
router.get('/:id', auth, customersController.getCustomerById)
router.post('/', auth, customersController.createCustomer)
router.patch('/:id', auth, roleGuard(['ADMIN']), customersController.updateCustomer)
router.get('/:id/ledger', auth, customersController.getCustomerLedger)
router.get('/:id/balance', auth, customersController.getCustomerBalance)
router.post('/sync', auth, customersController.syncCustomers)

export default router
