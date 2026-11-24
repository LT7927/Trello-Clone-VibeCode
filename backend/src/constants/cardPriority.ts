/**
 * Mức độ ưu tiên của card.
 * Tách riêng khỏi card.model.ts để validators / test import được mà không khởi tạo Sequelize.
 */
export const CARD_PRIORITIES = ['low', 'medium', 'high'] as const;
export type CardPriority = (typeof CARD_PRIORITIES)[number];
export const DEFAULT_CARD_PRIORITY: CardPriority = 'medium';
