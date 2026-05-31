import { prisma } from '../prisma.js'

export const getPayments = async (req, res) => {
  try {
    const payments = await prisma.customerPayment.findMany({
      orderBy: { createdAt: 'desc' },
    })
    res.json({ success: true, data: payments })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const createCustomerPayment = async (req, res) => {
  const { clientId, customerId, amount, method, momoReference, note, cashierId, createdAt } = req.body
  if (!customerId || !amount || !method || !cashierId) {
    return res.status(400).json({ success: false, message: 'Missing required payment data' })
  }

  try {
    const payment = await prisma.customerPayment.create({
      data: {
        clientId,
        customerId,
        amount: parseFloat(amount),
        method,
        momoReference,
        note,
        cashierId,
        createdAt: createdAt ? new Date(createdAt) : undefined,
      },
    })

    await prisma.customerLedgerEntry.create({
      data: {
        customerId,
        type: 'PAYMENT_CREDIT',
        amount: parseFloat(amount),
        paymentId: payment.id,
        note: note || 'Customer payment',
      },
    })

    res.status(201).json({ success: true, data: payment })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const syncPayments = async (req, res) => {
  const { payments } = req.body
  if (!payments || !Array.isArray(payments)) {
    return res.status(400).json({ success: false, message: 'Invalid payment sync data' })
  }

  try {
    const synced = await prisma.$transaction(async (tx) => {
      const syncedIds = []
      for (const payment of payments) {
        if (!payment.clientId) continue

        const existing = await tx.customerPayment.findUnique({ where: { clientId: payment.clientId } })
        if (existing) {
          syncedIds.push(payment.clientId)
          continue
        }

        const newPayment = await tx.customerPayment.create({
          data: {
            clientId: payment.clientId,
            customerId: payment.customerId,
            amount: parseFloat(payment.amount),
            method: payment.method,
            momoReference: payment.momoReference,
            note: payment.note,
            cashierId: payment.cashierId,
            createdAt: payment.createdAt ? new Date(payment.createdAt) : undefined,
            syncedAt: new Date(),
          },
        })

        await tx.customerLedgerEntry.create({
          data: {
            customerId: payment.customerId,
            type: 'PAYMENT_CREDIT',
            amount: parseFloat(payment.amount),
            paymentId: newPayment.id,
            note: payment.note || 'Customer payment',
          },
        })

        syncedIds.push(payment.clientId)
      }
      return syncedIds
    })

    res.json({ success: true, data: synced })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}
