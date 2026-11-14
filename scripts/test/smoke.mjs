#!/usr/bin/env node
/**
 * End-to-end smoke test for a running PST stack (local, staging or production).
 *
 *   BASE_URL=http://127.0.0.1:3000 ORIGIN=https://localhost:8443 \
 *   ADMIN_EMAIL=admin@pst.tl ADMIN_PASSWORD='…' TOTP_SECRET='…' \
 *   node scripts/test/smoke.mjs
 *
 * BASE_URL  where requests go (app directly, to avoid nginx login rate limits)
 * ORIGIN    must equal the app's APP_URL origin (CSRF check)
 * The admin must be a fresh seed (forced password change + 2FA enrolment is
 * performed by the test) unless SKIP_ONBOARDING=1 and TOTP_SECRET is given.
 *
 * ⚠ Writes test data (a member registration, a post, an event, an aspiration).
 *   Run against production only with WRITE=0 (read-only checks).
 */
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(path.join(process.cwd(), "package.json"));
const { TOTP, Secret } = require("otpauth");
const sharp = require("sharp");

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const ORIGIN = process.env.ORIGIN ?? BASE;
const WRITE = process.env.WRITE !== "0";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@pst.tl";
let adminPassword = process.env.ADMIN_PASSWORD ?? "";
const NEW_PASSWORD = process.env.NEW_ADMIN_PASSWORD ?? "Kamarada-Dili#2026-Forte!";

let cookie = "";
let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log(`  ✔ ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  ✘ ${name}`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 500));
  }
}

async function call(method, url, { json, form, raw = false } = {}) {
  const headers = { origin: ORIGIN };
  if (cookie) headers.cookie = cookie;
  let body;
  if (json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(json);
  }
  if (form) body = form;
  const res = await fetch(BASE + url, { method, headers, body, redirect: "manual" });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    const name = pair.slice(0, i);
    const val = pair.slice(i + 1);
    if (name.includes("pst_session")) cookie = val ? `${name}=${val}` : "";
  }
  if (raw) return res;
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, body: data, headers: res.headers };
}

const png = (w, h, c) => sharp({ create: { width: w, height: h, channels: 3, background: c } }).png().toBuffer();

async function main() {
  console.log(`PST smoke test → ${BASE} (origin ${ORIGIN})${WRITE ? "" : " [read-only]"}`);

  console.log("\n# Public");
  let r = await call("GET", "/api/health");
  check("health ok", r.status === 200 && r.body.status === "ok", r.body);
  r = await call("GET", "/api/geo");
  check("14 municípios", r.body.data?.length === 14, r.body);
  const dili = r.body.data?.find((m) => m.code === "DI");
  for (const p of ["/tet", "/pt/news", "/id/municipalities", "/en/join", "/tet/voice", "/tet/documents"]) {
    const res = await call("GET", p, { raw: true });
    check(`page ${p} → 200`, res.status === 200, res.status);
  }
  r = await call("GET", "/sitemap.xml", { raw: true });
  check("sitemap.xml", r.status === 200);

  if (!WRITE) return;

  console.log("\n# Registration (E-KTA)");
  const posts = (await call("GET", `/api/geo?level=adminPost&parentId=${dili.id}`)).body.data;
  const form = new FormData();
  const fields = {
    fullName: "Smoke Test Militante", gender: "FEMALE", birthDate: "1990-02-03", idDocumentType: "BILHETE_IDENTIDADE",
    idNumber: `SMOKE-${Date.now()}`, phone: "77123456", municipalityId: String(dili.id), adminPostId: String(posts[0].id), consent: "true",
  };
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  form.set("photo", new Blob([await png(600, 800, { r: 200, g: 160, b: 120 })], { type: "image/png" }), "photo.png");
  form.set("idScan", new Blob([await png(800, 500, { r: 230, g: 230, b: 230 })], { type: "image/png" }), "bi.png");
  r = await call("POST", "/api/register", { form });
  check("registration accepted", r.status === 201 && /^REG-/.test(r.body.data?.registrationRef ?? ""), r.body);
  const ref = r.body.data?.registrationRef;
  r = await call("POST", "/api/membership/status", { json: { registrationRef: ref, birthDate: "1990-02-03" } });
  check("status check PENDING", r.body.data?.status === "PENDING", r.body);

  console.log("\n# Backoffice login");
  r = await call("POST", "/api/auth/login", { json: { email: ADMIN_EMAIL, password: adminPassword } });
  check("login accepted", r.status === 200, r.body);
  let stage = r.body.data?.stage;
  let totp;
  if (stage === "PASSWORD_CHANGE_REQUIRED") {
    r = await call("POST", "/api/auth/password", { json: { currentPassword: adminPassword, newPassword: NEW_PASSWORD } });
    check("forced password change", r.status === 200, r.body);
    adminPassword = NEW_PASSWORD;
    stage = r.body.data?.stage;
  }
  if (stage === "TWO_FACTOR_SETUP_REQUIRED") {
    r = await call("GET", "/api/auth/2fa/setup");
    totp = new TOTP({ secret: Secret.fromBase32(r.body.data.secret), digits: 6, period: 30, algorithm: "SHA1" });
    r = await call("POST", "/api/auth/2fa/setup", { json: { code: totp.generate() } });
    check("2FA enrolled", r.body.data?.recoveryCodes?.length === 10, r.body);
    stage = r.body.data?.stage;
  }
  if (stage === "TWO_FACTOR_REQUIRED" && process.env.TOTP_SECRET) {
    totp = new TOTP({ secret: Secret.fromBase32(process.env.TOTP_SECRET), digits: 6, period: 30, algorithm: "SHA1" });
    r = await call("POST", "/api/auth/2fa/verify", { json: { code: totp.generate() } });
    stage = r.body.data?.stage;
  }
  check("session ACTIVE", stage === "ACTIVE", stage);
  r = await fetch(BASE + "/api/admin/members", { method: "POST", headers: { cookie } });
  check("CSRF: POST without Origin rejected", r.status === 403);

  console.log("\n# Members & KTA");
  r = await call("GET", `/api/admin/members?q=${encodeURIComponent(ref)}`);
  const memberId = r.body.data?.items?.[0]?.id;
  check("member listed", !!memberId, r.body);
  r = await call("POST", `/api/admin/members/${memberId}/status`, { json: { status: "VERIFIED" } });
  check("verified → KTA number", /^PST-DI-\d{4}-\d{6}$/.test(r.body.data?.memberNumber ?? ""), r.body);
  r = await call("POST", `/api/admin/members/${memberId}/kta`, { json: { action: "issue" } });
  check("KTA card issued", r.status === 201, r.body);
  let res = await call("GET", `/api/admin/members/${memberId}/kta?format=pdf`, { raw: true });
  const pdf = Buffer.from(await res.arrayBuffer());
  check("KTA PDF renders", res.status === 200 && pdf.subarray(0, 5).toString() === "%PDF-", res.status);
  res = await call("GET", `/api/admin/members/${memberId}/kta?format=png`, { raw: true });
  check("KTA PNG renders (fonts present)", res.status === 200 && (await res.arrayBuffer()).byteLength > 20_000, res.status);
  res = await call("GET", "/api/admin/members/export?format=xlsx", { raw: true });
  check("export xlsx", res.status === 200 && Number(res.headers.get("x-record-count")) >= 1);

  console.log("\n# CMS & public content");
  r = await call("POST", "/api/admin/posts", {
    json: { type: "NEWS", translations: [{ locale: "TET", title: `Smoke test ${Date.now()}`, contentHtml: "<p>Test.</p><script>x</script>" }] },
  });
  check("post created", r.status === 201, r.body);
  const postId = r.body.data?.id;
  const slug = r.body.data?.translations?.[0]?.slug;
  check("HTML sanitised", !r.body.data?.translations?.[0]?.contentHtml?.includes("script"));
  r = await call("POST", `/api/admin/posts/${postId}/workflow`, { json: { action: "publish" } });
  check("post published", r.body.data?.status === "PUBLISHED", r.body);
  res = await call("GET", `/tet/news/${slug}`, { raw: true });
  check("article page renders", res.status === 200, res.status);

  console.log("\n# Media upload");
  const mf = new FormData();
  mf.set("file", new Blob([await png(1200, 800, { r: 20, g: 120, b: 200 })], { type: "image/png" }), "smoke.png");
  r = await call("POST", "/api/admin/media", { form: mf });
  check("media uploaded", r.status === 201 && !!r.body.data?.url, r.body);
  if (r.body.data?.url) console.log(`    media URL: ${r.body.data.url}`);
  globalThis.__mediaUrl = r.body.data?.url;

  console.log("\n# Aspiration");
  const af = new FormData();
  for (const [k, v] of Object.entries({ category: "HEALTH", isAnonymous: "true", subject: "Smoke test subject", message: "Smoke test message for the aspiration form." })) af.set(k, v);
  r = await call("POST", "/api/aspirations", { form: af });
  check("aspiration submitted", r.status === 201 && !!r.body.data?.trackingCode, r.body);

  console.log("\n# Audit");
  r = await call("GET", "/api/admin/audit/verify");
  check("audit chain intact", r.body.data?.ok === true, r.body);
  r = await call("GET", "/api/admin/dashboard");
  check("dashboard", r.status === 200 && r.body.data?.members?.total >= 1, r.status);
}

main()
  .catch((e) => {
    fail++;
    console.error(e);
  })
  .finally(() => {
    console.log(`\n${pass} passed, ${fail} failed${failures.length ? `: ${failures.join("; ")}` : ""}`);
    if (globalThis.__mediaUrl) console.log(`MEDIA_URL=${globalThis.__mediaUrl}`);
    process.exit(fail ? 1 : 0);
  });
