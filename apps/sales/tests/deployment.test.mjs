import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../../..");
const configs = ["vercel.json", "apps/nrcs/vercel.json", "apps/sales/vercel.json"].map(file => JSON.parse(readFileSync(join(root, file), "utf8")));
// These are the literal pathspecs used by the checked-in commands; assert them
// before exercising them against commits (including a multi-commit change).
const scopes = [[".", ":(exclude)apps/**"], [".", "../../supabase"], ["."]];
test("app deployment pathspecs isolate committed changes and retain shared dependencies", () => {
  assert.equal(configs[0].ignoreCommand, 'git diff --quiet "${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}" HEAD -- . \':(exclude)apps/**\'');
  assert.equal(configs[1].ignoreCommand, 'git diff --quiet "${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}" HEAD -- . ../../supabase');
  assert.equal(configs[2].ignoreCommand, 'git diff --quiet "${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}" HEAD -- .');
  const fixture = mkdtempSync(join(tmpdir(), "krtr-sales-scope-"));
  const tree = join(fixture, "tree"); mkdirSync(tree);
  // Explicit metadata location avoids touching the real checkout's Git data.
  const metadata = join(fixture, "git-data");
  function git(args, cwd = tree) {
    return spawnSync("git", ["--git-dir=" + metadata, "--work-tree=" + tree, ...args], { cwd, encoding: "utf8" });
  }
  function checked(args) { const result = git(args); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); }
  checked(["init"]);
  const paths = ["app/page.tsx", "apps/nrcs/app/page.tsx", "apps/sales/app/page.tsx", "apps/calendar/_ingest/app/page.tsx", "supabase/schema.sql", "apps/sales/supabase/migrations/test.sql"];
  for (const file of paths) { const target = join(tree, file); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, "initial"); }
  checked(["add", "."]);
  function commit() { checked(["-c", "user.name=Scope test", "-c", "user.email=scope@example.invalid", "commit", "-m", "Fixture"]); }
  commit();
  const directories = [tree, join(tree, "apps/nrcs"), join(tree, "apps/sales")];
  const expected = [[1,0,0], [0,1,0], [0,0,1], [0,0,0], [1,1,0], [0,0,1]];
  for (const [index,file] of paths.entries()) {
    const base = checked(["rev-parse", "HEAD"]);
    writeFileSync(join(tree, file), "change"); checked(["add", "."]); commit();
    for (const [app,cwd] of directories.entries()) assert.equal(git(["diff", "--quiet", base, "HEAD", "--", ...scopes[app]], cwd).status, expected[index][app], file);
    // Restore with a new commit, rather than changing repository history.
    writeFileSync(join(tree, file), "initial"); checked(["add", "."]); commit();
  }
  const base = checked(["rev-parse", "HEAD"]);
  writeFileSync(join(tree, "apps/sales/app/page.tsx"), "sales change"); checked(["add", "."]); commit();
  writeFileSync(join(tree, "apps/nrcs/app/page.tsx"), "nrcs change"); checked(["add", "."]); commit();
  for (const [app,cwd] of directories.entries()) assert.equal(git(["diff", "--quiet", base, "HEAD", "--", ...scopes[app]], cwd).status, [0,1,1][app]);
  for (const [app,cwd] of directories.entries()) {
    assert.equal(git(["diff", "--quiet", "HEAD", "HEAD", "--", ...scopes[app]], cwd).status, 0);
    assert.ok(git(["diff", "--quiet", "unavailable-history", "HEAD", "--", ...scopes[app]], cwd).status > 0);
  }
});
