# MCP Welcome-on-Login Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use shipyard:shipyard-executing-plans to implement this plan task-by-task.

**Goal:** Give a brand-new Memxus user (0 saved memories) a proactive welcome the moment they connect an MCP client, instead of silence or a generic "no memories found" — without adding any noise for users who already have memories.

**Architecture:** MCP is request-response only — the server can never push a chat message on its own at `initialize` time. The only real lever is the optional `instructions` field of the `initialize` response, which the client feeds to the model as connection context. This is combined with a deterministic fallback: the existing `maybeCreateWelcomeMemory` helper (`src/mcp/welcome.ts`, already shipped) is now also wired into the two remaining "empty" tool branches (`get_context`'s collection picker, `list_memories`) so that whichever tool the client happens to call first, the welcome fires — guaranteed, once the user says anything.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, Supabase (via `getStats`/`saveMemory` in `src/mcp/tools.ts`), Node's built-in test runner (`node --test`, not vitest — confirmed in `package.json`).

**Status:** all 3 tasks below are already implemented in the working tree (uncommitted). This plan documents them for the record and as the executable spec `shipyard:shipyard-executing-plans`/`shipyard:shipyard-verification` should check against — Task 4 (verification) is the one still outstanding.

---

### Task 1: Dynamic `instructions` on connect

**Files:**
- Modify: `src/mcp/server.ts:177-232` (`createMCPServer`, sync → async, `instructions` computed before `new Server(...)`)
- Modify: `src/mcp/transport.ts:232`, `src/mcp/transport.ts:282` (both `createMCPServer(...)` call sites → `await createMCPServer(...)`)
- Test: `src/mcp/server.test.ts` (extend `withTestClient`-style test using `client.getInstructions()`)

**Step 1: Write the failing test**

```ts
// src/mcp/server.test.ts
test('createMCPServer sets instructions for a zero-memory user, omits it once they have memories', async () => {
  await withTestClient(async (client) => {
    assert.equal(
      client.getInstructions()?.includes('has no saved memories yet'),
      true,
    );
  });
  // second client against a user with stats.total > 0 (mock getStats or use
  // a seeded test user) should see client.getInstructions() === undefined
});
```

**Step 2: Run test to verify it fails**

Run: `node --import tsx --import ./src/test/setup-env.ts --test src/mcp/server.test.ts`
Expected: FAIL — `createMCPServer` was synchronous and never set `instructions`, so `client.getInstructions()` is `undefined` for the zero-memory case too.

**Step 3: Write minimal implementation**

Already done in `src/mcp/server.ts`:
```ts
export async function createMCPServer(ctx: McpContext): Promise<Server> {
  const { userId, apiKeyId, workforceWorkspaceId, oauthScope, isOAuthToken } = ctx;
  const oauthOpts = { isOAuthToken };

  const connectStats = await getStats(userId, workforceWorkspaceId);
  const instructions =
    connectStats.total === 0
      ? "This user has no saved memories yet. Proactively greet them at the start of the " +
        "conversation (don't wait to be asked): briefly explain you can remember things they " +
        "tell you to save (facts, preferences, decisions, project context) and invite them to " +
        "save their first memory or ask what's already there."
      : undefined;

  const server = new Server(
    { name: 'memxus', version: '1.2.0' },
    { capabilities: { tools: {}, resources: {}, prompts: {} }, ...(instructions ? { instructions } : {}) }
  );
  // ...unchanged rest of the function
```
And both call sites in `src/mcp/transport.ts` updated to `await createMCPServer({...})`.

**Step 4: Run test to verify it passes**

Run: `node --import tsx --import ./src/test/setup-env.ts --test src/mcp/server.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/mcp/server.ts src/mcp/transport.ts src/mcp/server.test.ts
git commit -m "feat(mcp): dynamic initialize instructions for zero-memory users"
```

---

### Task 2: Welcome coverage for `get_context`'s collection picker

**Files:**
- Modify: `src/mcp/server.ts:521-533` (the `if (isPicker) { ... }` branch inside `case 'get_context':`)
- Test: `src/mcp/server.test.ts` or a new `src/mcp/welcome-coverage.test.ts`

**Step 1: Write the failing test**

```ts
test('get_context picker returns welcome memory for a zero-memory user instead of the empty picker', async () => {
  // call get_context with no topic/collection against a zero-memory test user;
  // assert result text mentions the welcome copy, not the collections picker UI
});
```

**Step 2: Run test to verify it fails**

Run: `node --import tsx --import ./src/test/setup-env.ts --test src/mcp/server.test.ts`
Expected: FAIL — the picker branch never checked memory count before this change.

**Step 3: Write minimal implementation**

Already done — `if (isPicker) { ... }` now opens with:
```ts
const welcome = await maybeCreateWelcomeMemory(userId, effectiveWsId);
if (welcome) {
  result = withResolvedWorkspace(
    toolSuccessWithUserFacing(
      welcome.content,
      { count: 1, total: 1, memories: toStructuredMemories([welcome]), message: welcome.content },
      null,
    ) as ToolSuccessResult,
    contextWs.resolved_workspace,
  );
  break;
}
// ...unchanged picker-building code runs only when welcome is null
```

**Step 4: Run test to verify it passes**

Run: `node --import tsx --import ./src/test/setup-env.ts --test src/mcp/server.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/mcp/server.ts
git commit -m "feat(mcp): welcome memory on empty get_context collection picker"
```

---

### Task 3: Welcome coverage for `list_memories`

**Files:**
- Modify: `src/mcp/server.ts:694-706` (`case 'list_memories':`, the `if (ms.length === 0) { ... }` branch)
- Test: same file as Task 2

**Step 1: Write the failing test**

```ts
test('list_memories returns welcome memory for a zero-memory user instead of the generic empty text', async () => {
  // call list_memories against a zero-memory test user; assert result does
  // NOT say "No memories stored yet" and instead returns the welcome content
});
```

**Step 2: Run test to verify it fails**

Run: `node --import tsx --import ./src/test/setup-env.ts --test src/mcp/server.test.ts`
Expected: FAIL — `list_memories`'s zero-result branch was a hardcoded string with no welcome call.

**Step 3: Write minimal implementation**

Already done:
```ts
if (ms.length === 0) {
  const welcome = await maybeCreateWelcomeMemory(userId, listEffectiveWsId);
  if (welcome) {
    result = toolSuccess(welcome.content, {
      count: 1,
      memories: toStructuredMemories([welcome]),
      message: welcome.content,
    });
  } else {
    const text = 'No memories stored yet. Use the `remember` tool to save information.';
    result = toolSuccess(text, { count: 0, memories: [], message: text });
  }
} else {
  // ...unchanged
```

**Step 4: Run test to verify it passes**

Run: `node --import tsx --import ./src/test/setup-env.ts --test src/mcp/server.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/mcp/server.ts
git commit -m "feat(mcp): welcome memory on empty list_memories"
```

---

### Task 4: Full-suite verification (outstanding)

**Files:** none (verification only)

**Step 1:** `npx tsc --noEmit` — must be clean. (Already confirmed clean once, before Task 2/3 edits — re-run after all edits land.)

**Step 2:** Full suite: `npm test`

Run: `npm test`
Expected: all suites pass. **Known risk to watch for:** `createMCPServer` now calls `getStats(userId, workforceWorkspaceId)` unconditionally on every connection (Task 1) — in the test environment this hits Supabase for real. If `getStats`'s RPC path times out against a real (possibly slow/unreachable-in-CI) Supabase instance rather than failing fast to its `fetchStatsFallback`, every test that builds a server via `createMCPServer`/`withTestClient` gets slower or hangs. A prior full run of `npm test` was still in flight past 180s when last checked — **re-run and read the actual output before claiming this task done**, per shipyard-verification. If it's genuinely hanging (not just slow), the fix is scoped to Task 1 only: `getStats` needs a short timeout/fast-fail path when called from `createMCPServer`'s connect-time check, since a slow read here delays every single connection, not just a welcome-eligible one.

**Step 3:** Manual smoke test — connect a real fresh (0-memory) test user via an actual MCP client:
- Confirm `initialize` response `instructions` contains the welcome text.
- Call `get_context` with no topic/collection → confirm welcome text, not the picker.
- Call `list_memories` → confirm welcome text, not "No memories stored yet".
- Repeat both with a user who already has memories → confirm unchanged behavior (picker/list shown normally, no welcome, no extra memory created).

**Step 4:** Human sign-off on both `TODO(copy-review)` strings (`src/mcp/welcome.ts`'s `WELCOME_MEMORY_CONTENT`, `src/mcp/server.ts`'s `instructions` text) before merging.

**Step 5: Commit** (only after Steps 1-4 pass)

```bash
git add -A
git commit -m "test(mcp): verify welcome-on-login end to end"
```
