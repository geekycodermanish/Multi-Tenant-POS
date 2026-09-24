import {
  Table,
  Column,
  Model,
  DataType,
  BelongsTo,
  HasOne,
  HasMany,
  ForeignKey,
  CreatedAt,
  UpdatedAt,
  PrimaryKey,
  Default,
  Index,
} from 'sequelize-typescript';
import { Store } from './store.entity';
import { Inventory } from './inventory.entity';
import { SaleItem } from './sale-item.entity';

@Table({ tableName: 'products', timestamps: true })
export class Product extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @Column({ type: DataType.STRING, allowNull: false })
  name: string;

  @Column({ type: DataType.STRING, allowNull: true })
  description: string;

  @Column({ type: DataType.STRING, allowNull: true })
  sku: string;

  // Price stored as integer cents to avoid float issues
  @Column({ type: DataType.BIGINT, allowNull: false })
  priceCents: number;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  isActive: boolean;

  @Index
  @ForeignKey(() => Store)
  @Column({ type: DataType.UUID, allowNull: false })
  storeId: string;

  @BelongsTo(() => Store, { foreignKey: 'storeId', onDelete: 'CASCADE' })
  store: Store;

  @HasOne(() => Inventory, { foreignKey: 'productId' })
  inventory: Inventory;

  @HasMany(() => SaleItem, { foreignKey: 'productId' })
  saleItems: SaleItem[];

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}
