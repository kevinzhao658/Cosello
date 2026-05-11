// Beta access gate. Cookie-based so it plays nicely with SPA fetch/XHR calls
// (HTTP Basic Auth doesn't — browsers don't auto-attach Basic credentials to
// fetch requests, which caused re-prompts on every API call). Cookie set after
// the user submits the shared beta password is sent on every same-origin
// request automatically.
//
// Remove this file + disable any Vercel Deployment Protection at public launch.

export const config = {
  matcher: "/((?!favicon.ico|robots.txt|_vercel).*)",
};

const COOKIE_NAME = "cosello_beta";
const FORM_PATH = "/__beta-gate";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const renderForm = (errorMessage = ""): Response => {
  const body = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Cosello — Beta Access</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:system-ui,-apple-system,sans-serif;background:#18181b;color:#e4e4e7;
         display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1rem}
    form{background:#27272a;padding:2rem 2.5rem;border-radius:.75rem;
         border:1px solid #3f3f46;width:100%;max-width:320px}
    h1{font-size:1.25rem;font-weight:300;letter-spacing:.1em;margin:0 0 .25rem;text-align:center}
    p.sub{font-size:.8125rem;color:#a1a1aa;text-align:center;margin:0 0 1.5rem}
    label{display:block;font-size:.6875rem;color:#a1a1aa;letter-spacing:.1em;
          text-transform:uppercase;margin-bottom:.5rem}
    input{width:100%;padding:.625rem .75rem;background:#18181b;color:#e4e4e7;
          border:1px solid #3f3f46;border-radius:.375rem;font-size:.875rem;margin-bottom:1rem}
    input:focus{outline:none;border-color:#a21caf}
    button{width:100%;padding:.625rem;background:#a21caf;color:#fff;border:0;
           border-radius:.375rem;font-size:.875rem;cursor:pointer;font-weight:500;letter-spacing:.05em}
    button:hover{background:#86198f}
    .err{color:#fb7185;font-size:.75rem;margin:-.5rem 0 1rem;text-align:center}
  </style>
</head>
<body>
  <form method="POST" action="${FORM_PATH}">
    <h1>COSELLO</h1>
    <p class="sub">Beta access</p>
    ${errorMessage ? `<div class="err">${errorMessage}</div>` : ""}
    <label for="password">Password</label>
    <input id="password" type="password" name="password" autofocus required autocomplete="current-password" />
    <button type="submit">Continue</button>
  </form>
</body>
</html>`;
  return new Response(body, {
    status: 401,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};

export default async function middleware(req: Request): Promise<Response | undefined> {
  const expected = process.env.BETA_PASSWORD;
  if (!expected) {
    return new Response("Beta gate misconfigured: BETA_PASSWORD env var not set", {
      status: 500,
    });
  }

  // Already authenticated via cookie?
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`));
  if (match && decodeURIComponent(match[1]) === expected) {
    return undefined; // pass through
  }

  // Form submission
  const url = new URL(req.url);
  if (req.method === "POST" && url.pathname === FORM_PATH) {
    const formData = await req.formData();
    const submitted = formData.get("password");
    if (typeof submitted === "string" && submitted === expected) {
      const headers = new Headers();
      headers.set("Location", "/");
      headers.append(
        "Set-Cookie",
        `${COOKIE_NAME}=${encodeURIComponent(expected)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`,
      );
      return new Response(null, { status: 302, headers });
    }
    return renderForm("Invalid password");
  }

  // Default: show the form
  return renderForm();
}
