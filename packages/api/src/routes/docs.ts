/**
 * Swagger UI and OpenAPI spec serving routes.
 * GET /docs → Swagger UI HTML
 * GET /openapi.yaml → raw YAML spec
 * GET /openapi.json → JSON spec
 */
import { Hono } from 'hono';
import type { Env } from '../index.js';

export const docsRoutes = new Hono<{ Bindings: Env }>();

// ---- Raw YAML spec ----
docsRoutes.get('/openapi.yaml', async (c) => {
  const spec = getOpenApiYaml();
  return new Response(spec, {
    headers: {
      'Content-Type': 'text/yaml; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
  });
});

// ---- JSON spec (converted inline) ----
docsRoutes.get('/openapi.json', async (c) => {
  return c.json({
    error: 'Not yet implemented',
    code: 'NOT_IMPLEMENTED',
    message: 'JSON conversion not available. Use GET /openapi.yaml for the canonical OpenAPI spec.',
  }, 501);
});

// ---- Swagger UI ----
docsRoutes.get('/docs', async (c) => {
  const html = getSwaggerHtml();
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});

function getSwaggerHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CariCash Nova API — Swagger UI</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body { margin: 0; padding: 0; }
    #swagger-ui { max-width: 1200px; margin: 0 auto; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/openapi.yaml',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis],
      layout: 'BaseLayout',
      deepLinking: true,
      defaultModelsExpandDepth: 1,
      docExpansion: 'list',
    });
  </script>
</body>
</html>`;
}

/**
 * Inline the OpenAPI YAML spec.
 * In production this would read from a file or be bundled at build time.
 * For Cloudflare Workers, we inline it as a string to avoid filesystem access.
 */
function getOpenApiYaml(): string {
  // This is a placeholder that will be replaced by the build process.
  // For now, return the spec URL redirect instruction.
  return OPENAPI_SPEC;
}

// The actual spec content can be set by build/bundler or manually inlined.
// This default must remain a valid OpenAPI document so Swagger UI always renders.
export let OPENAPI_SPEC = `openapi: 3.1.0
info:
  title: CariCash Nova API
  version: 0.2.0
  description: |
    Fallback OpenAPI document served by the Worker.
    Full spec inlining is not configured in this environment.
servers:
  - url: /
paths:
  /health:
    get:
      summary: Health check
      responses:
        '200':
          description: Service is healthy
  /docs:
    get:
      summary: Swagger UI
      responses:
        '200':
          description: Swagger UI HTML
`;

/**
 * Set the OpenAPI spec content (called during app initialization).
 */
export function setOpenApiSpec(spec: string): void {
  OPENAPI_SPEC = spec;
}
