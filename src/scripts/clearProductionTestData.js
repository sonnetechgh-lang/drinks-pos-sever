import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '../prisma.js'

const EXPECTED_DATABASE_HOST = 'dpg-d8ebnd19rddc73en4kkg-a'
const EXPECTED_DATABASE_NAME = 'drinks_pos_db'
const REQUIRED_CONFIRMATION = 'CLEAR_PRODUCTION_TEST_DATA'

const stripQuotes = (value = '') => value.replace(/^"|"$/g, '')

const getDatabaseInfo = () => {
  const rawUrl = stripQuotes(process.env.DATABASE_URL || '')
  if (!rawUrl) {
    throw new Error('DATABASE_URL is required.')
  }

  const parsed = new URL(rawUrl)
  return {
    host: parsed.hostname,
    database: parsed.pathname.replace(/^\//, ''),
  }
}

const requireProductionConfirmation = () => {
  const { host, database } = getDatabaseInfo()

  if (process.env.CLEANUP_TARGET !== 'production') {
    throw new Error('Refusing cleanup: set CLEANUP_TARGET=production.')
  }

  if (process.env.CLEANUP_CONFIRM !== REQUIRED_CONFIRMATION) {
    throw new Error(`Refusing cleanup: set CLEANUP_CONFIRM=${REQUIRED_CONFIRMATION}.`)
  }

  if (host !== EXPECTED_DATABASE_HOST || database !== EXPECTED_DATABASE_NAME) {
    throw new Error(`Refusing cleanup: expected ${EXPECTED_DATABASE_NAME} on ${EXPECTED_DATABASE_HOST}, got ${database} on ${host}.`)
  }
}

const getCounts = async () => ({
  users: await prisma.user.count(),
  categories: await prisma.category.count(),
  products: await prisma.product.count(),
  packageOptions: await prisma.productPackageOption.count(),
  customers: await prisma.customer.count(),
  customerPayments: await prisma.customerPayment.count(),
  customerLedgerEntries: await prisma.customerLedgerEntry.count(),
  sales: await prisma.sale.count(),
  salePayments: await prisma.salePayment.count(),
  saleItems: await prisma.saleItem.count(),
  stockMovements: await prisma.stockMovement.count(),
})

const createBackup = async (counts) => {
  const backupDir = process.env.CLEANUP_BACKUP_DIR || path.join(process.cwd(), 'backups')
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(backupDir, `production-test-data-backup-${timestamp}.json`)

  const backup = {
    metadata: {
      createdAt: new Date().toISOString(),
      target: 'production',
      serverUrl: 'https://drinks-pos-sever.onrender.com',
      databaseHost: EXPECTED_DATABASE_HOST,
      databaseName: EXPECTED_DATABASE_NAME,
      counts,
      note: 'Backup created before clearing production test data. Existing users are preserved by cleanup but included here for recovery context.',
    },
    data: {
      users: await prisma.user.findMany(),
      categories: await prisma.category.findMany(),
      products: await prisma.product.findMany(),
      productPackageOptions: await prisma.productPackageOption.findMany(),
      customers: await prisma.customer.findMany(),
      customerPayments: await prisma.customerPayment.findMany(),
      customerLedgerEntries: await prisma.customerLedgerEntry.findMany(),
      sales: await prisma.sale.findMany(),
      salePayments: await prisma.salePayment.findMany(),
      saleItems: await prisma.saleItem.findMany(),
      stockMovements: await prisma.stockMovement.findMany(),
    },
  }

  await mkdir(backupDir, { recursive: true })
  await writeFile(backupPath, JSON.stringify(backup, null, 2))
  return backupPath
}

const printCounts = (label, counts) => {
  console.log(label)
  for (const [name, count] of Object.entries(counts)) {
    console.log(`- ${name}: ${count}`)
  }
}

async function main() {
  requireProductionConfirmation()

  const before = await getCounts()
  printCounts('Before cleanup:', before)

  const backupPath = await createBackup(before)
  console.log(`Backup written to: ${backupPath}`)

  await prisma.$transaction([
    prisma.salePayment.deleteMany(),
    prisma.saleItem.deleteMany(),
    prisma.customerLedgerEntry.deleteMany(),
    prisma.customerPayment.deleteMany(),
    prisma.sale.deleteMany(),
    prisma.stockMovement.deleteMany(),
    prisma.productPackageOption.deleteMany(),
    prisma.product.deleteMany(),
    prisma.category.deleteMany(),
    prisma.customer.deleteMany(),
  ])

  const after = await getCounts()
  printCounts('After cleanup:', after)

  console.log('Production test data cleanup completed. Existing users/login credentials were preserved.')
}

main()
  .catch((error) => {
    console.error('Production test data cleanup failed:', error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
