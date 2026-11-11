# SupportHub Postman collection

Import `collections/supporthub.postman_collection.json` and one of the environments from `environments/`.

1. Select the Docker or Kubernetes environment and set `baseUrl` if your local port differs.
2. Set `adminEmail` and `adminPassword` in the Postman environment. Keep the password as a local/secret value; do not sync or commit it.
3. Run the collection in order. The login request stores its JWT in `adminToken` for the protected requests.

The collection is read-only apart from login. It checks API/database health, admin user listing and reports, and the expected unauthorized/invalid-filter responses.

For Newman, copy an environment template to a `*.local.json` file, fill in the local credentials, and use that copy with `newman run`. These local environment files are ignored by Git.
