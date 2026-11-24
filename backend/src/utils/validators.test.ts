import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from './AppError';
import { optionalPriority } from './validators';

test('optionalPriority: không gửi -> undefined', () => {
  assert.equal(optionalPriority({}, 'priority'), undefined);
});

test('optionalPriority: chấp nhận low / medium / high', () => {
  for (const value of ['low', 'medium', 'high']) {
    assert.equal(optionalPriority({ priority: value }, 'priority'), value);
  }
});

test('optionalPriority: giá trị sai -> AppError 400', () => {
  for (const value of ['urgent', 'HIGH', '', null, 1, true]) {
    assert.throws(
      () => optionalPriority({ priority: value }, 'priority'),
      (err: unknown) =>
        err instanceof AppError && err.statusCode === 400,
    );
  }
});
