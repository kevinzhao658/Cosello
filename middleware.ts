export const config = {
  matcher: "/((?!favicon.ico|robots.txt|_vercel).*)",
};

export default function middleware(request: Request): Response | undefined {
  const auth = request.headers.get("authorization");
  if (!auth) {
    return new Response("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Cosello Beta"' },
    });
  }

  const [scheme, encoded] = auth.split(" ");
  if (scheme !== "Basic" || !encoded) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Cosello Beta"' },
    });
  }

  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return new Response("Invalid credentials", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Cosello Beta"' },
    });
  }

  const idx = decoded.indexOf(":");
  const pass = idx >= 0 ? decoded.slice(idx + 1) : "";
  const expected = process.env.BETA_PASSWORD;
  if (!expected || pass !== expected) {
    return new Response("Invalid credentials", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Cosello Beta"' },
    });
  }

  return undefined;
}
