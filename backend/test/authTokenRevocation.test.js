const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const requireAuth = require("../middleware/auth");
const authRouter = require("../routes/auth");

const logoutHandler = authRouter.stack
  .find((layer) => layer.route && layer.route.path === "/logout")
  .route.stack.slice(-1)[0].handle;

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

test("authentication rejects tokens revoked by a newer token version", async (t) => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "unit-test-signing-secret";
  t.after(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });
  t.mock.method(User, "findById", async () => ({ _id: "user-id", role: "student", tokenVersion: 2 }));

  const token = jwt.sign({ userId: "user-id", tokenVersion: 1 }, process.env.JWT_SECRET);
  const res = createResponse();
  let nextCalled = false;

  await requireAuth({ headers: { authorization: `Bearer ${token}` } }, res, () => { nextCalled = true; });

  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test("logout increments the account token version", async (t) => {
  t.mock.method(User, "findByIdAndUpdate", async (userId, update) => {
    assert.equal(userId, "user-id");
    assert.deepEqual(update, { $inc: { tokenVersion: 1 } });
    return { _id: userId };
  });

  const res = createResponse();
  await logoutHandler({ userId: "user-id" }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { message: "Logged out successfully" });
});
