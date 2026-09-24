import {
  Table,
  Column,
  Model,
  DataType,
  BelongsTo,
  ForeignKey,
  PrimaryKey,
  Default,
} from 'sequelize-typescript';
import { Sale } from './sale.entity';
import { Product } from './product.entity';

@Table({ tableName: 'sale_items', timestamps: false })
export class SaleItem extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @ForeignKey(() => Sale)
  @Column({ type: DataType.UUID, allowNull: false })
  saleId: string;

  @BelongsTo(() => Sale, { foreignKey: 'saleId', onDelete: 'CASCADE' })
  sale: Sale;

  @ForeignKey(() => Product)
  @Column({ type: DataType.UUID, allowNull: false })
  productId: string;

  @BelongsTo(() => Product, { foreignKey: 'productId', onDelete: 'RESTRICT' })
  product: Product;

  @Column({ type: DataType.INTEGER, allowNull: false })
  quantity: number;

  // Snapshot of price at time of sale (server-side, not client-provided)
  @Column({ type: DataType.BIGINT, allowNull: false })
  unitPriceCents: number;

  @Column({ type: DataType.BIGINT, allowNull: false })
  subtotalCents: number;
}
