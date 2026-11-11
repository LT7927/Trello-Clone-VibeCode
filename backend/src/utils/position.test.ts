import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_POSITION_GAP,
  POSITION_GAP,
  calcPosition,
  needsRebalance,
  rebalancePositions,
} from './position';

test('calcPosition: danh sách rỗng -> POSITION_GAP', () => {
  assert.equal(calcPosition(null, null), POSITION_GAP);
});

test('calcPosition: thêm cuối -> prev + GAP', () => {
  assert.equal(calcPosition(131072, null), 131072 + POSITION_GAP);
});

test('calcPosition: thêm đầu -> next / 2', () => {
  assert.equal(calcPosition(null, 65536), 32768);
});

test('calcPosition: chèn giữa -> trung bình cộng', () => {
  assert.equal(calcPosition(65536, 131072), 98304);
});

test('needsRebalance: đủ khoảng cách -> false', () => {
  assert.equal(needsRebalance(null, null), false);
  assert.equal(needsRebalance(100, null), false);
  assert.equal(needsRebalance(1, 2), false);
});

test('needsRebalance: khoảng cách quá nhỏ / trùng / sai thứ tự -> true', () => {
  assert.equal(needsRebalance(1, 1 + MIN_POSITION_GAP / 2), true);
  assert.equal(needsRebalance(5, 5), true);
  assert.equal(needsRebalance(10, 5), true);
  assert.equal(needsRebalance(null, MIN_POSITION_GAP), true);
});

test('calcPosition ném lỗi khi cần rebalance', () => {
  assert.throws(() => calcPosition(5, 5), /rebalance/);
});

test('Chèn liên tục vào cùng một chỗ: cạn khoảng cách sau ~30+ lần, needsRebalance bắt được', () => {
  let prev = POSITION_GAP;
  let next = 2 * POSITION_GAP;
  let inserts = 0;
  while (!needsRebalance(prev, next)) {
    const mid = calcPosition(prev, next);
    assert.ok(mid > prev && mid < next, 'position mới phải nằm giữa prev và next');
    next = mid; // luôn chèn sát ngay sau prev
    inserts++;
  }
  assert.ok(inserts >= 30, `chỉ chèn được ${inserts} lần`);
});

test('rebalancePositions: đánh số lại GAP, 2*GAP, ...', () => {
  assert.deepEqual(rebalancePositions(['a', 'b', 'c']), [
    { id: 'a', position: POSITION_GAP },
    { id: 'b', position: 2 * POSITION_GAP },
    { id: 'c', position: 3 * POSITION_GAP },
  ]);
});
