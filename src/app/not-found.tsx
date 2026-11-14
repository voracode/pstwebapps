// Requests outside any locale (e.g. /random.txt) — the proxy normally prefixes
// a locale, so this only renders for unmatched static-looking paths.
export default function RootNotFound() {
  return (
    <html lang="pt">
      <body style={{ fontFamily: "system-ui", textAlign: "center", padding: "4rem 1rem" }}>
        <h1 style={{ color: "#d91c1f" }}>404</h1>
        <p>
          <a href="/">Partido Socialista de Timor</a>
        </p>
      </body>
    </html>
  );
}
