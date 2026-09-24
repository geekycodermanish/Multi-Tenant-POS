import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  PrimaryKey,
  Default,
  Index,
} from 'sequelize-typescript';

/**
 * Tracks idempotency keys so a POS terminal retry does not create a second sale.
 * The saleId is stored once the original request completes, so retries return the same result.
 */
@Table({
  tableName: 'idempotency_keys',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['key', 'storeId'], name: 'UQ_idempotency_key_store' },
  ],
})
export class IdempotencyKey extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @Column({ type: DataType.STRING, allowNull: false })
  key: string;

  @Column({ type: DataType.STRING, allowNull: false })
  storeId: string;

  // The sale that was created for this key
  @Column({ type: DataType.UUID, allowNull: true })
  saleId: string;

  // Serialized response so retries get identical output
  @Column({ type: DataType.JSONB, allowNull: true })
  responseBody: Record<string, unknown>;

  @CreatedAt
  createdAt: Date;
}
