import { Router } from "express";

import { loginController } from "../../controllers/auth/controller.js";
import { registroController } from "../../controllers/auth/registro.controller.js";
import { getMeController } from "../../controllers/auth/me.controller.js";
import { authenticate } from "../../middlewares/auth/authenticate.middleware.js";
import { googleLoginController } from "../../controllers/auth/oauth.controller.js";
import { googleCallbackController } from "../../controllers/auth/oauth.controller.js";
import { loginRateLimit } from "../../middlewares/auth/login-rate-limit.middleware.js";
import { registroRateLimit } from "../../middlewares/auth/registro-rate-limit.middleware.js";

import { refreshController, logoutController } from "../../controllers/auth/session.controller.js";
import { checkAuthOrigin, requireSessionHeader } from "../../middlewares/auth/session-origin.middleware.js";

const router = Router();

router.post("/login", checkAuthOrigin, loginRateLimit, loginController);
router.post("/registro", checkAuthOrigin, registroRateLimit,  registroController);
router.post("/refresh", checkAuthOrigin, requireSessionHeader, refreshController);
router.post("/logout", checkAuthOrigin, requireSessionHeader, logoutController);
router.get("/google/login", googleLoginController);
router.get("/google/callback", googleCallbackController);

router.get("/me", authenticate, getMeController);

export default router;
