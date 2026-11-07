import { BrowserRouter, Route, Routes } from 'react-router'
import ToastProvider from './context/ToastProvider'
import AuthProvider from './context/AuthProvider'
import PublicLayout from './components/layout/PublicLayout'
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/routing/ProtectedRoute'
import GuestRoute from './components/routing/GuestRoute'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import AccountsPage from './pages/AccountsPage'
import AccountDetailsPage from './pages/AccountDetailsPage'
import AuditLogsPage from './pages/AuditLogsPage'
import TransactionsPage from './pages/TransactionsPage'
import TransactionDetailsPage from './pages/TransactionDetailsPage'
import MoneyMovementPage from './pages/MoneyMovementPage'
import LedgerPage from './pages/LedgerPage'
import ForbiddenPage from './pages/ForbiddenPage'
import NotFoundPage from './pages/NotFoundPage'

// All routes in one place.
export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            {/* Signed-in app (sidebar layout) */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="accounts" element={<AccountsPage />} />
                <Route path="accounts/:id" element={<AccountDetailsPage />} />
                <Route path="transactions" element={<TransactionsPage />} />
                <Route path="transactions/:id" element={<TransactionDetailsPage />} />

                {/* Money movement: account holders only (UI guard – the backend enforces it too) */}
                <Route element={<ProtectedRoute roles={['ACCOUNT_HOLDER']} />}>
                  <Route path="deposit" element={<MoneyMovementPage key="deposit" type="DEPOSIT" />} />
                  <Route path="withdraw" element={<MoneyMovementPage key="withdraw" type="WITHDRAWAL" />} />
                  <Route path="transfer" element={<MoneyMovementPage key="transfer" type="TRANSFER" />} />
                </Route>

                {/* Admin + auditor only (UI guard – the backend enforces it too) */}
                <Route element={<ProtectedRoute roles={['ADMIN', 'AUDITOR']} />}>
                  <Route path="ledger" element={<LedgerPage />} />
                  <Route path="audit-logs" element={<AuditLogsPage />} />
                </Route>
              </Route>
            </Route>

            {/* Public pages */}
            <Route element={<PublicLayout />}>
              <Route index element={<HomePage />} />
              <Route element={<GuestRoute />}>
                <Route path="login" element={<LoginPage />} />
                <Route path="register" element={<RegisterPage />} />
              </Route>
              <Route path="forbidden" element={<ForbiddenPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
