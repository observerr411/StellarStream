import type { NextFunction, Request, Response, RequestHandler } from "express";
import { type ZodType, ZodError } from "zod";

type RequestSchemas = {
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
};

const validateRequest = (schemas: RequestSchemas): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schemas.params) {
        const parsed = schemas.params.parse(req.params);
        req.params = parsed as typeof req.params;
      }

      if (schemas.query) {
        const parsed = schemas.query.parse(req.query);
        req.query = parsed as typeof req.query;
      }

      if (schemas.body) {
        const parsed = schemas.body.parse(req.body);
        req.body = parsed;
      }

      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          success: false,
          code: "ERR_REQUEST_VALIDATION_FAILED",
          error: "Request validation failed",
          details: err.issues,
        });
        return;
      }

      next(err);
    }
  };
};

export default validateRequest;
