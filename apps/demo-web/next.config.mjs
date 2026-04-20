function parseOrigin(value) {
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

const apiOrigin = parseOrigin(process.env.NEXT_PUBLIC_MINTRA_API_URL);
const verifierOrigin = parseOrigin(process.env.NEXT_PUBLIC_MINTRA_VERIFIER_URL);
const connectSrcOrigins = ["'self'", apiOrigin, verifierOrigin].filter(Boolean).join(" ");

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `connect-src ${connectSrcOrigins}`,
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'`,
  "worker-src 'self' blob:",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@mintra/sdk-js", "@mintra/sdk-types"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Origin-Agent-Cluster", value: "?1" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
