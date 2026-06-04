import { prisma } from '../prisma.js'

const parseNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const syncSales = async (req, res) => {
  const { sales } = req.body

  if (!sales || !Array.isArray(sales)) {
    return res.status(400).json({ success: false, message: 'Invalid sales data' })
  }

  try {
    const results = await prisma.$transaction(async (tx) => {
      const syncedIds = []

      for (const sale of sales) {
        if (!sale.clientId) {
          throw new Error('Sale clientId is required for deduplication')
        }

        const existing = await tx.sale.findUnique({
          where: { clientId: sale.clientId }
        })

        if (existing) {
          syncedIds.push(sale.clientId)
          continue
        }

        const total = parseNumber(sale.total)
        const discount = parseNumber(sale.discount)
        const paymentLines = Array.isArray(sale.paymentLines) ? sale.paymentLines : []
        const paidAmount = paymentLines.reduce((sum, line) => {
          if (line.method === 'CREDIT') return sum
          return sum + parseNumber(line.amount)
        }, 0)
        const creditAmount = total - paidAmount
        const paymentStatus = sale.paymentStatus || (creditAmount <= 0 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'CREDIT')

        if ((paymentStatus === 'CREDIT' || paymentStatus === 'PARTIAL' || paymentLines.some((line) => line.method === 'ADVANCE_BALANCE')) && !sale.customerId) {
          throw new Error('Customer is required for credit, partial, or advance balance sales')
        }

        const newSale = await tx.sale.create({
          data: {
            clientId: sale.clientId,
            total,
            discount,
            amountPaid: paidAmount,
            creditAmount: creditAmount > 0 ? creditAmount : 0,
            customerId: sale.customerId || undefined,
            customerName: sale.customerName || undefined,
            paymentStatus,
            cashierId: sale.cashierId,
            createdAt: sale.createdAt ? new Date(sale.createdAt) : undefined,
            syncedAt: new Date(),
            items: {
              create: sale.items.map((item) => {
                const unitPrice = parseNumber(item.unitPrice)
                const quantity = item.quantity
                return {
                  productId: item.productId,
                  packageOptionId: item.packageOptionId || undefined,
                  packageName: item.packageName || 'Unit',
                  unitsPerBase: item.unitsPerBase || 1,
                  quantity: quantity,
                  baseQuantity: item.baseQuantity || item.quantity,
                  unitPrice: unitPrice,
                  subtotal: unitPrice * quantity,
                }
              })
            },
            payments: {
              create: paymentLines.map((line) => ({
                method: line.method,
                amount: parseNumber(line.amount),
                momoReference: line.momoReference || line.reference || undefined,
              }))
            }
          }
        })

        for (const item of sale.items) {
          const baseQuantity = item.baseQuantity || item.quantity
          if (baseQuantity > 0) {
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { decrement: baseQuantity } }
            })

            await tx.stockMovement.create({
              data: {
                productId: item.productId,
                quantity: baseQuantity,
                type: 'SALE',
                note: `Sale ${newSale.id} (Client: ${sale.clientId})`
              }
            })
          }
        }

        if (sale.customerId && creditAmount > 0) {
          await tx.customerLedgerEntry.create({
            data: {
              customerId: sale.customerId,
              type: 'SALE_DEBIT',
              amount: creditAmount,
              saleId: newSale.id,
              note: sale.customerName ? `Sale for ${sale.customerName}` : `Sale ${newSale.id}`,
            }
          })
          
          await tx.customer.update({
            where: { id: sale.customerId },
            data: { currentBalance: { decrement: creditAmount } }
          })
        }

        for (const line of paymentLines) {
          if (line.method === 'ADVANCE_BALANCE' && sale.customerId) {
            const amount = parseNumber(line.amount)
            const customer = await tx.customer.findUnique({
              where: { id: sale.customerId },
              select: { currentBalance: true }
            })

            if (!customer || Number(customer.currentBalance || 0) < amount) {
              throw new Error('Insufficient advance balance')
            }

            await tx.customerLedgerEntry.create({
              data: {
                customerId: sale.customerId,
                type: 'ADVANCE_APPLIED',
                amount,
                saleId: newSale.id,
                note: 'Advance balance applied',
              }
            })

            await tx.customer.update({
              where: { id: sale.customerId },
              data: { currentBalance: { decrement: amount } }
            })
          }
        }

        syncedIds.push(sale.clientId)
      }

      return syncedIds
    })

    res.json({ success: true, data: results })
  } catch (error) {
    console.error('Sync Error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

export const getSalesSummary = async (req, res) => {
  try {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay())
    startOfWeek.setHours(0, 0, 0, 0)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [todaySales, weekSales, monthSales, topProducts, allSales, customerCount] = await Promise.all([
      prisma.sale.aggregate({
        _sum: { total: true },
        where: { createdAt: { gte: startOfToday } }
      }),
      prisma.sale.aggregate({
        _sum: { total: true },
        where: { createdAt: { gte: startOfWeek } }
      }),
      prisma.sale.aggregate({
        _sum: { total: true },
        where: { createdAt: { gte: startOfMonth } }
      }),
      prisma.saleItem.groupBy({
        by: ['productId'],
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5
      }),
      prisma.sale.findMany({
        include: {
          items: { include: { product: { select: { name: true } } } },
          cashier: { select: { name: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 50
      }),
      prisma.customer.count(),
    ])

    const topProductsWithNames = await Promise.all(
      topProducts.map(async (item) => {
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
          select: { name: true }
        })
        return {
          name: product?.name || 'Unknown',
          quantity: item._sum.quantity
        }
      })
    )

    res.json({
      success: true,
      data: {
        revenue: {
          today: todaySales._sum.total || 0,
          week: weekSales._sum.total || 0,
          month: monthSales._sum.total || 0
        },
        topProducts: topProductsWithNames,
        recentSales: allSales,
        totalCustomers: customerCount,
      }
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Dashboard: Today's sales (limited list)
export const getTodaySales = async (req, res) => {
  const { limit = 5 } = req.query
  try {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const sales = await prisma.sale.findMany({
      where: { createdAt: { gte: startOfToday } },
      include: {
        customer: { select: { name: true } },
        cashier: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit, 10)
    })

    res.json({ success: true, data: sales })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Dashboard: Today's sales total
export const getTodayTotal = async (req, res) => {
  try {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const result = await prisma.sale.aggregate({
      _sum: { total: true },
      _count: true,
      where: { createdAt: { gte: startOfToday } }
    })

    res.json({
      success: true,
      data: {
        total: result._sum.total || 0,
        count: result._count || 0
      }
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Dashboard: Best selling products
export const getBestSellingProducts = async (req, res) => {
  const { limit = 5 } = req.query
  try {
    const topProducts = await prisma.saleItem.groupBy({
      by: ['productId'],
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: parseInt(limit, 10)
    })

    const productsWithDetails = await Promise.all(
      topProducts.map(async (item) => {
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
          select: { name: true, id: true }
        })
        return {
          productId: item.productId,
          name: product?.name || 'Unknown',
          quantity: item._sum.quantity || 0,
          revenue: item._sum.subtotal || 0
        }
      })
    )

    res.json({ success: true, data: productsWithDetails })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Dashboard: Total outstanding credit
export const getOutstandingCredit = async (req, res) => {
  try {
    const result = await prisma.customer.aggregate({
      _sum: { currentBalance: true },
      where: {
        currentBalance: { lt: 0 }
      }
    })

    const outstanding = Math.abs(result._sum.currentBalance || 0)

    res.json({
      success: true,
      data: {
        outstanding
      }
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Reports: Sales by date range with filters
export const getSalesReport = async (req, res) => {
  const { startDate, endDate, paymentStatus, limit = 50, offset = 0 } = req.query
  try {
    const where = {
      createdAt: {
        gte: new Date(startDate || new Date(new Date().setDate(new Date().getDate() - 30))),
        lte: new Date(endDate || new Date())
      }
    }

    if (paymentStatus) {
      where.paymentStatus = paymentStatus
    }

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: {
          customer: { select: { name: true, phone: true } },
          cashier: { select: { name: true } },
          items: { include: { product: { select: { name: true } } } }
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit, 10),
        skip: parseInt(offset, 10)
      }),
      prisma.sale.count({ where })
    ])

    res.json({ success: true, data: sales, total })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const deleteSale = async (req, res) => {
  const { id } = req.params

  try {
    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id },
        include: { items: true, customer: true }
      })

      if (!sale) throw new Error('Sale not found')

      // 1. Restore Stock
      for (const item of sale.items) {
        if (item.baseQuantity > 0) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.baseQuantity } }
          })

          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              quantity: item.baseQuantity,
              type: 'ADJUSTMENT',
              note: `Sale ${sale.id} (Client: ${sale.clientId}) deleted - stock restored`
            }
          })
        }
      }

      // 2. Adjust Customer Balance if credit or advance was involved
      if (sale.customerId) {
        const ledgerEntries = await tx.customerLedgerEntry.findMany({
          where: { saleId: id }
        })

        for (const entry of ledgerEntries) {
          // Create reversal entry
          await tx.customerLedgerEntry.create({
            data: {
              customerId: sale.customerId,
              type: 'CREDIT_REVERSAL',
              amount: entry.amount,
              saleId: id,
              note: `Reversal of ${entry.type} due to sale deletion`
            }
          })

          // Both SALE_DEBIT and ADVANCE_APPLIED decrease currentBalance, so we increment to reverse
          await tx.customer.update({
            where: { id: sale.customerId },
            data: { currentBalance: { increment: entry.amount } }
          })
        }
      }

      // 3. Delete related records
      await tx.salePayment.deleteMany({ where: { saleId: id } })
      await tx.saleItem.deleteMany({ where: { saleId: id } })
      await tx.sale.delete({ where: { id } })

      return { success: true }
    })

    res.json(result)
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}
