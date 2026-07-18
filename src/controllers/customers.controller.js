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

    // Balance is now a denormalized field
    const customersWithBalance = customers.map(c => ({
      ...c,
      balance: c.currentBalance // Keep 'balance' key for frontend compatibility
    }))

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
    res.json({ success: true, data: { ...customer, balance: customer.currentBalance } })
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
        return res.status(200).json({ success: true, data: { ...existing, balance: existing.currentBalance } })
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
    res.status(201).json({ success: true, data: { ...customer, balance: customer.currentBalance } })
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
    res.json({ success: true, data: { ...customer, balance: customer.currentBalance } })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const getCustomerLedger = async (req, res) => {
  const { id } = req.params
  try {
    const customer = await prisma.customer.findUnique({ where: { id } })
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' })

    const entries = await prisma.customerLedgerEntry.findMany({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
    })
    const saleIds = entries.map((entry) => entry.saleId).filter(Boolean)
    const paymentIds = entries.map((entry) => entry.paymentId).filter(Boolean)

    const [sales, payments] = await Promise.all([
      saleIds.length > 0
        ? prisma.sale.findMany({
            where: { id: { in: saleIds } },
            include: {
              cashier: { select: { name: true } },
              payments: true,
              items: { include: { product: { select: { name: true } } } },
            },
          })
        : [],
      paymentIds.length > 0
        ? prisma.customerPayment.findMany({
            where: { id: { in: paymentIds } },
          })
        : [],
    ])

    const saleMap = new Map(sales.map((sale) => [sale.id, sale]))
    const paymentMap = new Map(payments.map((payment) => [payment.id, payment]))
    const detailedEntries = entries.map((entry) => ({
      ...entry,
      sale: entry.saleId ? saleMap.get(entry.saleId) || null : null,
      payment: entry.paymentId ? paymentMap.get(entry.paymentId) || null : null,
    }))

    res.json({
      success: true,
      data: {
        customer: { ...customer, balance: customer.currentBalance },
        entries: detailedEntries,
      },
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const getCustomerBalance = async (req, res) => {
  const { id } = req.params
  try {
    const customer = await prisma.customer.findUnique({
      where: { id },
      select: { currentBalance: true }
    })
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' })

    const ledger = await prisma.customerLedgerEntry.findMany({ 
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
      take: 50 // Optimization: only take last 50 for quick view
    })
    
    res.json({ success: true, data: { balance: customer.currentBalance, ledger } })
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
      where: {
        currentBalance: { lt: 0 }
      },
      orderBy: { currentBalance: 'asc' }, // Most negative first
      take: parseInt(limit, 10)
    })

    const formattedDebtors = customers.map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      outstandingBalance: Math.abs(c.currentBalance),
      creditLimit: c.creditLimit
    }))

    res.json({ success: true, data: formattedDebtors })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}
