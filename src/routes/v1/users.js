import express from 'express'
import { auth } from '../../middleware/auth.js'
import { roleGuard } from '../../middleware/roleGuard.js'
import * as usersController from '../../controllers/users.controller.js'

const router = express.Router()

router.get('/me', auth, (req, res) => {
  res.json({ success: true, data: { user: req.user } })
})

router.patch('/me', auth, usersController.updateMe)

router.get('/', auth, roleGuard(['ADMIN']), usersController.getUsers)
router.post('/', auth, roleGuard(['ADMIN']), usersController.createUser)
router.patch('/:id', auth, roleGuard(['ADMIN']), usersController.updateUser)
router.delete('/:id', auth, roleGuard(['ADMIN']), usersController.removeUser)

router.get('/admin', auth, roleGuard(['ADMIN']), (req, res) => {
  res.json({ success: true, message: 'Welcome to the admin area.' })
})

export default router
