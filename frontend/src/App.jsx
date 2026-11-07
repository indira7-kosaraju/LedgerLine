import { BrowserRouter, Route, Routes } from 'react-router'
import PublicLayout from './components/layout/PublicLayout'
import HomePage from './pages/HomePage'
import NotFoundPage from './pages/NotFoundPage'

// All routes in one place. Login, registration and dashboards are added in later tasks.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<HomePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
