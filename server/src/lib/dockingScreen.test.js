import test from "node:test";
import assert from "node:assert/strict";
import { countMolecules, screenCost, splitPayouts } from "./dockingScreen.js";

test("counts molecules the way dock.py reads them", () => {
  assert.equal(countMolecules("CCO ethanol\r\n\n# a comment\n  \nC1CCC2=NC3=CC=CC=C3C(=C2C1)N tacrine\n"), 2);
});

test("prices a screen per molecule plus the 10% fee, in whole cents", () => {
  assert.deepEqual(screenCost(2003, 0.0005), { subtotalCents: 100, feeCents: 10, totalCents: 110 });
  assert.deepEqual(screenCost(50, 0.0005), { subtotalCents: 3, feeCents: 0, totalCents: 3 });
});

test("payouts follow each owner's docked molecules and sum exactly to the pool", () => {
  const { poolCents, payouts } = splitPayouts(new Map([["a", 600], ["b", 1400]]), 0.0005);
  assert.equal(poolCents, 100);
  assert.deepEqual(payouts, [{ ownerId: "a", cents: 30 }, { ownerId: "b", cents: 70 }]);
});

test("leftover cents from uneven splits go to the largest remainders, never overpaying", () => {
  const { poolCents, payouts } = splitPayouts(new Map([["a", 1], ["b", 1], ["c", 1]]), 0.01);
  assert.equal(poolCents, 3);
  assert.equal(payouts.reduce((sum, p) => sum + p.cents, 0), 3);

  const uneven = splitPayouts(new Map([["a", 333], ["b", 333], ["c", 334]]), 0.0005);
  assert.equal(uneven.poolCents, 50);
  assert.equal(uneven.payouts.reduce((sum, p) => sum + p.cents, 0), 50);
});

test("owners who docked nothing are left out", () => {
  assert.deepEqual(splitPayouts(new Map([["a", 0]]), 0.0005), { poolCents: 0, payouts: [] });
});
