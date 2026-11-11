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

export class Board extends Model<InferAttributes<Board>, InferCreationAttributes<Board>> {
  declare id: CreationOptional<string>;
  declare title: string;
  declare description: CreationOptional<string | null>;
  declare background: CreationOptional<string | null>;
  declare isArchived: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Associations (chỉ có khi include)
  declare lists?: NonAttribute<List[]>;
  declare tags?: NonAttribute<Tag[]>;
  declare activities?: NonAttribute<ActivityLog[]>;
}

Board.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: { notEmpty: true },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    background: {
      type: DataTypes.STRING(255),
      allowNull: true,
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
    modelName: 'Board',
    tableName: 'boards',
  },
);
