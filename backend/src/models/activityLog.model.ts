import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
} from 'sequelize';
import { sequelize } from '../config/database';
import type { Board } from './board.model';
import type { Card } from './card.model';

export const ENTITY_TYPES = ['board', 'list', 'card', 'tag'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export class ActivityLog extends Model<
  InferAttributes<ActivityLog>,
  InferCreationAttributes<ActivityLog>
> {
  declare id: CreationOptional<string>;
  declare boardId: string;
  /** SET NULL khi card bị xoá để log vẫn được giữ lại */
  declare cardId: CreationOptional<string | null>;
  declare entityType: EntityType;
  /** Id của đối tượng bị tác động (đa hình, không có FK) */
  declare entityId: string;
  /** Ví dụ: CARD_CREATED, CARD_MOVED, LIST_RENAMED, TAG_ADDED */
  declare action: string;
  /** Ví dụ: { fromListId, toListId, cardTitle, oldTitle, newTitle } */
  declare metadata: CreationOptional<Record<string, unknown> | null>;
  declare createdAt: CreationOptional<Date>;

  declare board?: NonAttribute<Board>;
  declare card?: NonAttribute<Card | null>;
}

ActivityLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    boardId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    cardId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    entityType: {
      type: DataTypes.ENUM(...ENTITY_TYPES),
      allowNull: false,
    },
    entityId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    action: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    modelName: 'ActivityLog',
    tableName: 'activity_logs',
    updatedAt: false,
    indexes: [
      {
        name: 'activity_logs_board_id_created_at_idx',
        // Khớp thứ tự phân trang cursor (created_at DESC, id DESC)
        fields: ['board_id', { name: 'created_at', order: 'DESC' }, { name: 'id', order: 'DESC' }],
      },
    ],
  },
);
