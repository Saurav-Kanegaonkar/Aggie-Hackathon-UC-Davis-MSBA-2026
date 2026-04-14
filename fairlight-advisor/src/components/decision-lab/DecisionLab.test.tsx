import { render, screen } from "@testing-library/react";

import dataset from "../../data/fairlight-advisor.json";
import { buildDecisionLabModel } from "../../lib/decisionLabModel";
import type { OrganizationRecord } from "../../types";
import { FinancialTrajectoryPanel } from "./FinancialTrajectoryPanel";
import { RevenueCompositionPanel } from "./RevenueCompositionPanel";

describe("Decision Lab visual panels", () => {
  it("renders real chart headings and axes labels", () => {
    const model = buildDecisionLabModel(dataset.organizations[0] as OrganizationRecord);

    render(
      <>
        <FinancialTrajectoryPanel model={model} />
        <RevenueCompositionPanel model={model} />
      </>,
    );

    expect(screen.getByRole("heading", { name: /financial trajectory/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /revenue mix over time/i })).toBeInTheDocument();
    expect(screen.getAllByText(/revenue/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/program/i).length).toBeGreaterThan(0);
  });
});
