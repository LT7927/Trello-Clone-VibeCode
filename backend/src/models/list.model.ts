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

export class List extends Model<InferAttributes<List>, InferCreationAttributes<List>> {
  declare id: CreationOptional<string>;
  declare boardId: string;
  declare title: string;
  /** Thứ tự trong board. Dùng số thực để chèn vào giữa: (prev + next) / 2 */
  declare position: number;
  declare isArchived: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare board?: NonAttribute<Board>;
  declare cards?: NonAttribute<Card[]>;
}

List.init(
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
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: { notEmpty: true },
    },
    position: {
      type: DataTypes.DOUBLE,
      allowNull: false,
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
    modelName: 'List',
    tableName: 'lists',
    indexes: [{ name: 'lists_board_id_position_idx', fields: ['board_id', 'position'] }],
  },
);
