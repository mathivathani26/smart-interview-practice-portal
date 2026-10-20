const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const authRouter = require("../routes/auth");

const resetPasswordHandler = authRouter.stack
  .find((layer) => layer.route && layer.route.path === "/reset-password")
  .route.stack[0].handle;

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("validates required reset-password fields, minimum length, and matching passwords", async (t) => {
  t.mock.method(User, "updateOne", async () => {
    throw new Error("Database should not be called for invalid input");
  });
  const invalidBodies = [
    { email: "student@example.com", password: "newpassword" },
    { email: "student@example.com", password: "", confirmPassword: "" },
    { email: "not-an-email", password: "newpassword", confirmPassword: "newpassword" },
    { email: "student@example.com", password: "short", confirmPassword: "short" },
    { email: "student@example.com", password: "newpassword", confirmPassword: "different" },
  ];

  for (const body of invalidBodies) {
    const res = createResponse();
    await resetPasswordHandler({ body }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(typeof res.body.message, "string");
  }
});

test("stores a bcrypt hash for the normalized account email without returning it", async (t) => {
  let update;
  t.mock.method(User, "updateOne", async (filter, changes) => {
    assert.deepEqual(filter, { email: "student@example.com" });
    update = changes.$set;
    return { matchedCount: 1 };
  });
  const res = createResponse();

  await resetPasswordHandler({
    body: {
      email: " Student@Example.com ",
      password: "newpassword",
      confirmPassword: "newpassword",
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    message: "Password reset successfully. Please log in with your new password.",
  });
  assert.notEqual(update.passwordHash, "newpassword");
  assert.equal(await bcrypt.compare("newpassword", update.passwordHash), true);
});

test("reports when the registered email does not match an account", async (t) => {
  t.mock.method(User, "updateOne", async () => ({ matchedCount: 0 }));
  const res = createResponse();

  await resetPasswordHandler({
    body: {
      email: "unknown@example.com",
      password: "newpassword",
      confirmPassword: "newpassword",
    },
  }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { message: "No account was found with that email address" });
});
