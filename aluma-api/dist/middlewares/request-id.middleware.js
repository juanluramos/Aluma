import { randomUUID } from "node:crypto";
export function requestId(req, res, next) {
    req.requestId = randomUUID();
    res.setHeader("X-Request-ID", req.requestId);
    next();
}
//# sourceMappingURL=request-id.middleware.js.map