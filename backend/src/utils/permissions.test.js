import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { can, canAny, canEditAccount, canManageAccount, isFullAdmin, isPlatformStaff, normalizePermissions } from "./permissions.js";

describe("subadmin permissions", () => {
  it("lets a full admin do every function", () => {
    const admin = { role: "admin", permissions: [] };
    assert.equal(isFullAdmin(admin), true);
    assert.equal(can(admin, "sessions.view"), true);
    assert.equal(can(admin, "translators.create"), true);
  });

  it("lets a subadmin use only the given functions", () => {
    const sub = { role: "subadmin", permissions: ["sessions.view", "translators.create"] };
    assert.equal(isPlatformStaff(sub), true);
    assert.equal(can(sub, "sessions.view"), true);
    assert.equal(can(sub, "translators.create"), true);
    assert.equal(can(sub, "billing.manage"), false);
    assert.equal(canAny(sub, ["billing.manage", "sessions.view"]), true);
  });

  it("drops unknown permission ids", () => {
    assert.deepEqual(normalizePermissions(["sessions.view", "nope", "translators.create"]), [
      "sessions.view",
      "translators.create",
    ]);
  });

  it("keeps subadmins off admin and other staff accounts", () => {
    const sub = { role: "subadmin", permissions: ["translators.manage", "hospitals.manage"] };
    assert.equal(canManageAccount(sub, { role: "translator" }), true);
    assert.equal(canManageAccount(sub, { role: "hospital_admin" }), true);
    assert.equal(canManageAccount(sub, { role: "admin" }), false);
    assert.equal(canManageAccount(sub, { role: "subadmin" }), false);
  });

  it("lets a subadmin who can add translators also edit them, but not delete them", () => {
    const sub = { role: "subadmin", permissions: ["translators.create"] };
    assert.equal(canEditAccount(sub, { role: "translator" }), true);
    assert.equal(canManageAccount(sub, { role: "translator" }), false);
    assert.equal(canManageAccount(sub, { role: "hospital_admin" }), false);
  });
});
