import { prisma } from '../prisma.js'

const createPaymentLedgerEntries = async (tx, { customerId, amount, paymentId, note }) => {
  const customer = await tx.customer.findUnique({
    where: { id: customerId },
    select: { currentBalance: true }
  })

  if (!customer) {
    throw new Error('Customer not found')
  }

  const balance = Number(customer.currentBalance || 0)
  const debtAmount = Math.max(0, -balance)
  const creditAmount = Math.min(amount, debtAmount)
  const depositAmount = amount - creditAmount

  if (creditAmount > 0) {
    await tx.customerLedgerEntry.create({
      data: {
        customerId,
        type: 'PAYMENT_CREDIT',
        amount: creditAmount,
        paymentId,
        note: note || 'Customer payment',
      },
    })
  }

  if (depositAmount > 0) {
    await tx.customerLedgerEntry.create({
      data: {
        customerId,
        type: 'PAYMENT_DEPOSIT',
        amount: depositAmount,
        paymentId,
        note: note || 'Customer advance deposit',
      },
    })
  }
}

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
    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.customerPayment.create({
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

      await createPaymentLedgerEntries(tx, {
        customerId,
        amount: parseFloat(amount),
        paymentId: payment.id,
        note,
      })

      await tx.customer.update({
        where: { id: customerId },
        data: { currentBalance: { increment: parseFloat(amount) } }
      })

      return payment
    })

    res.status(201).json({ success: true, data: result })
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

        const amount = parseFloat(payment.amount)
        const newPayment = await tx.customerPayment.create({
          data: {
            clientId: payment.clientId,
            customerId: payment.customerId,
            amount,
            method: payment.method,
            momoReference: payment.momoReference,
            note: payment.note,
            cashierId: payment.cashierId,
            createdAt: payment.createdAt ? new Date(payment.createdAt) : undefined,
            syncedAt: new Date(),
          },
        })

        await createPaymentLedgerEntries(tx, {
          customerId: payment.customerId,
          amount,
          paymentId: newPayment.id,
          note: payment.note,
        })

        await tx.customer.update({
          where: { id: payment.customerId },
          data: { currentBalance: { increment: amount } }
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
