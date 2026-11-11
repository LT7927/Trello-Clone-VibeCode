import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
} from 'sequelize';
import { sequelize } from '../config/database';
import type { List } from './list.model';
import type { Tag } from './tag.model';
import type { ActivityLog } from './activityLog.model';

export class Card extends Model<InferAttributes<Card>, InferCreationAttributes<Card>> {
  declare id: CreationOptional<string>;
  /** Kéo card sang list khác = cập nhật listId + position */
  declare listId: string;
  declare title: string;
  declare description: CreationOptional<string | null>;
  /** Thứ tự trong list. Dùng số thực để chèn vào giữa: (prev + next) / 2 */
  declare position: number;
  declare dueDate: CreationOptional<Date | null>;
  declare isCompleted: CreationOptional<boolean>;
  declare isArchived: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare list?: NonAttribute<List>;
  declare tags?: NonAttribute<Tag[]>;
  declare activities?: NonAttribute<ActivityLog[]>;
}

Card.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    listId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: false,
      validate: { notEmpty: true },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    position: {
      type: DataTypes.DOUBLE,
      allowNull: false,
    },
    dueDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    isCompleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    isArchived: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    modelName: 'Card',
    tableName: 'cards',
    indexes: [{ name: 'cards_list_id_position_idx', fields: ['list_id', 'position'] }],
  },
);
