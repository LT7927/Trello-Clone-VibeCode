import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from './AppError';
import {
  DEFAULT_ACTIVITY_LIMIT,
  MAX_ACTIVITY_LIMIT,
  encodeActivityCursor,
  parseActivityCursor,
  parseActivityLimit,
} from './activityCursor';

const ID = '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c';

function assertBadRequest(fn: () => unknown, field: string) {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof AppError);
    assert.equal(err.statusCode, 400);
    assert.deepEqual(err.details, { field });
    return true;
  });
}

test('Cursor: encode -> parse giữ nguyên (createdAt, id), kể cả mili giây', () => {
  const createdAt = new Date('2026-11-23T08:15:30.123Z');
  const cursor = encodeActivityCursor({ createdAt, id: ID });
  assert.match(cursor, /^[A-Za-z0-9_-]+$/); // base64url, an toàn trên query string
  assert.deepEqual(parseActivityCursor(cursor), { createdAt, id: ID });
});

test('Cursor: không gửi -> undefined (trang đầu)', () => {
  assert.equal(parseActivityCursor(undefined), undefined);
});

test('Cursor: sai định dạng -> 400', () => {
  const bad = [
    '',
    'khong-phai-base64',
    ['a', 'b'],
    Buffer.from('null').toString('base64url'),
    Buffer.from(JSON.stringify({ t: 'abc', id: ID })).toString('base64url'),
    Buffer.from(JSON.stringify({ t: new Date().toISOString(), id: 'x' })).toString('base64url'),
  ];
  for (const value of bad) assertBadRequest(() => parseActivityCursor(value), 'before');
});

test('Limit: mặc định và giá trị hợp lệ', () => {
  assert.equal(parseActivityLimit(undefined), DEFAULT_ACTIVITY_LIMIT);
  assert.equal(parseActivityLimit('1'), 1);
  assert.equal(parseActivityLimit(String(MAX_ACTIVITY_LIMIT)), MAX_ACTIVITY_LIMIT);
});

test('Limit: không phải số nguyên dương hoặc vượt tối đa -> 400', () => {
  for (const value of ['0', '-5', '1.5', 'abc', '', '51', ['10', '20']]) {
    assertBadRequest(() => parseActivityLimit(value), 'limit');
  }
});
