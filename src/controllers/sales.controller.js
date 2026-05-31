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
            amountPaid: paidAmount,
            creditAmount: creditAmount > 0 ? creditAmount : 0,
            customerId: sale.customerId || undefined,
            customerName: sale.customerName || undefined,
            paymentStatus,
            cashierId: sale.cashierId,
            createdAt: sale.createdAt ? new Date(sale.createdAt) : undefined,
            syncedAt: new Date(),
            items: {
              create: sale.items.map((item) => ({
                productId: item.productId,
                packageOptionId: item.packageOptionId || undefined,
                packageName: item.packageName || 'Unit',
                unitsPerBase: item.unitsPerBase || 1,
                quantity: item.quantity,
                baseQuantity: item.baseQuantity || item.quantity,
                unitPrice: parseNumber(item.unitPrice),
              }))
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
        }

        for (const line of paymentLines) {
          if (line.method === 'ADVANCE_BALANCE' && sale.customerId) {
            await tx.customerLedgerEntry.create({
              data: {
                customerId: sale.customerId,
                type: 'ADVANCE_APPLIED',
                amount: parseNumber(line.amount),
                saleId: newSale.id,
                note: 'Advance balance applied',
              }
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
