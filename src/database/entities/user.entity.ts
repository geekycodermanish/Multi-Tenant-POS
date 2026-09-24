import {
  Table,
  Column,
  Model,
  DataType,
  BelongsTo,
  ForeignKey,
  CreatedAt,
  UpdatedAt,
  PrimaryKey,
  Default,
  Unique,
  Index,
} from 'sequelize-typescript';
import { Merchant } from './merchant.entity';
import { Store } from './store.entity';

export enum UserRole {
  MERCHANT_ADMIN = 'merchant_admin', // manages all stores under a merchant
  STORE_STAFF = 'store_staff',       // operates POS in a single store
}

@Table({ tableName: 'users', timestamps: true })
export class User extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @Column({ type: DataType.STRING, allowNull: false })
  name: string;

  @Unique
  @Index
  @Column({ type: DataType.STRING, allowNull: false })
  email: string;

  @Column({ type: DataType.STRING, allowNull: false })
  password: string;

  @Default(UserRole.STORE_STAFF)
  @Column({
    type: DataType.ENUM(...Object.values(UserRole)),
    allowNull: false,
  })
  role: UserRole;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  isActive: boolean;

  @Index
  @ForeignKey(() => Merchant)
  @Column({ type: DataType.UUID, allowNull: false })
  merchantId: string;

  @BelongsTo(() => Merchant, { foreignKey: 'merchantId', onDelete: 'CASCADE' })
  merchant: Merchant;

  @Index
  @ForeignKey(() => Store)
  @Column({ type: DataType.UUID, allowNull: true })
  storeId: string;

  @BelongsTo(() => Store, { foreignKey: 'storeId', onDelete: 'SET NULL' })
  store: Store;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}
