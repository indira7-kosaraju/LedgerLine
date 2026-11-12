const { Router } = require('express');

const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { submitOnboardingSchema } = require('../utils/schemas/onboarding.schemas');
const onboardingController = require('../controllers/onboarding.controller');

const router = Router();

router.use(authenticate);

// Account holders only: their own onboarding status/profile, and submitting it (approved automatically).
router.get('/', requirePermission('onboarding:own'), onboardingController.get);
router.post('/', requirePermission('onboarding:own'), validate(submitOnboardingSchema, 'body', { auditAction: 'ONBOARDING_COMPLETE' }), onboardingController.submit);

module.exports = router;
