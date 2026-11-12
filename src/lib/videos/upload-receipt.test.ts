import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createUploadReceipt, verifyUploadReceipt } from "./upload-receipt.ts";

const secret = "test-secret-only";
const now = 1_700_000_000_000;

test("un comprobante es válido solo para la cuenta y archivo emitidos", () => {
  const receipt = createUploadReceipt("usuario", "archivo.mp4", secret, now);
  assert.equal(verifyUploadReceipt(receipt, "usuario", "archivo.mp4", secret, now), true);
  assert.equal(verifyUploadReceipt(receipt, "otro", "archivo.mp4", secret, now), false);
  assert.equal(verifyUploadReceipt(receipt, "usuario", "otro.mp4", secret, now), false);
  assert.equal(verifyUploadReceipt(receipt, "usuario", "archivo.mp4", "otra", now), false);
});

test("rechaza comprobantes vencidos, alterados o inválidos", () => {
  const receipt = createUploadReceipt("u", "a.mp4", secret, now);
  assert.equal(verifyUploadReceipt(receipt, "u", "a.mp4", secret, now + 4 * 60 * 60 * 1000 + 1), false);
  assert.equal(verifyUploadReceipt(`${receipt}x`, "u", "a.mp4", secret, now), false);
  assert.equal(verifyUploadReceipt("invalid", "u", "a.mp4", secret, now), false);
});
