# SupportHub frontend

The frontend is a React single-page application built with Vite. It provides customer, agent, manager, and administrator workspaces; role enforcement is also performed by the backend.

## Development

From the repository root, start the API and frontend in separate terminals:

```powershell
npm --prefix backend run dev
npm --prefix frontend run dev
```

The Vite development server proxies `/api` to the backend at `http://localhost:5000`. Configure the backend using `backend/.env.example`.

## Production and checks

Docker builds the static frontend and serves it with Nginx. The container serves the health endpoint at `/healthz` and proxies `/api` requests to the backend service.

```powershell
npm --prefix frontend run lint
npm --prefix frontend run build
```

See the [project README](../README.md) for Docker Compose, Kubernetes, Postman, and database setup.
