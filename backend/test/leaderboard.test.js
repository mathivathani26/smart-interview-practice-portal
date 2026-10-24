const test = require("node:test");
const assert = require("node:assert/strict");
const Session = require("../models/Session");
const Company = require("../models/Company");
const leaderboardRouter = require("../routes/leaderboard");

const leaderboardHandler = leaderboardRouter.stack
  .find((layer) => layer.route && layer.route.path === "/")
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

test("leaderboard excludes admin users before ranking students", async (t) => {
  const company = { _id: "company-id", name: "Test Co" };
  const sessions = [
    { user: { _id: "admin-id", firstName: "Admin", lastName: "Account", role: "admin" }, total_score: 100 },
    { user: { _id: "student-one", firstName: "First", lastName: "Student", role: "student" }, total_score: 80 },
    { user: { _id: "student-one", firstName: "First", lastName: "Student", role: "student" }, total_score: 75 },
    { user: { _id: "student-two", firstName: "Second", lastName: "Student", role: "student" }, total_score: 70 },
  ];

  t.mock.method(Company, "findById", async (id) => {
    assert.equal(id, "company-id");
    return company;
  });
  t.mock.method(Session, "find", (filter) => {
    assert.deepEqual(filter, { company: "company-id", completed_at: { $ne: null } });
    return {
      populate(options) {
        assert.deepEqual(options, {
          path: "user",
          select: "firstName lastName role",
          match: { role: "student" },
        });
        return this;
      },
      sort() {
        return Promise.resolve(sessions);
      },
    };
  });

  const res = createResponse();
  await leaderboardHandler({ query: { companyId: "company-id" }, userId: "student-two" }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.totalParticipants, 2);
  assert.equal(res.body.myRank, 2);
  assert.deepEqual(res.body.leaderboard, [
    { rank: 1, name: "First Student", score: 80, isMe: false },
    { rank: 2, name: "Second Student", score: 70, isMe: true },
  ]);
});
