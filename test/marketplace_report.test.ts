import test from "node:test";
import assert from "node:assert/strict";
import { chooseArchive, renderMarkdown } from "../src/marketplace_report.ts";

test("a complete marketplace snapshot is selected for archiving", () => {
  const input = {
    seller: { name: "Northwind Market", assets: ["catalog.csv"] },
    buyerUpdates: ["Delivery window confirmed"],
    orders: [{ id: "ORD-104", item: "Pour-over set", status: "handoff-ready" }]
  };
  assert.equal(chooseArchive(input), "archive");
  assert.match(renderMarkdown(input), /ORD-104/);
});
