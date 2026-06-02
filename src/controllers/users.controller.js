import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../prisma.js'

const selectUser = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
}

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())

const sanitizeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  active: user.active,
})

const signUserToken = (user) => jwt.sign(
  {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    active: user.active,
  },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
)

export const getUsers = async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: selectUser,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    })

    res.json({ success: true, data: users })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const createUser = async (req, res) => {
  const name = String(req.body.name || '').trim()
  const email = String(req.body.email || '').trim().toLowerCase()
  const password = String(req.body.password || '')

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Name, email, and password are required' })
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, message: 'Enter a valid email address' })
  }

  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' })
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } })
    const hashedPassword = await bcrypt.hash(password, 10)

    if (existing?.active) {
      return res.status(409).json({ success: false, message: 'A user with this email already exists' })
    }

    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: { name, password: hashedPassword, role: 'CASHIER', active: true },
          select: selectUser,
        })
      : await prisma.user.create({
          data: { name, email, password: hashedPassword, role: 'CASHIER' },
          select: selectUser,
        })

    res.status(201).json({ success: true, data: user })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const updateUser = async (req, res) => {
  const { id } = req.params
  const name = req.body.name !== undefined ? String(req.body.name).trim() : undefined
  const email = req.body.email !== undefined ? String(req.body.email).trim().toLowerCase() : undefined
  const active = req.body.active !== undefined ? Boolean(req.body.active) : undefined
  const password = req.body.password !== undefined ? String(req.body.password) : undefined

  if (email !== undefined && !isValidEmail(email)) {
    return res.status(400).json({ success: false, message: 'Enter a valid email address' })
  }

  if (password !== undefined && password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' })
  }

  try {
    const target = await prisma.user.findUnique({ where: { id } })
    if (!target) return res.status(404).json({ success: false, message: 'User not found' })
    if (target.role === 'ADMIN') {
      return res.status(400).json({ success: false, message: 'Use the admin account form to update admin details' })
    }

    const data = {
      name: name || undefined,
      email,
      active,
    }

    if (password) data.password = await bcrypt.hash(password, 10)

    const user = await prisma.user.update({
      where: { id },
      data,
      select: selectUser,
    })

    res.json({ success: true, data: user })
  } catch (error) {
    const message = error.code === 'P2002' ? 'A user with this email already exists' : error.message
    res.status(error.code === 'P2002' ? 409 : 500).json({ success: false, message })
  }
}

export const removeUser = async (req, res) => {
  const { id } = req.params

  if (id === req.user.id) {
    return res.status(400).json({ success: false, message: 'You cannot remove your own account' })
  }

  try {
    const target = await prisma.user.findUnique({ where: { id } })
    if (!target) return res.status(404).json({ success: false, message: 'User not found' })
    if (target.role === 'ADMIN') return res.status(400).json({ success: false, message: 'Admin accounts cannot be removed here' })

    const user = await prisma.user.update({
      where: { id },
      data: { active: false },
      select: selectUser,
    })

    res.json({ success: true, data: user })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const updateMe = async (req, res) => {
  const { id } = req.user
  const name = String(req.body.name || '').trim()
  const email = String(req.body.email || '').trim().toLowerCase()
  const currentPassword = String(req.body.currentPassword || '')
  const newPassword = String(req.body.newPassword || '')

  if (!name || !email) {
    return res.status(400).json({ success: false, message: 'Name and email are required' })
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, message: 'Enter a valid email address' })
  }

  try {
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return res.status(404).json({ success: false, message: 'User not found' })

    const sensitiveChange = email !== user.email || Boolean(newPassword)
    if (sensitiveChange) {
      const passwordMatches = await bcrypt.compare(currentPassword, user.password)
      if (!passwordMatches) {
        return res.status(401).json({ success: false, message: 'Current password is incorrect' })
      }
    }

    if (newPassword && newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' })
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        name,
        email,
        password: newPassword ? await bcrypt.hash(newPassword, 10) : undefined,
      },
      select: selectUser,
    })

    res.json({
      success: true,
      data: {
        user: sanitizeUser(updatedUser),
        token: signUserToken(updatedUser),
      },
    })
  } catch (error) {
    const message = error.code === 'P2002' ? 'A user with this email already exists' : error.message
    res.status(error.code === 'P2002' ? 409 : 500).json({ success: false, message })
  }
}
