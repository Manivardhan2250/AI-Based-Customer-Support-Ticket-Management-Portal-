const test = require("node:test");
const assert = require("node:assert/strict");
const { suggestWithRules } = require("../services/suggestionService");

const categories = [
  { id: 1, name: "Technical" },
  { id: 2, name: "Billing" },
  { id: 3, name: "Account" },
  { id: 4, name: "Order" },
  { id: 5, name: "General" },
];

test("suggests the best matching category and critical priority", () => {
  const result = suggestWithRules(
    "Urgent billing issue: my payment was charged twice",
    categories
  );

  assert.equal(result.category_id, 2);
  assert.equal(result.priority, "Critical");
  assert.equal(result.provider, "rules");
});

test("uses a reviewable default when no category words match", () => {
  const result = suggestWithRules("Please help me with this request", categories);

  assert.equal(result.category_id, null);
  assert.equal(result.priority, "Medium");
  assert.match(result.rationale, /No clear category/);
});
