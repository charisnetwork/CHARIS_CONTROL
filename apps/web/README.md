# Charis Control Centre web

React, TypeScript, Vite, and Tailwind frontend for the app-scoped Control Centre.

```bash
cp .env.example .env
npm run dev
```

`VITE_CONTROL_API_URL` is the FastAPI origin without `/api/v1`. Production must define it explicitly; there is no hard-coded Railway fallback.

The navigation boundary is:

1. Owner/team login.
2. Application selection at `/apps`.
3. Selected application routes under `/apps/:appId/...`.

The access token remains in memory. The opaque refresh token is an HttpOnly cookie, and the CSRF value is kept in session storage solely to authorize refresh/logout requests. No all-applications customer, subscription, or revenue view is available.

Run the production type/build gate with `npm run build`. The repository still contains unreachable legacy screens; their pre-existing lint debt will be removed as each app-scoped replacement module is implemented.
