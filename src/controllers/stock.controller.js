import { prisma } from '../prisma.js'

export const updateStock = async (req, res) => {
  const { productId, quantity, type, note } = req.body

  if (!productId || quantity === undefined || !type) {
    return res.status(400).json({ success: false, message: 'Missing required fields' })
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } })
      if (!product) throw new Error('Product not found')

      const newStock = type === 'RESTOCK' ? product.stock + quantity : product.stock - quantity
      
      const updatedProduct = await tx.product.update({
        where: { id: productId },
        data: { stock: newStock },
      })

      const movement = await tx.stockMovement.create({
        data: {
          productId,
          quantity,
          type,
          note,
        },
      })

      return { updatedProduct, movement }
    })

    res.json({ success: true, data: result })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const getStockLevels = async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      select: {
        id: true,
        name: true,
        stock: true,
        category: { select: { name: true } },
      },
      orderBy: { stock: 'asc' },
    })
    
    const productsWithFlag = products.map(p => ({
      ...p,
      isLowStock: p.stock <= 5
    }))

    res.json({ success: true, data: productsWithFlag })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}
