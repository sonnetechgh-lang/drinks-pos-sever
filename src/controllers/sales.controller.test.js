import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncSales } from './sales.controller.js'
import { prisma } from '../prisma.js'

vi.mock('../prisma.js', () => ({
  prisma: {
    $transaction: vi.fn(),
    sale: {
      findUnique: vi.fn(),
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
            { clientId: 'sale-1', items: [], total: 100 }
          ]
        }
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
              items: [],
              total: 100,
              createdAt: new Date().toISOString(),
              cashierId: 'user-1',
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
      expect(res.json).toHaveBeenCalledWith({ success: true, data: ['sale-new'] })
    })
  })
})
