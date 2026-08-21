// Padrão wildcard cobre o domínio raiz e qualquer subdomínio dele (mesma
// lógica do projeto irmão track.advflowpro.com: evita ter que adicionar
// cada subdomínio novo manualmente caso o site do cliente passe a usar um).
const DEFAULT_ALLOWED_PATTERNS = ["*.rcsalariomaternidade.com.br"];

function getAllowedPatterns(): string[] {
  const fromEnv = process.env.TRACKING_ALLOWED_ORIGINS;
  if (!fromEnv) return DEFAULT_ALLOWED_PATTERNS;
  return fromEnv
    .split(",")
    .map((pattern) => pattern.trim())
    .filter(Boolean);
}

/**
 * `pattern` é um origin exato ("https://foo.com") ou um wildcard de domínio
 * raiz ("*.rcsalariomaternidade.com.br" — casa rcsalariomaternidade.com.br
 * e qualquer subdomínio dele, ex: www.).
 */
function originMatches(origin: string, pattern: string): boolean {
  if (!pattern.startsWith("*.")) {
    return origin === pattern;
  }
  const rootDomain = pattern.slice(2);
  try {
    const hostname = new URL(origin).hostname;
    return hostname === rootDomain || hostname.endsWith("." + rootDomain);
  } catch {
    return false;
  }
}

/**
 * CORS pros endpoints públicos de tracking (/api/identify, /api/event),
 * chamados via fetch a partir do site principal, em outro domínio/subdomínio.
 * Padrão configurável via TRACKING_ALLOWED_ORIGINS (fallback: *.rcsalariomaternidade.com.br).
 */
export function corsHeaders(origin: string | null): HeadersInit {
  const patterns = getAllowedPatterns();
  const isAllowed = origin !== null && patterns.some((pattern) => originMatches(origin, pattern));

  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
  if (isAllowed) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export function handleCorsPreflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}
