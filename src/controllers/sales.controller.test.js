import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getSalesReport, syncSales } from './sales.controller.js'
import { prisma } from '../prisma.js'

vi.mock('../prisma.js', () => ({
  prisma: {
    $transaction: vi.fn(),
    sale: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    product: {
      update: vi.fn(),
    },
    stockMovement: {
      create: vi.fn(),
    }
  }
}))

describe('sales.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('syncSales', () => {
    it('should deduplicate already synced sales', async () => {
      const req = {
        body: {
          sales: [
            {
              clientId: 'sale-1',
              total: 100,
              items: [
                {
                  productId: 'product-1',
                  packageName: 'Unit',
                  unitsPerBase: 1,
                  quantity: 1,
                  baseQuantity: 1,
                  unitPrice: 100,
                },
              ],
            }
          ]
        },
        user: { id: 'user-1' },
      }
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      }

      prisma.$transaction.mockImplementation(async (callback) => {
        return callback(prisma)
      })

      prisma.sale.findUnique.mockResolvedValue({ id: 'existing-id' })

      await syncSales(req, res)

      expect(prisma.sale.create).not.toHaveBeenCalled()
      expect(res.json).toHaveBeenCalledWith({ success: true, data: ['sale-1'] })
    })

    it('should create new sales if not already synced', async () => {
      const req = {
        body: {
          sales: [
            {
              clientId: 'sale-new',
              items: [
                {
                  productId: 'product-1',
                  packageName: 'Unit',
                  unitsPerBase: 1,
                  quantity: 1,
                  baseQuantity: 1,
                  unitPrice: 100,
                },
              ],
              total: 100,
              createdAt: new Date().toISOString(),
              cashierId: 'stale-user-id',
              paymentLines: [{ method: 'CASH', amount: 100 }],
            }
          ]
        },
        user: { id: 'user-1' }
      }
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      }

      prisma.$transaction.mockImplementation(async (callback) => {
        return callback(prisma)
      })

      prisma.sale.findUnique.mockResolvedValue(null)
      prisma.sale.create.mockResolvedValue({ id: 'new-id' })

      await syncSales(req, res)

      expect(prisma.sale.create).toHaveBeenCalled()
      expect(prisma.sale.create.mock.calls[0][0].data.cashierId).toBe('user-1')
      expect(res.json).toHaveBeenCalledWith({ success: true, data: ['sale-new'] })
    })
  })

  describe('getSalesReport', () => {
    it('includes the full selected end date for date-only report filters', async () => {
      const req = {
        query: {
          startDate: '2026-06-04',
          endDate: '2026-06-04',
        },
      }
      const res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      }

      prisma.sale.findMany.mockResolvedValue([])
      prisma.sale.count.mockResolvedValue(0)

      await getSalesReport(req, res)

      const where = prisma.sale.findMany.mock.calls[0][0].where
      expect(where.createdAt.gte).toEqual(new Date(2026, 5, 4, 0, 0, 0, 0))
      expect(where.createdAt.lte).toEqual(new Date(2026, 5, 4, 23, 59, 59, 999))
      expect(res.json).toHaveBeenCalledWith({ success: true, data: [], total: 0 })
    })
  })
})
