// Evaluation & demo personas shown on the sign-in page.
//
// Each card's `email` is an existing public demo user created by backend/prisma/seed-demo.js and listed in README.md
// ("Demo credentials"). The card names are the demo users' real names, so they match the name shown after signing in.
//
// Deliberately NO passwords here – the visitor types the password, and normal sign-in security
// (rate limits, account lockout) applies. The administrator has no public login: the public demo admin is
// disabled on the deployed site and the real administrator signs in with private credentials.
export const DEMO_PERSONAS = [
  {
    id: 'customer-primary',
    name: 'Asha Verma',
    badge: 'Primary Customer',
    description: 'Explore accounts, deposits, withdrawals, transfers and transaction history.',
    email: 'asha.holder@example.com',
  },
  {
    id: 'customer-counterparty',
    name: 'Ravi Kumar',
    badge: 'Transfer Counterparty',
    description: 'Explore a second customer account and demonstrate transfers between users.',
    email: 'ravi.holder@example.com',
  },
  {
    id: 'auditor',
    name: 'Demo Auditor',
    badge: 'Auditor',
    description: 'Explore ledger records, audit logs and integrity verification.',
    email: 'demo.auditor@example.com',
  },
  {
    id: 'administrator',
    name: 'Administrator',
    badge: 'Private / Presenter Only',
    description: 'Admin dashboard, staff management, user management and security controls.',
    email: null, // private credentials – never offered as a public demo login
  },
]

// Where the shared demo password is published (the public README) – linked, never embedded in the app.
export const DEMO_CREDENTIALS_URL = 'https://github.com/indira7-kosaraju/Nilcent#17-demo-credentials'
