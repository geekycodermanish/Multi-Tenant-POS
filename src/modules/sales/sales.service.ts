import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes, Transaction } from 'sequelize';
import {
  Sale, SaleItem, Payment, Inventory,
  Product, IdempotencyKey, User,
  SaleStatus, PaymentStatus,
} from '../../database/entities';
import { CreateSaleDto } from './dto/create-sale.dto';
import { IPaymentProvider, PAYMENT_PROVIDER } from '../payments/payment-provider.interface';
import { Inject } from '@nestjs/common';
import { StoresService } from '../stores/stores.service';
import { mapSaleResponse, SaleResponse } from './sale-response';
import { createRequestHash } from './idempotency.util';
import { ProductCacheService } from '../products/product-cache.service';

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
    @Optional() private productCache?: ProductCacheService,
  ) {}

  /**
   * Claims the store-scoped idempotency key inside the transaction before locking stock.
   * A committed claim points to the sale returned by subsequent retries.
   */
  async createSale(
    storeId: string,
    dto: CreateSaleDto,
    idempotencyKey: string | undefined,
    user: User,
  ): Promise<SaleResponse>;
  async createSale(
    storeId: string,
    dto: CreateSaleDto & { idempotencyKey?: string },
    user: User,
  ): Promise<SaleResponse>;
  async createSale(
    storeId: string,
    dto: CreateSaleDto,
    idempotencyKeyOrUser: string | User | undefined,
    userArgument?: User,
  ): Promise<SaleResponse> {
    const user = userArgument ?? idempotencyKeyOrUser as User;
    const idempotencyKey = userArgument
      ? idempotencyKeyOrUser as string | undefined
      : (dto as CreateSaleDto & { idempotencyKey?: string }).idempotencyKey;

    // 1. Tenant check
    const store = await this.storesService.assertStoreAccess(user, storeId);

    if (
      typeof idempotencyKey !== 'string' ||
      idempotencyKey.length < 8 ||
      idempotencyKey.length > 128 ||
      !/^[A-Za-z0-9_-]+$/.test(idempotencyKey)
    ) {
      throw new BadRequestException(
        'Idempotency-Key must be 8-128 characters using letters, numbers, underscores, or hyphens',
      );
    }

    const requestHash = createRequestHash(store.id, dto);
    const existingResponse = await this.findIdempotentResponse(
      idempotencyKey,
      store.id,
      requestHash,
    );
    if (existingResponse) return existingResponse;

    try {
      const result = await this.runSaleTransaction(async (t, markPaymentAttempted) => {
        await this.idempotencyModel.create({
          key: idempotencyKey,
          storeId: store.id,
          requestHash,
          saleId: null,
        } as any, { transaction: t });

        const quantities = new Map<string, number>();
        for (const item of dto.items) {
          quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
        }
        const productIds = [...quantities.keys()].sort();

        for (const [productId, quantity] of quantities) {
          if (!Number.isSafeInteger(quantity) || quantity < 1) {
            throw new BadRequestException(`Invalid quantity for product ${productId}`);
          }
        }

        const inventories = await this.inventoryModel.findAll({
          where: { productId: productIds, storeId: store.id },
          order: [['productId', 'ASC']],
          lock: t.LOCK.UPDATE,
          transaction: t,
        });
        const invMap = new Map<string, Inventory>(
          inventories.map((inventory) => [inventory.productId, inventory]),
        );

        const products = await this.productModel.findAll({
          where: { id: productIds, storeId: store.id, isActive: true },
          transaction: t,
        });
        const productMap = new Map<string, Product>(
          products.map((product) => [product.id, product]),
        );

        let totalCents = 0;
        const saleItemsData: Array<{
          productId: string;
          name: string;
          quantity: number;
          unitPriceCents: number;
          subtotalCents: number;
        }> = [];

        for (const productId of productIds) {
          const product = productMap.get(productId);
          if (!product) {
            throw new NotFoundException(`Product ${productId} not found in this store`);
          }

          const inventory = invMap.get(productId);
          if (!inventory) {
            throw new NotFoundException(`Inventory record for product ${productId} not found`);
          }

          const quantity = quantities.get(productId)!;
          if (Number(inventory.quantity) < quantity) {
            throw new BadRequestException(
              `Insufficient stock for "${product.name}". Available: ${inventory.quantity}, requested: ${quantity}`,
            );
          }

          const unitPriceCents = Number(product.priceCents);
          const subtotalCents = unitPriceCents * quantity;
          totalCents += subtotalCents;
          saleItemsData.push({
            productId,
            name: product.name,
            quantity,
            unitPriceCents,
            subtotalCents,
          });
          await inventory.update(
            { quantity: Number(inventory.quantity) - quantity },
            { transaction: t },
          );
        }

        const [billNumberRow] = await this.sequelize.query<{ billNumber: string }>(
          `SELECT 'BILL-' || lpad(nextval('"sales_bill_seq"')::text, 8, '0') AS "billNumber"`,
          { type: QueryTypes.SELECT, transaction: t },
        );

        const sale = await this.saleModel.create({
          storeId: store.id,
          createdById: user.id,
          billNumber: billNumberRow.billNumber,
          totalCents,
          status: SaleStatus.PENDING,
          idempotencyKey,
          notes: dto.notes,
        } as any, { transaction: t });

        await this.saleItemModel.bulkCreate(
          saleItemsData.map(({ name: _name, ...item }) => ({ ...item, saleId: sale.id })),
          { transaction: t },
        );

        markPaymentAttempted();
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
          throw new BadRequestException(
            `Payment failed: ${paymentResult.failureReason ?? 'unknown reason'}`,
          );
        }

        await sale.update({ status: SaleStatus.COMPLETED }, { transaction: t });

        await this.sequelize.query(
          `UPDATE "idempotency_keys" SET "saleId" = :saleId WHERE "key" = :key AND "storeId" = :storeId`,
          {
            replacements: { saleId: sale.id, key: idempotencyKey, storeId: store.id },
            transaction: t,
          },
        );

        return mapSaleResponse(
          sale,
          PaymentStatus.SUCCESS,
          saleItemsData,
        );
      });
      await this.productCache?.invalidateStore(store.id).catch(() => undefined);
      return result;
    } catch (error) {
      if (this.isInventoryQuantityCheckViolation(error)) {
        throw new BadRequestException('Insufficient stock');
      }
      if (this.isIdempotencyUniqueViolation(error)) {
        const winnerResponse = await this.findIdempotentResponse(
          idempotencyKey,
          store.id,
          requestHash,
        );
        if (winnerResponse) return winnerResponse;
        throw new ConflictException(
          'A request with this Idempotency-Key is still in progress, retry shortly',
        );
      }
      throw error;
    }
  }

  private async findIdempotentResponse(
    key: string,
    storeId: string,
    requestHash: string,
  ): Promise<SaleResponse | undefined> {
    const existingKey = await this.idempotencyModel.findOne({
      where: { key, storeId },
    });
    if (!existingKey) return undefined;
    if (
      existingKey.requestHash !== undefined &&
      existingKey.requestHash !== requestHash
    ) {
      throw new UnprocessableEntityException(
        'Idempotency-Key was already used with a different request',
      );
    }
    if (!existingKey.saleId) {
      throw new ConflictException(
        'A request with this Idempotency-Key is still in progress, retry shortly',
      );
    }

    const cached = await this.saleModel.findOne({
      where: { id: existingKey.saleId, storeId },
      include: [
        { model: SaleItem, as: 'items', include: [{ model: Product, as: 'product' }] },
        'payment',
      ],
    });
    if (!cached?.payment) {
      throw new ConflictException(
        'A request with this Idempotency-Key is still in progress, retry shortly',
      );
    }

    return mapSaleResponse(
      cached,
      cached.payment.status,
      cached.items.map((item) => ({
        productId: item.productId,
        name: item.product.name,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        subtotalCents: item.subtotalCents,
      })),
    );
  }

  private async runSaleTransaction<T>(
    work: (transaction: Transaction, markPaymentAttempted: () => void) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let paymentAttempted = false;
      try {
        return await this.sequelize.transaction(
          { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED },
          (transaction: Transaction) =>
            work(transaction, () => {
              paymentAttempted = true;
            }),
        );
      } catch (error) {
        const code = this.getPostgresErrorField(error, 'code');
        const canRetry = (code === '40P01' || code === '40001') &&
          !paymentAttempted &&
          attempt < 2;
        if (!canRetry) throw error;

        await new Promise((resolve) =>
          setTimeout(resolve, 10 + Math.floor(Math.random() * 41)),
        );
      }
    }

    throw new Error('Sale transaction retry limit exceeded');
  }

  private isInventoryQuantityCheckViolation(error: unknown): boolean {
    return this.getPostgresErrorField(error, 'code') === '23514' &&
      this.getPostgresErrorField(error, 'constraint') === 'CHK_inventory_qty';
  }

  private isIdempotencyUniqueViolation(error: unknown): boolean {
    return this.getPostgresErrorField(error, 'code') === '23505' &&
      this.getPostgresErrorField(error, 'constraint') === 'UQ_idempotency_key_store';
  }

  private getPostgresErrorField(
    error: unknown,
    field: 'code' | 'constraint',
  ): string | undefined {
    if (!error || typeof error !== 'object') return undefined;
    const candidates = [
      error as Record<string, unknown>,
      (error as Record<string, unknown>).original,
      (error as Record<string, unknown>).parent,
    ];
    for (const candidate of candidates) {
      if (candidate && typeof candidate === 'object') {
        const value = (candidate as Record<string, unknown>)[field];
        if (typeof value === 'string') return value;
      }
    }
    return undefined;
  }

  async findAll(storeId: string, user: User): Promise<Sale[]> {
    await this.storesService.assertStoreAccess(user, storeId);
    return this.saleModel.findAll({
      where: { storeId },
      include: ['items', 'payment'],
      order: [['createdAt', 'DESC']],
    });
  }

  async findOne(storeId: string, id: string, user: User): Promise<Sale> {
    await this.storesService.assertStoreAccess(user, storeId);
    const sale = await this.saleModel.findOne({
      where: { id, storeId },
      include: ['items', 'payment', 'store'],
    });
    if (!sale) throw new NotFoundException('Sale not found');
    return sale;
  }
}
