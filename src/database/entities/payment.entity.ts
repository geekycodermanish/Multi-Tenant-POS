import {
  Table,
  Column,
  Model,
  DataType,
  BelongsTo,
  ForeignKey,
  CreatedAt,
  PrimaryKey,
  Default,
  Unique,
} from 'sequelize-typescript';
import { Sale } from './sale.entity';

export enum PaymentStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
}

export enum PaymentMethod {
  CASH = 'cash',
  CARD = 'card',
  UPI = 'upi',
}

@Table({ tableName: 'payments', timestamps: false })
export class Payment extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @Unique
  @ForeignKey(() => Sale)
  @Column({ type: DataType.UUID, allowNull: false })
  saleId: string;

  @BelongsTo(() => Sale, { foreignKey: 'saleId', onDelete: 'CASCADE' })
  sale: Sale;

  @Column({ type: DataType.BIGINT, allowNull: false })
  amountCents: number;

  @Default(PaymentMethod.CASH)
  @Column({
    type: DataType.ENUM(...Object.values(PaymentMethod)),
    allowNull: false,
  })
  method: PaymentMethod;

  @Default(PaymentStatus.PENDING)
  @Column({
    type: DataType.ENUM(...Object.values(PaymentStatus)),
    allowNull: false,
  })
  status: PaymentStatus;

  // Reference returned by mock payment provider
  @Column({ type: DataType.STRING, allowNull: true })
  providerReference: string;

  @Column({ type: DataType.STRING, allowNull: true })
  failureReason: string;

  @CreatedAt
  createdAt: Date;
}
