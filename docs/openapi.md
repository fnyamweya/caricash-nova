# OpenAPI Documentation

## Where the Spec Lives

The canonical OpenAPI 3.1 specification is at:

```
packages/api/openapi/openapi.yaml
```

## Viewing Swagger UI

When running the API locally:

```bash
# Start the API
npm run dev:api

# Open Swagger UI in your browser
open http://localhost:8787/docs
```

## API Documentation URLs

| URL | Description |
|-----|-------------|
| `GET /docs` | Interactive Swagger UI |
| `GET /openapi.yaml` | Raw YAML specification |
| `GET /openapi.json` | JSON specification (note) |

> **Note**: The JSON endpoint returns a note directing to the YAML spec, as we don't bundle a YAML parser in the Worker. Use the YAML spec for tooling.

## Validating the Spec

```bash
# Validate OpenAPI spec (requires @redocly/cli)
npm run openapi:validate
```

## Route Coverage Tests

The test suite verifies bidirectional coverage:

```bash
# Run OpenAPI coverage tests
npx vitest run --reporter=verbose packages/api/src/__tests__/openapi-coverage.test.ts
```

**What it checks:**
1. **Route-to-spec**: Every route handler in the API has a matching entry in the OpenAPI spec
2. **Spec-to-route**: Every endpoint in the spec has a handler registered (or stub present)
3. **Spec structure**: Required sections, tags, security schemes, error codes are present

## Adding New Endpoints

When adding a new API endpoint:

1. **Add the route handler** in the appropriate `packages/api/src/routes/*.ts` file
2. **Add the OpenAPI path** in `packages/api/openapi/openapi.yaml` under `paths:`
3. **Add request/response schemas** under `components/schemas:` using `$ref` for reuse
4. **Add examples** for each request and response
5. **Run coverage tests** to verify spec ↔ code alignment:
   ```bash
   npx vitest run packages/api/src/__tests__/openapi-coverage.test.ts
   ```

### Schema Naming Conventions

- **PascalCase** for schema names: `CreateCustomerRequest`, `BalanceResponse`
- **camelCase** for property names: `correlationId`, `idempotencyKey`
- Use `$ref` components — never duplicate schemas

### Required Fields for Money-Moving Endpoints

Every transaction endpoint must document:
- `idempotency_key` as required field
- Idempotency behavior in the description
- 409 response for `DUPLICATE_IDEMPOTENCY_CONFLICT`
- `correlation_id` field (optional, generated if missing)

## Stub Endpoints

Some endpoints are documented in the spec but return 501 Not Implemented.
These are tracked in `/docs/openapi-gaps.md`.

To implement a stub:
1. Find the stub in `packages/api/src/routes/stubs.ts`
2. Move the implementation to the appropriate route file
3. Remove the stub
4. Update `/docs/openapi-gaps.md`
