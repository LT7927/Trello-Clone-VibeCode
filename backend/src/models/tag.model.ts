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

export class Tag extends Model<InferAttributes<Tag>, InferCreationAttributes<Tag>> {
  declare id: CreationOptional<string>;
  declare boardId: string;
  declare name: string;
  /** Mã màu hex, ví dụ #61BD4F */
  declare color: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare board?: NonAttribute<Board>;
  declare cards?: NonAttribute<Card[]>;
}

Tag.init(
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
    name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: { notEmpty: true },
    },
    color: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: { is: /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/ },
    },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    modelName: 'Tag',
    tableName: 'tags',
    indexes: [{ name: 'tags_board_id_name_unique', unique: true, fields: ['board_id', 'name'] }],
  },
);
