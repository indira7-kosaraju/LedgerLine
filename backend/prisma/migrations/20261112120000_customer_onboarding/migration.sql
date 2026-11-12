-- ═══════════════════════════════════════════════════════════════════
-- Step 4 – customer onboarding.
-- Self-registered account holders start at PENDING_PROFILE and are approved automatically once they
-- submit a valid (demo) profile and accept the current terms. Until then they cannot open accounts –
-- enforced by the API AND by the triggers below, so a bug in the API cannot skip onboarding.
-- Only ADDS things: existing users, accounts and history are untouched (existing users become APPROVED).
-- ═══════════════════════════════════════════════════════════════════

CREATE TYPE "OnboardingStatus" AS ENUM ('PENDING_PROFILE', 'APPROVED');
CREATE TYPE "Occupation" AS ENUM ('SALARIED', 'SELF_EMPLOYED', 'BUSINESS_OWNER', 'STUDENT', 'HOMEMAKER', 'RETIRED', 'OTHER');

ALTER TABLE "users" ADD COLUMN "onboardedAt" TIMESTAMP(3),
ADD COLUMN "onboardingStatus" "OnboardingStatus" NOT NULL DEFAULT 'PENDING_PROFILE',
ADD COLUMN "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN "termsVersion" TEXT;

-- ── 1. Everyone who existed before onboarding keeps working: demo users, earlier sign-ups, staff. ──
UPDATE "users" SET "onboardingStatus" = 'APPROVED', "onboardedAt" = "createdAt";

-- ── 2. The profile (demo data only). Formats are also checked here, not only in the API. ──
CREATE TABLE "customer_profiles" (
    "userId" UUID NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pinCode" TEXT NOT NULL,
    "occupation" "Occupation" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "customer_profiles_phone_format" CHECK ("phone" ~ '^\+91[6-9][0-9]{9}$'),
    CONSTRAINT "customer_profiles_pin_format" CHECK ("pinCode" ~ '^[1-9][0-9]{5}$')
);

ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 3. APPROVED always has a date, and only APPROVED has one. ──
ALTER TABLE "users" ADD CONSTRAINT "users_onboarding_consistent"
  CHECK (("onboardingStatus" = 'APPROVED') = ("onboardedAt" IS NOT NULL));

-- ── 4. An account holder can only BECOME approved with a profile and accepted terms. ──
--       (Fires on the status change only, so existing approved users and other updates are not affected.)
CREATE OR REPLACE FUNCTION users_onboarding_requires_profile() RETURNS trigger AS $$
BEGIN
  IF NEW.role = 'ACCOUNT_HOLDER' AND NEW."onboardingStatus" = 'APPROVED'
     AND (TG_OP = 'INSERT' OR OLD."onboardingStatus" IS DISTINCT FROM NEW."onboardingStatus") THEN
    IF NEW."termsAcceptedAt" IS NULL OR NEW."termsVersion" IS NULL
       OR NOT EXISTS (SELECT 1 FROM "customer_profiles" p WHERE p."userId" = NEW.id) THEN
      RAISE EXCEPTION 'Account holder % cannot be approved without a profile and accepted terms', NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "users_onboarding_requires_profile"
  BEFORE INSERT OR UPDATE OF "onboardingStatus" ON "users"
  FOR EACH ROW EXECUTE FUNCTION users_onboarding_requires_profile();

-- ── 5. No customer account for an owner who has not finished onboarding. ──
CREATE OR REPLACE FUNCTION accounts_owner_onboarded() RETURNS trigger AS $$
BEGIN
  IF NEW.type = 'CUSTOMER' AND NOT EXISTS (
       SELECT 1 FROM "users" u WHERE u.id = NEW."ownerId" AND u."onboardingStatus" = 'APPROVED') THEN
    RAISE EXCEPTION 'Owner % has not completed onboarding: customer accounts cannot be opened', NEW."ownerId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "accounts_owner_onboarded"
  BEFORE INSERT ON "accounts"
  FOR EACH ROW EXECUTE FUNCTION accounts_owner_onboarded();
