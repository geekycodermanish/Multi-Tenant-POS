import {
  Table,
  Column,
  Model,
  DataType,
  BelongsTo,
  ForeignKey,
  UpdatedAt,
  PrimaryKey,
  Default,
  Index,
  Unique,
} from 'sequelize-typescript';
import { Product } from './product.entity';
import { Store } from './store.entity';

@Table({
  tableName: 'inventories',
  timestamps: false, // only has updatedAt
})
export class Inventory extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @Unique
  @ForeignKey(() => Product)
  @Column({ type: DataType.UUID, allowNull: false })
  productId: string;

  @BelongsTo(() => Product, { foreignKey: 'productId', onDelete: 'CASCADE' })
  product: Product;

  @Index
  @ForeignKey(() => Store)
  @Column({ type: DataType.UUID, allowNull: false })
  storeId: string;

  @BelongsTo(() => Store, { foreignKey: 'storeId', onDelete: 'CASCADE' })
  store: Store;

  // quantity >= 0 enforced by DB CHECK constraint in migration
  @Default(0)
  @Column({ type: DataType.INTEGER, allowNull: false })
  quantity: number;

  @Default(0)
  @Column({ type: DataType.INTEGER, allowNull: false })
  reservedQuantity: number;

  @UpdatedAt
  updatedAt: Date;
}
