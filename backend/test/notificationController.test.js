const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../config/database");
const notifications = require("../controllers/notificationController");

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

test("markAsRead scopes the update to the authenticated owner", async (t) => {
  const originalQuery = pool.query;
  let queryValues;
  pool.query = async (_query, values) => {
    queryValues = values;
    return { rows: [{ id: 17, is_read: true }] };
  };
  t.after(() => {
    pool.query = originalQuery;
  });

  const response = createResponse();
  await notifications.markAsRead(
    { params: { id: "17" }, user: { id: 4 } },
    response
  );

  assert.deepEqual(queryValues, [17, 4]);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.notification.id, 17);
});

test("markAsRead returns not found for a notification owned by another user", async (t) => {
  const originalQuery = pool.query;
  pool.query = async () => ({ rows: [] });
  t.after(() => {
    pool.query = originalQuery;
  });

  const response = createResponse();
  await notifications.markAsRead(
    { params: { id: "17" }, user: { id: 8 } },
    response
  );

  assert.equal(response.statusCode, 404);
  assert.equal(response.body.message, "Notification not found");
});

test("markAllAsRead updates only notifications for the authenticated user", async (t) => {
  const originalQuery = pool.query;
  let queryValues;
  pool.query = async (_query, values) => {
    queryValues = values;
    return { rowCount: 3 };
  };
  t.after(() => {
    pool.query = originalQuery;
  });

  const response = createResponse();
  await notifications.markAllAsRead({ user: { id: 12 } }, response);

  assert.deepEqual(queryValues, [12]);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.updated_count, 3);
});
