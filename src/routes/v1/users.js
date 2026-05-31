import express from 'express'
import { auth } from '../../middleware/auth.js'
import { roleGuard } from '../../middleware/roleGuard.js'

const router = express.Router()

router.get('/me', auth, (req, res) => {
  res.json({ success: true, data: { user: req.user } })
})

router.get('/admin', auth, roleGuard(['ADMIN']), (req, res) => {
  res.json({ success: true, message: 'Welcome to the admin area.' })
})

export default router
