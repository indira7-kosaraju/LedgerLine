# LedgerLine – Frontend

React 19 + Vite + Tailwind CSS v4 + React Router + Axios.

```bash
cp .env.example .env   # set VITE_API_BASE_URL
npm install
npm run dev            # http://localhost:5173 (backend must be running on :4000)
npm run build          # production build into dist/
npm run lint
```

## Structure

```
src/
  api/          # Axios instance (client.js) + one file per backend area
  components/
    layout/     # page shells (public layout, app layout with sidebar)
    ui/         # reusable building blocks: Button, Card, Badge, Alert, Spinner
  config/       # environment variables
  pages/        # one component per route
  utils/        # small helpers
```

The frontend never decides whether money can move. It only sends requests;
the backend validates and executes every financial operation.
