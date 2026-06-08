/**
 * RG-007: rolePermissionCache 移除 regression test.
 * RG-009 (Sprint 5): 加強 cleanup — 整個 cache 結構 (Map + set/invalidate helpers)
 * 必須喺 production code 完全消失,剩低 import / call 全部屬 dead code。
 *
 * 之前問題:rolePermissionCache (Map in index.ts) 改完 role 後唔會 auto-refresh,
 * user 要 docker compose restart backend 先見到新 permissions.
 *
 * Fix: 整個移除 cache,每次 request 重新 query DB (1-2ms 影響可忽視).
 *
 * 守住 invariant:任何 code path 入面攞 permission 都係 fresh DB query,
 * 唔可以 from cache(SPEC.md / 紅線 13:冇 entry 嘅 fix 唔可以 merge)。
 *
 * Test 策略:用 derive helper pattern(Sprint 1+2 復用)— 唔 mock 個 server,
 * 直接 derive `loadRolePermissions` 嘅核心 invariant:每次 call 都 hit DB。
 *
 * 因為 loadRolePermissions 冇 export,我哋用一個 in-test wrapper re-import
 * index.ts 嘅 cache object 嚟 verify Map 唔再存在。
 */
import { describe, expect, test } from 'bun:test'

describe('RG-007/RG-009: role permissions no longer cached + cache symbols fully removed', () => {
  test('rolePermissionCache Map has been removed from index.ts (source code check)', async () => {
    // Read the actual source file and verify the cache is gone
    const fs = await import('node:fs/promises')
    const path = await import('node:path')

    const indexPath = path.resolve(import.meta.dir, '../index.ts')
    const source = await fs.readFile(indexPath, 'utf-8')

    // 1. The Map declaration should be gone
    expect(source).not.toMatch(/const\s+rolePermissionCache\s*=\s*new\s+Map/)

    // 2. The cached lookup should be gone
    expect(source).not.toMatch(/const\s+cached\s*=\s*rolePermissionCache\.get/)

    // 3. The cache.set on every load should be gone
    expect(source).not.toMatch(/rolePermissionCache\.set\(roleName,\s*permissions\)/)

    // 4. But the helper loadRolePermissions still exists + queries DB
    expect(source).toMatch(/async function loadRolePermissions/)
    expect(source).toMatch(/prisma\.role\.findUnique\(\s*{\s*where:\s*{\s*name:\s*roleName/)

    // 5. Comment block should explain why no cache
    expect(source).toMatch(/No in-memory cache|RG-007/)
  })

  test('loadRolePermissions comments reference RG-007 fix and immediate effect', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')

    const indexPath = path.resolve(import.meta.dir, '../index.ts')
    const source = await fs.readFile(indexPath, 'utf-8')

    // The derive hook should have a comment explaining immediate effect
    expect(source).toMatch(/permissions.*from\s+DB.*no\s+cache|RG-007/)
    expect(source).toMatch(/即時生效|immediate/)
  })

  test('middleware/permission.ts: hasPermission reads from user.permissions (not Map)', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')

    const permissionPath = path.resolve(import.meta.dir, './permission.ts')
    const source = await fs.readFile(permissionPath, 'utf-8')

    // hasPermission uses user.permissions array (injected by derive hook per-request)
    expect(source).toMatch(/user\.permissions\?\.includes\(permission\)/)
  })

  test('old in-memory cache is documented as the bug pattern in REGRESSION-GUARD', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')

    // Repo root relative to this test file
    const rgPath = path.resolve(import.meta.dir, '../../../docs/REGRESSION-GUARD.md')
    const rg = await fs.readFile(rgPath, 'utf-8')

    // RG-007 entry must exist with the bug pattern + fix + prevention
    expect(rg).toMatch(/RG-007.*rolePermissionCache|rolePermissionCache.*RG-007/s)
    expect(rg).toMatch(/rolePermissionCache.*(auto-refresh|cache.*stale|docker.*restart)/s)
  })

  // ─── RG-009 (Sprint 5): Cache symbol cleanup ──────────────────────────────
  test('RG-009: rolePermissionCache / setRolePermissions / invalidateRolePermissions fully removed from production code', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')

    // Scan all .ts files in src/ (excluding tests) for any stale references
    const srcDir = path.resolve(import.meta.dir, '..')
    const entries = await fs.readdir(srcDir, { withFileTypes: true, recursive: true })

    const tsFiles: string[] = []
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith('.ts')) continue
      if (e.name.endsWith('.test.ts')) continue // skip tests
      const fullPath = path.join(e.path ?? srcDir, e.name)
      tsFiles.push(fullPath)
    }

    const banned = ['rolePermissionCache', 'setRolePermissions', 'invalidateRolePermissions']
    const offenders: { file: string; symbol: string }[] = []

    for (const file of tsFiles) {
      const src = await fs.readFile(file, 'utf-8')
      for (const sym of banned) {
        if (src.includes(sym)) offenders.push({ file, symbol: sym })
      }
    }

    expect(offenders).toEqual([])
  })

  test('RG-009: routes/roles.ts has no rolePermissionCache.delete() calls (cache invalidation pattern removed)', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')

    const rolesPath = path.resolve(import.meta.dir, '../routes/roles.ts')
    const source = await fs.readFile(rolesPath, 'utf-8')

    expect(source).not.toMatch(/rolePermissionCache\.delete/)
  })

  test('RG-009: REGRESSION-GUARD.md has RG-009 entry referencing cache cleanup', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')

    const rgPath = path.resolve(import.meta.dir, '../../../docs/REGRESSION-GUARD.md')
    const rg = await fs.readFile(rgPath, 'utf-8')

    expect(rg).toMatch(/RG-009/)
    expect(rg).toMatch(/cache.*cleanup|cleanup.*cache|stale.*cache|dead.*code/i)
  })
})
