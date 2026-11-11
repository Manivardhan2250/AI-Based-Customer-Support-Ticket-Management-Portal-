# SupportHub

SupportHub is a responsive, role-based customer support portal built with React, Express, and PostgreSQL. It brings customer requests, agent workflows, team oversight, and service reporting into one application.

## What is included

- **Customer workspace:** register and sign in, create categorized tickets with attachments, follow conversations and status, reopen or confirm a resolution, and leave feedback.
- **Support agent workspace:** review and claim unassigned tickets, manage assigned ticket priority and status, reply publicly or with internal notes, and request escalations.
- **Support manager workspace:** view team tickets, assign agents, review escalations, access the agent directory, and view operational reports.
- **Administrator workspace:** manage support accounts and access, assign tickets, and review reports.
- **In-app notifications:** ticket creation, assignment, priority, status, and escalation events; users can mark one or all as read.
- **Reports:** ticket status, agent performance, average resolution time, and ticket category.
- **AI assistance:** category and priority suggestions use the OpenAI API when `OPENAI_API_KEY` is configured. Without a key, a local keyword-based classifier remains available. Suggestions are advisory and can be changed by the customer.
- **Deployment assets:** Docker Compose for a local multi-container environment and Kubernetes manifests for a local cluster.

The interface includes separate authentication, overview, ticket list, ticket creation, ticket detail, agent queue, team management, reports, and notifications screens. Navigation and actions are scoped to the signed-in role; API authorization is enforced independently on the server.

## Technology

- React 19, Vite, React Router dependencies, Recharts, and React Icons
- Node.js 20+, Express 5, JWT authentication
- PostgreSQL 16
- Docker, Docker Compose, and Kubernetes

## Run locally

### 1. Configure the backend

In PowerShell:

```powershell
Copy-Item .\backend\.env.example .\backend\.env
```

Edit `backend/.env` with the PostgreSQL connection values for your machine and a private JWT secret of at least 32 characters. Do not commit `.env` files.

If you want OpenAI-powered suggestions, add your own `OPENAI_API_KEY` and (optionally) change `OPENAI_MODEL`. Without a key, the rules-based suggestions work without an external service.

### 2. Prepare PostgreSQL

For a **new empty database**, create `customer_support_db`, then apply:

```powershell
psql -h localhost -p 5434 -U postgres -d customer_support_db -f .\backend\database\schema.sql
psql -h localhost -p 5434 -U postgres -d customer_support_db -f .\backend\database\migrations\001_notifications.sql
psql -h localhost -p 5434 -U postgres -d customer_support_db -f .\backend\database\migrations\002_ticket_workflow.sql
```

Use the host, port, user, and database configured in `backend/.env`. If your database already has the project schema, **do not re-run `schema.sql`**; apply only the migrations that are not already present.

### 3. Create the first administrator

Set one-time account details in the current PowerShell session, then run the seed script:

```powershell
$env:ADMIN_NAME = "Portal Administrator"
$env:ADMIN_EMAIL = "admin@example.com"
$env:ADMIN_PASSWORD = Read-Host "Enter a unique password (12+ characters)"
npm --prefix backend run seed:admin
Remove-Item Env:ADMIN_NAME, Env:ADMIN_EMAIL, Env:ADMIN_PASSWORD
```

The seed command refuses to overwrite an existing account. Create additional agents and managers from the administrator's Team Management screen.

### 4. Start the application

Open two terminals from the repository root:

```powershell
npm --prefix backend run dev
```

```powershell
npm --prefix frontend run dev
```

Open <http://localhost:5173>. Vite proxies `/api` requests to `http://localhost:5000`. The API health check is at <http://localhost:5000/api/health>.

## Run with Docker Compose

Docker Compose starts PostgreSQL, the API, and the production frontend. The database is published on port `5435` by default to avoid conflicting with an existing local PostgreSQL instance.

```powershell
Copy-Item .\.env.example .\.env
```

Edit the root `.env` and replace the database password and JWT secret with private values. Then:

```powershell
docker compose up --build -d
docker compose ps
```

Open <http://localhost:8080>. The API is also available on port `5000`.
The frontend host port defaults to `8080`; if that port is already in use, set
`FRONTEND_PORT=8081` in the root `.env` and open <http://localhost:8081>.
The default `CORS_ORIGIN` allowlist includes the documented local ports; add
the frontend's exact origin there if you choose a different host port.

Password reset emails require SMTP settings in `.env` (`SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`) and a matching `FRONTEND_URL`.
Without them, the reset endpoint reports that email recovery is unavailable;
it never claims an email was sent.

The PostgreSQL initialization scripts run **only when the `postgres_data` volume is first created**. Existing database volumes are preserved across restarts. Do not remove the volume to troubleshoot unless you intend to permanently delete its database contents.

To create the administrator in the Compose database, run:

```powershell
docker compose exec -e ADMIN_NAME="Portal Administrator" -e ADMIN_EMAIL="admin@example.com" -e ADMIN_PASSWORD="replace-with-a-private-12-character-password" backend npm run seed:admin
```

Check service logs with `docker compose logs -f backend` or `docker compose logs -f postgres`.

## Deploy to a local Kubernetes cluster

The manifests are in `k8s/`. They define the namespace, configuration, PostgreSQL StatefulSet and persistent volume, database initialization Job, API Deployment/Service, and frontend Deployment/NodePort Service. The API upload volume is intentionally single-writer; increase replicas only after switching uploads to shared object storage.

### 1. Build and load images

For **Kind**:

```powershell
docker build -t ai-support-backend:local .\backend
docker build -t ai-support-frontend:local .\frontend
kind load docker-image ai-support-backend:local ai-support-frontend:local
```

For Minikube, use `minikube image load ai-support-backend:local` and `minikube image load ai-support-frontend:local` after building the images.

### 2. Create secrets and the database schema ConfigMap

Create `supporthub-secrets` in your cluster with the required keys `DB_USER`, `DB_PASSWORD`, and `JWT_SECRET`. Do not put secret values in Kubernetes YAML or source control. For example, after setting private values in your PowerShell session:

```powershell
kubectl apply -f .\k8s\namespace.yaml
kubectl create secret generic supporthub-secrets -n supporthub `
  --from-literal=DB_USER="$env:DB_USER" `
  --from-literal=DB_PASSWORD="$env:DB_PASSWORD" `
  --from-literal=JWT_SECRET="$env:JWT_SECRET"
```

If using OpenAI suggestions, also provide `OPENAI_API_KEY` when creating the Secret. Otherwise, suggestions use the local rules classifier.

Create the schema ConfigMap from the checked-in SQL files:

```powershell
kubectl apply -f .\k8s\configmap.yaml
kubectl create configmap supporthub-db-init -n supporthub `
  --from-file=001_schema.sql=.\backend\database\schema.sql `
  --from-file=002_notifications.sql=.\backend\database\migrations\001_notifications.sql `
  --from-file=003_ticket_workflow.sql=.\backend\database\migrations\002_ticket_workflow.sql `
  --from-file=004_password_reset_tokens.sql=.\backend\database\migrations\003_password_reset_tokens.sql `
  --dry-run=client -o yaml | kubectl apply -f -
```

### 3. Start the database and initialize it

```powershell
kubectl apply -f .\k8s\postgres.yaml
kubectl rollout status statefulset/postgres -n supporthub
kubectl apply -f .\k8s\database-init-job.yaml
kubectl wait --for=condition=complete job/supporthub-database-init -n supporthub --timeout=180s
```

The initialization Job is for a **new database volume**. For an existing cluster database, apply only the missing SQL migrations using your normal database change process.

### 4. Deploy and access the portal

```powershell
kubectl apply -f .\k8s\backend.yaml
kubectl apply -f .\k8s\frontend.yaml
kubectl rollout status deployment/backend -n supporthub
kubectl rollout status deployment/frontend -n supporthub
kubectl get pods,services -n supporthub
```

The frontend Service is a LoadBalancer on port `8082`; open
<http://localhost:8082>. Docker Desktop may show its external IP as pending
while still exposing the service on localhost. Clusters without local
LoadBalancer support can use `kubectl port-forward` as a fallback.

Create a protected environment file **outside the repository** containing `ADMIN_NAME`, `ADMIN_EMAIL`, and a private `ADMIN_PASSWORD` of at least 12 characters. Create the Kubernetes Secret and run the one-time seed Job:

```powershell
kubectl create secret generic supporthub-admin -n supporthub --from-env-file=C:\secure\supporthub-admin.env
kubectl apply -f .\k8s\admin-seed-job.yaml
kubectl wait --for=condition=complete job/supporthub-admin-seed -n supporthub --timeout=120s
# If the password was generated into the Secret, retrieve and save it securely before deleting the Secret:
kubectl get secret supporthub-admin -n supporthub -o jsonpath="{.data.ADMIN_PASSWORD}" | ForEach-Object { [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($_)) }
kubectl delete secret supporthub-admin -n supporthub
```

The seed command refuses to overwrite an existing account. Create additional agents and managers in the administrator's Team Management screen.

### Password changes and recovery email

Authenticated users can change their own passwords from **Password & security**.
The sign-in screen also supports visibility toggles and email-based password
recovery. Reset links are one-time and expire after 30 minutes.

For Kubernetes, create a protected environment file **outside the repository**
with `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `MAIL_FROM`,
then apply it as a Secret:

```powershell
kubectl create secret generic supporthub-mail -n supporthub `
  --from-env-file=C:\secure\supporthub-mail.env `
  --dry-run=client -o yaml | kubectl apply -f -
kubectl rollout restart deployment/backend -n supporthub
```

Set `FRONTEND_URL` in `k8s/configmap.yaml` to the URL users can actually open.
Without working SMTP settings, the app reports that email recovery is
unavailable instead of pretending to have sent a link. Never commit SMTP
credentials.

## Postman and pgAdmin

The read-only API smoke collection is in `postman/collections/`. Import it and one of the checked-in environments from `postman/environments/`. Set `adminEmail` and `adminPassword` locally; do not commit real passwords or tokens. Local environment copies named `*.local.json` are ignored by Git.

The collection checks API/database health, administrator login, user listing, reports, and authorization responses. To run it with Newman, copy the environment template to a local file, fill in the administrator password, then run:

```powershell
Copy-Item .\postman\environments\supporthub-kubernetes.postman_environment.json .\postman\environments\supporthub-kubernetes.local.json
npm exec --yes --package=newman -- newman run .\postman\collections\supporthub.postman_collection.json -e .\postman\environments\supporthub-kubernetes.local.json
```

For Docker Compose in pgAdmin, connect to host `localhost`, port `5435`, database `customer_support_db`, using `DB_USER` and `DB_PASSWORD` from the root `.env`.

For Kubernetes, keep this port-forward running:

```powershell
kubectl port-forward service/postgres 5436:5432 -n supporthub
```

Add a separate pgAdmin server using host `localhost`, port `5436`, database `customer_support_db`, and the `DB_USER`/`DB_PASSWORD` values in the `supporthub-secrets` Secret. Retrieve secret values only in a local terminal; never paste them into source files or commit them.

## Tests and checks

```powershell
npm --prefix backend test
npm --prefix frontend run lint
npm --prefix frontend run build
```

The backend tests cover rules-based AI suggestions and notification ownership scoping. The frontend build produces a static production bundle; the Docker image serves it through Nginx with SPA routing and `/api` proxying.

## API overview

All endpoints except customer registration and login require a bearer token.

| Area | Routes |
| --- | --- |
| Authentication | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/profile` |
| Tickets | `GET/POST /api/tickets`, `GET/PUT /api/tickets/:id`, `PATCH /api/tickets/:id/assign`, `PATCH /api/tickets/:id/confirmation` |
| Conversations | `GET/POST /api/portal/tickets/:id/comments` |
| Attachments | `GET /api/tickets/:id/attachments/:attachmentId` |
| Suggestions and escalations | `POST /api/portal/suggestions`, `POST /api/portal/tickets/:id/escalations`, `PATCH /api/portal/escalations/:id` |
| Analytics and reports | `GET /api/portal/analytics`, `GET /api/admin/reports` |
| Team administration | `GET/POST /api/admin/users`, `PATCH /api/admin/users/:id` |
| Notifications | `GET /api/notifications`, `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all` |

## Operational notes

- Public registration always creates a customer account. Only an administrator can create support agents and managers.
- Customers can view only their own tickets. Agents can view their assignments and the unassigned queue. Managers and administrators can access the operational workspace.
- Tickets can be resolved by support staff. Customers then confirm closure or reopen the ticket. Closed tickets are final.
- Attachments are limited to five files per ticket, 5 MB each, and a defined set of document/image types. Local and container deployments store them on a persistent volume.
- Notifications are in-app only. Email delivery and external cloud resources are not configured.
- The database, uploads, OpenAI key, and JWT secret are environment/volume managed. Keep backups for persistent data and use a managed database and shared object storage for a multi-replica production deployment.
