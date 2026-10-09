import { Router } from "express";

import { loginController } from "../../controllers/auth/controller.js";
import { getMeController } from "../../controllers/auth/me.controller.js";
import { authenticate } from "../../middlewares/auth/authenticate.middleware.js";
import { googleLoginController } from "../../controllers/auth/oauth.controller.js";
import { googleCallbackController } from "../../controllers/auth/oauth.controller.js";

import { refreshController, logoutController } from "../../controllers/auth/session.controller.js";
import { checkAuthOrigin, requireSessionHeader } from "../../middlewares/auth/session-origin.middleware.js";

const router = Router();

router.post("/login", checkAuthOrigin, loginController);
router.post("/refresh", checkAuthOrigin, requireSessionHeader, refreshController);
router.post("/logout", checkAuthOrigin, requireSessionHeader, logoutController);
router.get("/google/login", googleLoginController);
router.get("/google/callback", googleCallbackController);

router.get("/me", authenticate, getMeController);

export default router;