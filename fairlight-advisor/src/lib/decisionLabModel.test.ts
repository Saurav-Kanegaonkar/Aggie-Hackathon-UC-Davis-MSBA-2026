import { describe, expect, it } from "vitest";

import dataset from "../data/fairlight-advisor.json";
import { buildDecisionLabModel } from "./decisionLabModel";
import type { OrganizationRecord } from "../types";

describe("buildDecisionLabModel", () => {
  it("returns chart-ready series and a compact decision status", () => {
    const model = buildDecisionLabModel(dataset.organizations[0] as OrganizationRecord);

    expect(model.financialTrajectory.length).toBeGreaterThan(4);
    expect(model.revenueComposition.length).toBe(model.financialTrajectory.length);
    expect(model.peerPosition.length).toBe(3);
    expect(model.statusTone).toMatch(/Strong|Mixed|Fragile/);
    expect(model.scoreDrivers.length).toBe(4);
  });
});
