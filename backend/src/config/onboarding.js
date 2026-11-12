// Onboarding rules (step 4) – one place for the API, the schema and GET /api/onboarding (which the frontend
// reads, so its form can never drift from the rules the server applies).

// Raise this whenever the terms text in the frontend changes: users must then accept the new version.
const TERMS_VERSION = '2026-11-12';

const MINIMUM_AGE = 18;
const MAXIMUM_AGE = 120;

// The 28 states and 8 union territories of India.
const INDIAN_STATES = Object.freeze([
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
]);

// Must match the Occupation enum in prisma/schema.prisma.
const OCCUPATIONS = Object.freeze(['SALARIED', 'SELF_EMPLOYED', 'BUSINESS_OWNER', 'STUDENT', 'HOMEMAKER', 'RETIRED', 'OTHER']);

module.exports = { TERMS_VERSION, MINIMUM_AGE, MAXIMUM_AGE, INDIAN_STATES, OCCUPATIONS };
