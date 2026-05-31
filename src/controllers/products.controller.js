import { prisma } from '../prisma.js'

const normalizePackageOptions = (packageOptions = []) =>
  packageOptions.map((option) => ({
    name: option.name,
    unitsPerBase: parseInt(option.unitsPerBase, 10) || 1,
    price: parseFloat(option.price) || 0,
    isDefault: option.isDefault || false,
    active: option.active !== undefined ? option.active : true,
  }))

export const getAllProducts = async (req, res) => {
  try {
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
  const { name, price, stock, categoryId, baseUnit, packageOptions } = req.body
  try {
    const product = await prisma.product.create({
      data: {
        name,
        price: parseFloat(price),
        stock: parseInt(stock, 10) || 0,
        categoryId,
        baseUnit: baseUnit || 'UNIT',
        packageOptions: packageOptions?.length
          ? { create: normalizePackageOptions(packageOptions) }
          : undefined,
      },
    })
    res.status(201).json({ success: true, data: product })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const updateProduct = async (req, res) => {
  const { id } = req.params
  const { name, price, stock, categoryId, baseUnit, packageOptions } = req.body
  try {
    const data = {
      name,
      price: price !== undefined ? parseFloat(price) : undefined,
      stock: stock !== undefined ? parseInt(stock, 10) : undefined,
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
    await prisma.product.delete({ where: { id } })
    res.json({ success: true, message: 'Product deleted' })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const getAllCategories = async (req, res) => {
  try {
    const categories = await prisma.category.findMany()
    res.json({ success: true, data: categories })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}
