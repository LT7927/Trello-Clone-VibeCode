import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Bảng trung gian N-N giữa Card và Tag. PK ghép (card_id, tag_id) chống gắn trùng.
 * Lưu ý: ràng buộc "card và tag phải cùng board" được kiểm tra ở tầng Controller.
 */
export class CardTag extends Model<InferAttributes<CardTag>, InferCreationAttributes<CardTag>> {
  declare cardId: string;
  declare tagId: string;
  declare createdAt: CreationOptional<Date>;
}

CardTag.init(
  {
    cardId: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
    },
    tagId: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
    },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    modelName: 'CardTag',
    tableName: 'card_tags',
    updatedAt: false,
  },
);
