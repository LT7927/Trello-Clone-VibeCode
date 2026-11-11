import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { UniqueConstraintError, ValidationError, ValidationErrorItem } from 'sequelize';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { ensureBody, nullableUuid, optionalString, requiredString } from '../utils/validators';
import { errorHandler, notFoundHandler } from './errorHandler';
import { validateUuidParams } from './validateUuidParams';

/** Typings của Sequelize đòi đủ 8 tham số; test chỉ cần path + message */
function errorItem(path: string, message: string): ValidationErrorItem {
  return Object.assign(Object.create(ValidationErrorItem.prototype), { path, message });
}

const VALID_UUID ='3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c';
let server: Server;
let baseUrl: string;

before(async () => {
  const app = express();
  app.use(express.json());

  app.get('/ok/:id', validateUuidParams('id'), (req, res) => {
    sendSuccess(res, { id: req.params.id }, 'OK');
  });
  app.get(
    '/app-error',
    asyncHandler(async () => {
      throw AppError.notFound('Không tìm thấy board');
    }),
  );
  app.get(
    '/unique',
    asyncHandler(async () => {
      throw new UniqueConstraintError({
        errors: [errorItem('name', 'trùng')],
      });
    }),
  );
  app.get(
    '/validation',
    asyncHandler(async () => {
      throw new ValidationError('bad', [errorItem('title', 'title rỗng')]);
    }),
  );
  app.get(
    '/crash',
    asyncHandler(async () => {
      throw new Error('boom');
    }),
  );
  app.post(
    '/echo',
    asyncHandler(async (req, res) => {
      const body = ensureBody(req.body);
      sendSuccess(res, {
        title: requiredString(body, 'title', 10),
        description: optionalString(body, 'description', 100, { nullable: true }),
        prevId: nullableUuid(body, 'prevId'),
      });
    }),
  );
  app.use(notFoundHandler);
  app.use(errorHandler);

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

async function call(path: string, init?: RequestInit) {
  const res = await fetch(baseUrl + path, init);
  return { status: res.status, body: (await res.json()) as { success: boolean; data: unknown; message: string } };
}

const postJson = (body: string): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body,
});

test('UUID hợp lệ -> 200 đúng chuẩn response', async () => {
  const { status, body } = await call(`/ok/${VALID_UUID}`);
  assert.equal(status, 200);
  assert.deepEqual(body, { success: true, data: { id: VALID_UUID }, message: 'OK' });
});

test('UUID sai -> 400', async () => {
  const { status, body } = await call('/ok/abc');
  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.deepEqual(body.data, { field: 'id' });
});

test('AppError -> đúng status và message', async () => {
  const { status, body } = await call('/app-error');
  assert.equal(status, 404);
  assert.deepEqual(body, { success: false, data: null, message: 'Không tìm thấy board' });
});

test('UniqueConstraintError -> 409', async () => {
  const { status, body } = await call('/unique');
  assert.equal(status, 409);
  assert.deepEqual(body.data, { fields: ['name'] });
});

test('Sequelize ValidationError -> 400 kèm danh sách lỗi', async () => {
  const { status, body } = await call('/validation');
  assert.equal(status, 400);
  assert.deepEqual(body.data, { errors: [{ field: 'title', message: 'title rỗng' }] });
});

test('Lỗi không lường trước -> 500, vẫn đúng chuẩn response', async () => {
  const original = console.error;
  console.error = () => {}; // tắt log lỗi cố ý trong test
  try {
    const { status, body } = await call('/crash');
    assert.equal(status, 500);
    assert.equal(body.success, false);
    assert.equal(body.data, null);
  } finally {
    console.error = original;
  }
});

test('Route không tồn tại -> 404', async () => {
  const { status, body } = await call('/khong-co');
  assert.equal(status, 404);
  assert.equal(body.success, false);
});

test('JSON sai cú pháp -> 400', async () => {
  const { status, body } = await call('/echo', postJson('{ title: '));
  assert.equal(status, 400);
  assert.equal(body.message, 'Body JSON không hợp lệ');
});

test('Validators: hợp lệ -> trim + chuẩn hoá', async () => {
  const { status, body } = await call(
    '/echo',
    postJson(JSON.stringify({ title: '  Todo  ', description: '   ', prevId: null })),
  );
  assert.equal(status, 200);
  assert.deepEqual(body.data, { title: 'Todo', description: null, prevId: null });
});

test('Validators: thiếu title / quá dài / prevId sai -> 400', async () => {
  for (const payload of [{}, { title: 'quá dài hơn mười ký tự' }, { title: 'ok', prevId: 'x' }]) {
    const { status, body } = await call('/echo', postJson(JSON.stringify(payload)));
    assert.equal(status, 400, JSON.stringify(payload));
    assert.equal(body.success, false);
  }
});
