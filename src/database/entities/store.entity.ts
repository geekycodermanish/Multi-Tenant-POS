import {
  Table,
  Column,
  Model,
  DataType,
  BelongsTo,
  HasMany,
  ForeignKey,
  CreatedAt,
  UpdatedAt,
  PrimaryKey,
  Default,
  Index,
} from 'sequelize-typescript';
import { Merchant } from './merchant.entity';
import { User } from './user.entity';
import { Product } from './product.entity';
import { Inventory } from './inventory.entity';
import { Sale } from './sale.entity';

@Table({ tableName: 'stores', timestamps: true })
export class Store extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @Column({ type: DataType.STRING, allowNull: false })
  name: string;

  @Column({ type: DataType.STRING, allowNull: true })
  address: string;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  isActive: boolean;

  @Index
  @ForeignKey(() => Merchant)
  @Column({ type: DataType.UUID, allowNull: false })
  merchantId: string;

  @BelongsTo(() => Merchant, { foreignKey: 'merchantId', onDelete: 'CASCADE' })
  merchant: Merchant;

  @HasMany(() => User)
  users: User[];

  @HasMany(() => Product)
  products: Product[];

  @HasMany(() => Inventory)
  inventories: Inventory[];

  @HasMany(() => Sale)
  sales: Sale[];

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}
