# Post-Sprint-21 Regression Sweep (2026-06-23)

**Auditor:** Claude (auto)
**HEAD:** `92b5820`
**Scope:** Three changed surfaces post-Sprint-21 — (a) document parsing/LLM, (b) wiki upload + SSE, (c) nginx config.

---

## (a) Backend document parsing / LLM timeout tests

```bash
bun test src/routes/documents.test.ts
```

```
bun test v1.3.14 (0d9b296a)

 30 pass
 0 fail
 48 expect() calls
Ran 30 tests across 1 file. [206.00ms]
```

✅ **30/30 pass** — 0.206s runtime. Covers:
- LLM JSON response structure (US-8.8)
- **safeSend SSE controller closed race (Sprint 21 US-21.4 hotfix)** — added by `88c582d`
- Existing 28 LLM/parse tests still pass after `e1382fa` `LLM_TIMEOUT_MS` bump (60s → 180s)

No new failures from the timeout series (`cd8b676` / `04a5d79` / `e1382fa`).

---

## (b) Wiki upload + SSE controller tests

```bash
bun test src/routes/wikis.test.ts
bun test src/routes/wiki-search.test.ts src/utils/wiki-dedup.test.ts
```

**wikis.test.ts**:
```
 30 pass
 0 fail
 46 expect() calls
Ran 30 tests across 1 file. [25.00ms]
```

✅ **30/30 pass** — covers US-21.3 replace flow + membership gate.

**wiki-search + wiki-dedup combined**:
```
 24 pass
 0 fail
 49 expect() calls
Ran 24 tests across 2 files. [233.00ms]
```

✅ **24/24 pass** — covers:
- `wiki-search.test.ts` — US-21.4 metadata (`{ requested, matched, returned, totalAvailable }`)
- `wiki-dedup.test.ts` — US-21.3 `normalizeTitleForCompare` (12 cases) + `findExistingWikiPage` case-insensitive lookup

**SSE controller**: covered by `safeSend` tests in `documents.test.ts` (above). 30/30 pass.

**Wiki batch SSE stream** (`e1edb0d` + `2495812`): no dedicated unit test for the heartbeat or batch-parse flow specifically — would require integration/E2E test (out of scope for `bun test`). The console.log residue from `2495812` is still present but does not affect unit tests.

---

## (c) nginx config smoke test (`nginx -t`)

### Approach

The host Mac has no `nginx` binary installed. Used the project-pinned `nginx:alpine` Docker image (matches `frontend/Dockerfile` line 19) to validate the rendered config:

```bash
docker run --rm \
  -v "$(pwd)/frontend/nginx.conf.template":/tmp/nginx.conf.template \
  -v /tmp/nginx-test/certs:/etc/nginx/certs:ro \
  nginx:alpine sh -c '
    EXTERNAL_HTTPS_PORT=443 EXTERNAL_HTTP_PORT=80
    export EXTERNAL_HTTPS_PORT EXTERNAL_HTTP_PORT
    echo "127.0.0.1 backend db" >> /etc/hosts
    envsubst "${EXTERNAL_HTTPS_PORT} ${EXTERNAL_HTTP_PORT}" \
      < /tmp/nginx.conf.template > /tmp/nginx.conf
    nginx -t -c /tmp/nginx.conf
  '
```

### Setup adjustments
- **Self-signed certs** generated to `/tmp/nginx-test/certs/{server.crt,server.key}` (the real `gen-cert.sh` produces longer-lived certs; for `-t` we only need files to exist).
- **Fake `/etc/hosts`** entry for `backend db` because `upstream backend { server backend:4000; }` requires DNS resolution that only exists inside the docker-compose network.
- **env vars exported inline** because the docker-entrypoint.sh substitution pattern needs POSIX-sh `:="${VAR:=default}"` and `export` — passing via `-e` is also fine but inline is more hermetic.

### Result

```
nginx: the configuration file /tmp/nginx.conf syntax is ok
nginx: configuration file /tmp/nginx.conf test is successful
```

✅ **PASS** — all 5 nginx SSE fixes (`84cc263` / `16d0806` / `d2fd2f1` / `64a37fb` / plus http/2 comment) compose into a valid configuration.

---

## Summary

| Surface | Command | Result |
|---------|---------|--------|
| (a) documents LLM/timeout | `bun test src/routes/documents.test.ts` | ✅ 30/30 pass (0.206s) |
| (b1) wikis | `bun test src/routes/wikis.test.ts` | ✅ 30/30 pass (0.025s) |
| (b2) wiki-search + dedup | `bun test src/routes/wiki-search.test.ts src/utils/wiki-dedup.test.ts` | ✅ 24/24 pass (0.233s) |
| (b3) SSE controller (safeSend) | covered by (a) above | ✅ included in 30 |
| (c) nginx -t | `docker run ... nginx -t` | ✅ syntax ok, test successful |

**Total: 84 tests pass, 0 fail.** No new failures introduced by the post-Sprint-21 commits.

---

## Observations

1. **Test coverage is solid for the changes** — all three sprint-21 LLM/timeout commits + the wiki upload/US-21.3/US-21.4 surfaces are tested. The 48 `expect()` calls in `documents.test.ts` include the 2 safeSend tests added by `88c582d`.

2. **No dedicated test for `2495812` heartbeat** — the `setInterval` 10s heartbeat that prevents nginx idle-close is not directly tested at the unit level. It runs in the production code path but is not exercised by `bun test`. A future improvement would be a time-mocked test (e.g. fake timers) verifying heartbeat fires and stops on controller close.

3. **No dedicated test for nginx `Connection: close` 3-layer defense** — the `add_header Connection close always` + `keepalive_timeout 0` + `keepalive_requests 1` chain is verified only by `nginx -t` syntax check. An integration test that actually opens an HTTPS connection and asserts `Connection: close` in the response header would be more thorough. Out of scope for the current sweep.

4. **Console.log residue from `2495812` does not affect tests** — the 9 statements documented in t3's triage are noise but functionally inert. Tests still pass. Cleanup is a follow-up item, not a regression blocker.

5. **nginx config drift concern (F4 from t2) is benign** — the misleading comment in `build-release.sh:38` doesn't affect the nginx config itself; the rendered config validates cleanly.

---

## Verdict

**No regression. Ship-ready from a test coverage standpoint**, modulo the t3 follow-ups:
- 🔴 F1: Clean 9 console.log/warn residue from `2495812`
- 🟡 F2: Write `docs/SSE-NGINX-TUNING.md` (lock in 3-layer Connection: close rationale)

Both are documentation/cleanup, not test failures.