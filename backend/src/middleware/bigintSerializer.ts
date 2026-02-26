import { Request, Response, NextFunction } from "express";

/**
 * JSON replacer that converts BigInt values to strings.
 *
 * JavaScript's native `JSON.stringify` throws a `TypeError` when it encounters
 * a BigInt value.  Stellar/Soroban amounts and Prisma BigInt columns produce
 * values of type `bigint`, so every `res.json()` call is at risk of crashing
 * the process.
 *
 * By converting BigInt → string we preserve precision (no floating-point
 * truncation) and keep the response JSON-safe.
 */
function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

/**
 * Express middleware that patches `res.json()` so that BigInt values are
 * automatically serialised as strings instead of throwing.
 *
 * Register this middleware **before** any route handlers:
 *
 * ```ts
 * app.use(bigintSerializer);
 * ```
 */
export function bigintSerializer(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  const originalJson = res.json.bind(res);

  res.json = function (body?: unknown): Response {
    const safe = JSON.parse(JSON.stringify(body, bigintReplacer));
    return originalJson(safe);
  };

  next();
}

export { bigintReplacer };
