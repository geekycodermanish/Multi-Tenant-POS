import {
  Table,
  Column,
  Model,
  DataType,
  BelongsTo,
  HasMany,
  HasOne,
  ForeignKey,
  CreatedAt,
  UpdatedAt,
  PrimaryKey,
  Default,
  Unique,
  Index,
} from 'sequelize-typescript';
import { Store } from './store.entity';
import { User } from './user.entity';
import { SaleItem } from './sale-item.entity';
import { Payment } from './payment.entity';

export enum SaleStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Table({ tableName: 'sales', timestamps: true })
export class Sale extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @Index
  @ForeignKey(() => Store)
  @Column({ type: DataType.UUID, allowNull: false })
  storeId: string;

  @BelongsTo(() => Store, { foreignKey: 'storeId', onDelete: 'CASCADE' })
  store: Store;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: true })
  createdById: string;

  @BelongsTo(() => User, { foreignKey: 'createdById', onDelete: 'SET NULL' })
  createdBy: User;

  @HasMany(() => SaleItem, { foreignKey: 'saleId' })
  items: SaleItem[];

  @HasOne(() => Payment, { foreignKey: 'saleId' })
  payment: Payment;

  // Total stored in cents
  @Default(0)
  @Column({ type: DataType.BIGINT, allowNull: false })
  totalCents: number;

  @Default(SaleStatus.PENDING)
  @Column({
    type: DataType.ENUM(...Object.values(SaleStatus)),
    allowNull: false,
  })
  status: SaleStatus;

  // Idempotency key sent by POS terminal to prevent duplicate sales
  @Unique
  @Index
  @Column({ type: DataType.STRING, allowNull: false })
  idempotencyKey: string;

  @Column({ type: DataType.STRING, allowNull: true })
  notes: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}
