import { Router } from 'express';
import { authenticate } from '../../middlewares/auth/authenticate.middleware.js';
import { authorize } from '../../middlewares/auth/authorize.middleware.js';
import * as controller from '../../controllers/solicitud-alta/controller.js';
const router = Router();
router.post('/', controller.submit);
router.get('/mi-solicitud', controller.own);
router.use(authenticate, authorize('Administrador'));
router.get('/', controller.list);
router.get('/:id', controller.detail);
router.post('/:id/resolucion', controller.resolve);
export default router;
//# sourceMappingURL=routes.js.map