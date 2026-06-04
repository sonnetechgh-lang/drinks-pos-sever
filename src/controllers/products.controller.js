import { prisma } from '../prisma.js'

const normalizePackageOptions = (packageOptions = []) =>
  packageOptions.map((option) => ({
    name: option.name,
    unitsPerBase: parseInt(option.unitsPerBase, 10) || 1,
    price: parseFloat(option.price) || 0,
    wholesalePrice: option.wholesalePrice ? parseFloat(option.wholesalePrice) : null,
    isDefault: option.isDefault || false,
    active: option.active !== undefined ? option.active : true,
  }))

const defaultCategories = [
  { name: 'Alcoholic', hasPackaging: true },
  { name: 'Non-Alcoholic', hasPackaging: false },
]

const ensureDefaultCategories = async () => {
  const legacyAlcoholic = await prisma.category.findMany({
    where: { name: { in: ['Alcohlic', 'Alcoholic Drinks'] } },
  })

  const categories = await Promise.all(defaultCategories.map((category) =>
    prisma.category.upsert({
      where: { name: category.name },
      update: { hasPackaging: category.hasPackaging },
      create: category,
    })
  ))

  const alcoholic = categories.find((category) => category.name === 'Alcoholic')
  if (alcoholic) {
    for (const legacy of legacyAlcoholic) {
      await prisma.product.updateMany({
        where: { categoryId: legacy.id },
        data: { categoryId: alcoholic.id },
      })
      await prisma.category.delete({ where: { id: legacy.id } })
    }
  }

  return categories
}

export const getAllProducts = async (req, res) => {
  try {
    await ensureDefaultCategories()
    const products = await prisma.product.findMany({
      include: { category: true, packageOptions: true },
    })
    res.json({ success: true, data: products })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const getProductById = async (req, res) => {
  const { id } = req.params
  try {
    const product = await prisma.product.findUnique({
      where: { id },
      include: { category: true, packageOptions: true },
    })
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' })
    }
    res.json({ success: true, data: product })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const createProduct = async (req, res) => {
  const { name, price, stock, lowStockThreshold, categoryId, baseUnit, packageOptions } = req.body
  if (!name?.trim()) {
    return res.status(400).json({ success: false, message: 'Product name is required' })
  }

  if (!categoryId) {
    return res.status(400).json({ success: false, message: 'Select a category before saving the product' })
  }

  try {
    const product = await prisma.product.create({
      data: {
        name,
        price: parseFloat(price),
        stock: parseInt(stock, 10) || 0,
        lowStockThreshold: parseInt(lowStockThreshold, 10) || 5,
        categoryId,
        baseUnit: baseUnit || 'UNIT',
        packageOptions: packageOptions?.length
          ? { create: normalizePackageOptions(packageOptions) }
          : undefined,
      },
    })
    res.status(201).json({ success: true, data: product })
  } catch (error) {
    const message = error.code === 'P2003' ? 'Selected category does not exist' : error.message
    res.status(error.code === 'P2003' ? 400 : 500).json({ success: false, message })
  }
}

export const updateProduct = async (req, res) => {
  const { id } = req.params
  const { name, price, stock, lowStockThreshold, categoryId, baseUnit, packageOptions } = req.body
  try {
    const data = {
      name,
      price: price !== undefined ? parseFloat(price) : undefined,
      stock: stock !== undefined ? parseInt(stock, 10) : undefined,
      lowStockThreshold: lowStockThreshold !== undefined ? parseInt(lowStockThreshold, 10) : undefined,
      categoryId,
      baseUnit,
    }

    if (packageOptions?.length) {
      data.packageOptions = {
        deleteMany: {},
        create: normalizePackageOptions(packageOptions),
      }
    }

    const product = await prisma.product.update({
      where: { id },
      data,
    })
    res.json({ success: true, data: product })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const deleteProduct = async (req, res) => {
  const { id } = req.params
  try {
    await prisma.$transaction(async (tx) => {
      await tx.stockMovement.deleteMany({ where: { productId: id } })
      await tx.productPackageOption.deleteMany({ where: { productId: id } })
      await tx.product.delete({ where: { id } })
    })
    res.json({ success: true, message: 'Product deleted' })
  } catch (error) {
    const message = error.code === 'P2025'
      ? 'Product not found'
      : error.code === 'P2003'
        ? 'This product has sales history and cannot be deleted.'
        : error.message
    res.status(error.code === 'P2025' ? 404 : error.code === 'P2003' ? 409 : 500).json({ success: false, message })
  }
}

export const getAllCategories = async (req, res) => {
  try {
    await ensureDefaultCategories()
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
    })
    res.json({
      success: true,
      data: categories.map((category) => ({
        ...category,
        hasPackaging: category.hasPackaging || ['alcoholic', 'alcohlic'].includes(category.name.toLowerCase()),
      })),
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const createCategory = async (req, res) => {
  const { name, hasPackaging } = req.body
  if (!name?.trim()) {
    return res.status(400).json({ success: false, message: 'Category name is required' })
  }
  try {
    const existing = await prisma.category.findUnique({
      where: { name: name.trim() }
    })
    if (existing) {
      return res.status(400).json({ success: false, message: 'Category name must be unique' })
    }
    const category = await prisma.category.create({
      data: {
        name: name.trim(),
        hasPackaging: !!hasPackaging
      }
    })
    res.status(201).json({ success: true, data: category })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Dashboard: Total product count
export const getProductCount = async (req, res) => {
  try {
    const count = await prisma.product.count()
    res.json({ success: true, data: { count } })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Dashboard: Low stock items
export const getLowStockProducts = async (req, res) => {
  const { limit = 8 } = req.query
  try {
    const products = await prisma.product.findMany({
      include: { category: true },
      orderBy: { stock: 'asc' },
    })

    const lowStock = products
      .filter((p) => p.stock <= p.lowStockThreshold)
      .slice(0, parseInt(limit, 10))

    res.json({ success: true, data: lowStock })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}
