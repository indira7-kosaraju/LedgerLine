const onboardingService = require('../services/onboarding.service');
const requestContext = require('../utils/requestContext');

async function get(req, res) {
  res.status(200).json({ onboarding: await onboardingService.getOnboarding(req.user.id) });
}

async function submit(req, res) {
  res.status(200).json(await onboardingService.submitOnboarding(req.user.id, req.body, requestContext(req)));
}

module.exports = { get, submit };
