import { prisma } from '../prisma.js'

const CREDIT_TYPES = new Set([
  'PAYMENT_CREDIT',
  'PAYMENT_DEPOSIT',
  'CREDIT_REVERSAL',
  'ADJUSTMENT',
])

const DEBIT_TYPES = new Set([
  'SALE_DEBIT',
  'ADVANCE_APPLIED',
])

const calculateBalance = (entries) => entries.reduce((total, entry) => {
  const amount = Number(entry.amount || 0)
  if (CREDIT_TYPES.has(entry.type)) return total + amount
  if (DEBIT_TYPES.has(entry.type)) return total - amount
  return total
}, 0)

async function main() {
  const customers = await prisma.customer.findMany({
    include: {
      ledger: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  console.log(`Migrating balances for ${customers.length} customers...`)

  let updatedCount = 0
  for (const customer of customers) {
    const currentBalance = calculateBalance(customer.ledger)

    await prisma.customer.update({
      where: { id: customer.id },
      data: { currentBalance },
    })

    updatedCount += 1
    console.log(`${customer.name}: ${currentBalance.toFixed(2)}`)
  }

  console.log(`Balance migration complete. Updated ${updatedCount} customers.`)
}

main()
  .catch((error) => {
    console.error('Balance migration failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
