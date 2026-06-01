import { prisma } from '../prisma.js'

export const getCustomers = async (req, res) => {
  const { search } = req.query
  try {
    const customers = await prisma.customer.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
    })

    const customersWithBalance = await Promise.all(
      customers.map(async (customer) => {
        const ledger = await prisma.customerLedgerEntry.findMany({ where: { customerId: customer.id } })
        const balance = ledger.reduce((sum, entry) => {
          if (entry.type === 'PAYMENT_CREDIT' || entry.type === 'CREDIT_REVERSAL' || entry.type === 'ADJUSTMENT') {
            return sum + entry.amount
          }
          return sum - entry.amount
        }, 0)
        return { ...customer, balance }
      })
    )

    res.json({ success: true, data: customersWithBalance })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const getCustomerById = async (req, res) => {
  const { id } = req.params
  try {
    const customer = await prisma.customer.findUnique({ where: { id } })
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' })
    res.json({ success: true, data: customer })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const createCustomer = async (req, res) => {
  const { clientId, name, phone, notes, creditLimit, active } = req.body
  if (!name?.trim()) {
    return res.status(400).json({ success: false, message: 'Customer name is required' })
  }

  try {
    if (clientId) {
      const existing = await prisma.customer.findUnique({ where: { clientId } })
      if (existing) {
        return res.status(200).json({ success: true, data: existing })
      }
    }

    const customer = await prisma.customer.create({
      data: {
        clientId,
        name: name.trim(),
        phone,
        notes,
        creditLimit: creditLimit != null ? Number(creditLimit) : 0,
        active: active !== undefined ? active : true,
      },
    })
    res.status(201).json({ success: true, data: customer })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const updateCustomer = async (req, res) => {
  const { id } = req.params
  const { name, phone, notes, creditLimit, active } = req.body
  try {
    const customer = await prisma.customer.update({
      where: { id },
      data: {
        name,
        phone,
        notes,
        creditLimit: creditLimit != null ? Number(creditLimit) : undefined,
        active,
      },
    })
    res.json({ success: true, data: customer })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const getCustomerLedger = async (req, res) => {
  const { id } = req.params
  try {
    const entries = await prisma.customerLedgerEntry.findMany({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ success: true, data: entries })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const getCustomerBalance = async (req, res) => {
  const { id } = req.params
  try {
    const ledger = await prisma.customerLedgerEntry.findMany({ where: { customerId: id } })
    const balance = ledger.reduce((sum, entry) => {
      if (entry.type === 'PAYMENT_CREDIT' || entry.type === 'CREDIT_REVERSAL' || entry.type === 'ADJUSTMENT') {
        return sum + entry.amount
      }
      return sum - entry.amount
    }, 0)
    res.json({ success: true, data: { balance, ledger } })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const syncCustomers = async (req, res) => {
  const { customers } = req.body
  if (!customers || !Array.isArray(customers)) {
    return res.status(400).json({ success: false, message: 'Invalid customer sync data' })
  }

  try {
    const synced = await prisma.$transaction(async (tx) => {
      const syncedCustomers = []
      for (const customer of customers) {
        if (!customer.clientId) continue

        const existing = await tx.customer.findUnique({ where: { clientId: customer.clientId } })
        const customerData = {
          clientId: customer.clientId,
          name: customer.name,
          phone: customer.phone,
          notes: customer.notes,
          creditLimit: customer.creditLimit != null ? Number(customer.creditLimit) : 0,
          active: customer.active !== undefined ? customer.active : true,
        }

        const savedCustomer = existing
          ? await tx.customer.update({ where: { id: existing.id }, data: customerData })
          : await tx.customer.create({ data: customerData })

        syncedCustomers.push({ clientId: customer.clientId, id: savedCustomer.id })
      }
      return syncedCustomers
    })

    res.json({ success: true, data: synced })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Dashboard: Top debtors (customers with highest outstanding credit)
export const getTopDebtors = async (req, res) => {
  const { limit = 5 } = req.query
  try {
    const customers = await prisma.customer.findMany({
      include: {
        ledger: true
      },
      orderBy: { createdAt: 'desc' },
      take: 100 // Get all, we'll calculate balance for each
    })

    // Calculate balance for each customer and filter those with outstanding credit
    const customersWithBalance = customers
      .map((customer) => {
        const balance = customer.ledger.reduce((sum, entry) => {
          if (entry.type === 'PAYMENT_CREDIT' || entry.type === 'CREDIT_REVERSAL' || entry.type === 'ADJUSTMENT') {
            return sum + entry.amount
          }
          return sum - entry.amount
        }, 0)
        return {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          outstandingBalance: Math.max(0, -balance), // Negative balance means credit
          creditLimit: customer.creditLimit
        }
      })
      .filter((c) => c.outstandingBalance > 0)
      .sort((a, b) => b.outstandingBalance - a.outstandingBalance)
      .slice(0, parseInt(limit, 10))

    res.json({ success: true, data: customersWithBalance })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}
