import { PrismaClient, Role, Currency, ProductUnit, ContactType, PaymentMethod, TransactionType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("demo1234", 10);

  const user = await prisma.user.upsert({
    where: { email: "demo@treinta.local" },
    update: {},
    create: {
      email: "demo@treinta.local",
      name: "Usuario Demo",
      phone: "3000000000",
      password: passwordHash,
      role: Role.ADMIN,
    },
  });

  const business = await prisma.business.create({
    data: {
      name: "Mi Negocio Demo",
      currency: Currency.COP,
      userId: user.id,
    },
  });

  const [categoriaAbarrotes, categoriaBebidas] = await Promise.all([
    prisma.category.create({ data: { name: "Abarrotes", businessId: business.id } }),
    prisma.category.create({ data: { name: "Bebidas", businessId: business.id } }),
  ]);

  const arroz = await prisma.product.create({
    data: {
      name: "Arroz x Libra",
      barcode: "7701000000019",
      sku: "ARR-001",
      price: 2500,
      cost: 1800,
      stock: 50,
      unit: ProductUnit.KG,
      minStockAlert: 10,
      businessId: business.id,
      categoryId: categoriaAbarrotes.id,
    },
  });

  const gaseosa = await prisma.product.create({
    data: {
      name: "Gaseosa 1.5L",
      barcode: "7701000000026",
      sku: "BEB-001",
      price: 6000,
      cost: 4200,
      stock: 30,
      unit: ProductUnit.UNIT,
      minStockAlert: 5,
      businessId: business.id,
      categoryId: categoriaBebidas.id,
    },
  });

  await prisma.productVariant.createMany({
    data: [
      { productId: gaseosa.id, name: "Sabor Cola", price: 6000, cost: 4200, stock: 20 },
      { productId: gaseosa.id, name: "Sabor Naranja", price: 6000, cost: 4200, stock: 10 },
    ],
  });

  const cliente = await prisma.contact.create({
    data: {
      businessId: business.id,
      name: "Juan Pérez",
      phone: "3111234567",
      ruc: "1234567890",
      address: "Calle 10 # 5-23, Bogotá",
      type: ContactType.CLIENT,
    },
  });

  await prisma.contact.create({
    data: {
      businessId: business.id,
      name: "Distribuidora XYZ",
      phone: "3129876543",
      ruc: "900123456-1",
      address: "Av. Industrial 45, Bogotá",
      type: ContactType.SUPPLIER,
    },
  });

  const cashRegister = await prisma.cashRegister.create({
    data: {
      businessId: business.id,
      initialAmount: 100000,
    },
  });

  const sale = await prisma.transaction.create({
    data: {
      businessId: business.id,
      cashRegisterId: cashRegister.id,
      type: TransactionType.INCOME,
      amount: 8500,
      paymentMethod: PaymentMethod.CASH,
      concept: "Venta mostrador",
      categoryId: categoriaAbarrotes.id,
      saleItems: {
        create: [
          { productId: arroz.id, quantity: 2, unitPrice: 2500, unitCost: 1800 },
          { productId: gaseosa.id, quantity: 0.5, unitPrice: 6000, unitCost: 4200 },
        ],
      },
    },
  });

  const creditSaleAmount = 15000;
  const creditTransaction = await prisma.transaction.create({
    data: {
      businessId: business.id,
      cashRegisterId: cashRegister.id,
      type: TransactionType.INCOME,
      amount: creditSaleAmount,
      paymentMethod: PaymentMethod.CREDIT,
      concept: "Venta fiada",
      contactId: cliente.id,
    },
  });

  await prisma.debt.create({
    data: {
      businessId: business.id,
      contactId: cliente.id,
      transactionId: creditTransaction.id,
      totalAmount: creditSaleAmount,
      remainingAmount: creditSaleAmount,
    },
  });

  console.log("Seed completado:");
  console.log({ user: user.email, business: business.name, sale: sale.id });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
