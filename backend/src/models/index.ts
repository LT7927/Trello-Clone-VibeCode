import { sequelize } from '../config/database';
import { Board } from './board.model';
import { List } from './list.model';
import { Card } from './card.model';
import { Tag } from './tag.model';
import { CardTag } from './cardTag.model';
import { ActivityLog } from './activityLog.model';

/*
 * Khai báo toàn bộ associations tại một chỗ để tránh circular import.
 * foreignKey + onDelete được khai báo giống nhau ở cả 2 phía của mỗi quan hệ.
 */

// Board 1 - N List
Board.hasMany(List, { foreignKey: 'boardId', as: 'lists', onDelete: 'CASCADE' });
List.belongsTo(Board, { foreignKey: 'boardId', as: 'board', onDelete: 'CASCADE' });

// List 1 - N Card
List.hasMany(Card, { foreignKey: 'listId', as: 'cards', onDelete: 'CASCADE' });
Card.belongsTo(List, { foreignKey: 'listId', as: 'list', onDelete: 'CASCADE' });

// Board 1 - N Tag
Board.hasMany(Tag, { foreignKey: 'boardId', as: 'tags', onDelete: 'CASCADE' });
Tag.belongsTo(Board, { foreignKey: 'boardId', as: 'board', onDelete: 'CASCADE' });

// Card N - N Tag (qua card_tags)
Card.belongsToMany(Tag, {
  through: CardTag,
  foreignKey: 'cardId',
  otherKey: 'tagId',
  as: 'tags',
  onDelete: 'CASCADE',
});
Tag.belongsToMany(Card, {
  through: CardTag,
  foreignKey: 'tagId',
  otherKey: 'cardId',
  as: 'cards',
  onDelete: 'CASCADE',
});

// Board 1 - N ActivityLog
Board.hasMany(ActivityLog, { foreignKey: 'boardId', as: 'activities', onDelete: 'CASCADE' });
ActivityLog.belongsTo(Board, { foreignKey: 'boardId', as: 'board', onDelete: 'CASCADE' });

// Card 1 - N ActivityLog (xoá card -> giữ log, card_id = NULL)
Card.hasMany(ActivityLog, { foreignKey: 'cardId', as: 'activities', onDelete: 'SET NULL' });
ActivityLog.belongsTo(Card, { foreignKey: 'cardId', as: 'card', onDelete: 'SET NULL' });

export { sequelize, Board, List, Card, Tag, CardTag, ActivityLog };
