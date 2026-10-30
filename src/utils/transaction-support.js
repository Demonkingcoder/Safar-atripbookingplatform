import { ApiError } from "./api-error.js";

let transactionsAvailable;

export async function detectTransactionSupport(connection) {
  const hello = await connection.db.admin().command({ hello: 1 });
  transactionsAvailable = Boolean(hello.setName || hello.msg === "isdbgrid");
  return transactionsAvailable;
}

export function areTransactionsAvailable() {
  return transactionsAvailable;
}

export function requireTransactionSupport() {
  if (transactionsAvailable === false) {
    throw new ApiError(503, "Booking inventory changes require MongoDB replica set or sharded-cluster transaction support. No booking state or seat inventory was changed.");
  }
}

export function isTransactionUnsupported(error) {
  return [20, 303].includes(error?.code)
    || /transaction numbers are only allowed|transactions? (?:are )?not supported|replica set member or mongos/i.test(error?.message || "");
}

export function transactionUnavailableError(error) {
  if (!isTransactionUnsupported(error)) return error;
  return new ApiError(503, "Booking inventory changes require MongoDB replica set or sharded-cluster transaction support. No booking state or seat inventory was changed.");
}