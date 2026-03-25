import { Request, Response, NextFunction } from "express";
import { translateErrorMessage } from "../i18n/error-localization.js";

export function responseWrapper(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  const originalJson = res.json;

  res.json = function (body: unknown) {
    const responseBody = body as Record<string, unknown> | null;
    const code =
      typeof responseBody?.code === "string" ? responseBody.code : undefined;
    const fallbackError =
      typeof responseBody?.error === "string"
        ? responseBody.error
        : typeof responseBody?.message === "string"
        ? responseBody.message
        : "An error occurred";

    // Prevent double wrapping, but still localize wrapped errors.
    if (
      responseBody &&
      typeof responseBody === "object" &&
      "success" in responseBody &&
      "data" in responseBody
    ) {
      if (responseBody.success !== false) {
        return originalJson.call(this, responseBody);
      }

      return originalJson.call(this, {
        ...responseBody,
        error: translateErrorMessage(
          code,
          _req.headers["accept-language"],
          fallbackError,
        ),
      });
    }

    // Construct standardized response format
    const isSuccess = res.statusCode >= 200 && res.statusCode < 300;
    const localizedError = !isSuccess
      ? translateErrorMessage(
          code,
          _req.headers["accept-language"],
          fallbackError,
        )
      : null;

    const wrappedBody = {
      success: isSuccess,
      data: isSuccess ? body : null,
      error: localizedError,
      ...(code ? { code } : {}),
      ...(responseBody?.details !== undefined
        ? { details: responseBody.details }
        : {}),
    };

    return originalJson.call(this, wrappedBody);
  };

  next();
}
