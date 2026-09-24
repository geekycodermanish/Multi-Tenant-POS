import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Transaction } from 'sequelize';
import {
  Sale, SaleItem, Payment, Inventory,
  Product, IdempotencyKey, User,
  SaleStatus, PaymentStatus,
} from '../../database/entities';
import { CreateSaleDto } from './dto/create-sale.dto';
import { IPaymentProvider, PAYMENT_PROVIDER } from '../payments/payment-provider.interface';
import { Inject } from '@nestjs/common';
import { StoresService } from '../stores/stores.service';

@Injectable()
export class SalesService {
  constructor(
    @InjectModel(Sale) private saleModel: typeof Sale,
    @InjectModel(SaleItem) private saleItemModel: typeof SaleItem,
    @InjectModel(Payment) private paymentModel: typeof Payment,
    @InjectModel(Inventory) private inventoryModel: typeof Inventory,
    @InjectModel(Product) private productModel: typeof Product,
    @InjectModel(IdempotencyKey) private idempotencyModel: typeof IdempotencyKey,
    @InjectConnection() private sequelize: Sequelize,
    @Inject(PAYMENT_PROVIDER) private paymentProvider: IPaymentProvider,
    private storesService: StoresService,
  ) {}

  /**
   * Creates a sale inside a serializable transaction.
   *
   * Concurrency strategy:
   *   findAll({ lock: true, transaction }) issues SELECT ... FOR UPDATE on inventory
   *   rows, serialising concurrent requests for the same product so the second waits
   *   for the first to commit before reading the updated quantity.
   *
   * Idempotency strategy:
   *   The POS terminal sends a unique idempotencyKey per sale attempt.
   *   Before doing any work we check idempotency_keys with a UNIQUE constraint on
   *   (key, storeId). If the row already exists we return the cached response.
   */
  async createSale(storeId: string, dto: CreateSaleDto, user: User): Promise<Sale> {
    // 1. Tenant check
    const store = await this.storesService.findOne(storeId, user);

    // 2. Idempotency check — return cached result if this key was already processed
    const existingKey = await this.idempotencyModel.findOne({
      where: { key: dto.idempotencyKey, storeId: store.id },
    });
    if (existingKey?.saleId) {
      const cached = await this.saleModel.findOne({
        where: { id: existingKey.saleId },
        include: ['items', 'payment'],
      });
      if (cached) return cached;
    }

    // 3. Run everything in one SERIALIZABLE transaction
    return this.sequelize.transaction(
      { isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE },
      async (t: Transaction) => {
        const productIds = dto.items.map((i) => i.productId);

        // ---- Lock inventory rows to prevent overselling (SELECT ... FOR UPDATE) ----
        const inventories = await this.inventoryModel.findAll({
          where: { productId: productIds, storeId: store.id },
          lock: true,           // SELECT ... FOR UPDATE
          transaction: t,
        });

        const invMap = new Map<string, Inventory>(
          inventories.map((i) => [i.productId, i]),
        );

        // ---- Fetch products (server-side prices) ----
        const products = await this.productModel.findAll({
          where: { id: productIds, storeId: store.id, isActive: true },
          transaction: t,
        });
        const productMap = new Map<string, Product>(
          products.map((p) => [p.id, p]),
        );

        // ---- Validate each item ----
        let totalCents = 0;
        const saleItemsData: Array<{
          productId: string;
          quantity: number;
          unitPriceCents: number;
          subtotalCents: number;
        }> = [];

        for (const item of dto.items) {
          const product = productMap.get(item.productId);
          if (!product) {
            throw new NotFoundException(`Product ${item.productId} not found in this store`);
          }

          const inv = invMap.get(item.productId);
          if (!inv) {
            throw new BadRequestException(`No inventory record for product ${item.productId}`);
          }

          if (inv.quantity < item.quantity) {
            throw new BadRequestException(
              `Insufficient stock for "${product.name}". Available: ${inv.quantity}, requested: ${item.quantity}`,
            );
          }

          const unitPriceCents = Number(product.priceCents);
          const subtotalCents = unitPriceCents * item.quantity;
          totalCents += subtotalCents;

          saleItemsData.push({
            productId: item.productId,
            quantity: item.quantity,
            unitPriceCents,
            subtotalCents,
          });

          // Deduct inventory atomically inside the transaction
          await inv.update({ quantity: inv.quantity - item.quantity }, { transaction: t });
        }

        // ---- Create the Sale ----
        const sale = await this.saleModel.create({
          storeId: store.id,
          createdById: user.id,
          totalCents,
          status: SaleStatus.PENDING,
          idempotencyKey: dto.idempotencyKey,
          notes: dto.notes,
        } as any, { transaction: t });

        // ---- Create SaleItems ----
        await this.saleItemModel.bulkCreate(
          saleItemsData.map((si) => ({ ...si, saleId: sale.id })),
          { transaction: t },
        );

        // ---- Process Payment ----
        const paymentResult = await this.paymentProvider.charge({
          amountCents: totalCents,
          method: dto.paymentMethod,
          reference: sale.id,
        });

        await this.paymentModel.create({
          saleId: sale.id,
          amountCents: totalCents,
          method: dto.paymentMethod,
          status: paymentResult.success ? PaymentStatus.SUCCESS : PaymentStatus.FAILED,
          providerReference: paymentResult.providerReference,
          failureReason: paymentResult.failureReason,
        } as any, { transaction: t });

        if (!paymentResult.success) {
          // Payment failed — re-throw so transaction rolls back, restoring inventory
          throw new BadRequestException(
            `Payment failed: ${paymentResult.failureReason ?? 'unknown reason'}`,
          );
        }

        // ---- Mark sale as completed ----
        await sale.update({ status: SaleStatus.COMPLETED }, { transaction: t });

        // ---- Store idempotency record ----
        await this.idempotencyModel.create({
          key: dto.idempotencyKey,
          storeId: store.id,
          saleId: sale.id,
        } as any, { transaction: t });

        // Return the fully-loaded sale (outside the lock is fine — transaction already committed)
        return this.saleModel.findOne({
          where: { id: sale.id },
          include: ['items', 'payment'],
        });
      },
    );
  }

  async findAll(storeId: string, user: User): Promise<Sale[]> {
    await this.storesService.findOne(storeId, user);
    return this.saleModel.findAll({
      where: { storeId },
      include: ['items', 'payment'],
      order: [['createdAt', 'DESC']],
    });
  }

  async findOne(id: string, user: User): Promise<Sale> {
    const sale = await this.saleModel.findOne({
      where: { id },
      include: ['items', 'payment', 'store'],
    });
    if (!sale) throw new NotFoundException('Sale not found');

    // Tenant isolation
    await this.storesService.findOne(sale.storeId, user);
    return sale;
  }
}
