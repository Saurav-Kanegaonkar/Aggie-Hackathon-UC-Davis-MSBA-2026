import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import dataset from "../data/fairlight-advisor.json";
import type { OrganizationRecord } from "../types";
import { OrganizationCard } from "./OrganizationCard";

function makeOrganization(overrides: Partial<OrganizationRecord>): OrganizationRecord {
  return {
    ...(structuredClone(dataset.organizations[0]) as OrganizationRecord),
    ...overrides,
  };
}

function renderCard(organization: OrganizationRecord) {
  render(
    <OrganizationCard
      isSelected={false}
      layoutMode="gallery"
      onSelect={vi.fn()}
      organization={organization}
    />,
  );
}

describe("OrganizationCard evidence-aware metrics", () => {
  it("prefers the latest liquid-reserve proxy for estimated yield opportunity", () => {
    renderCard(
      makeOrganization({
        actionLabel: "Underinvested Asset Base",
        netAssetsEoy: 10_000_000,
        investmentYield: 1,
        historicalFinancials: [
          {
            fiscalYear: 2023,
            revenue: 4_000_000,
            expenses: 3_900_000,
            netAssets: 9_000_000,
            liquidReserves: 1_000_000,
            operatingMargin: 2.5,
          },
          {
            fiscalYear: 2024,
            revenue: 4_200_000,
            expenses: 4_000_000,
            netAssets: 10_000_000,
            liquidReserves: 2_000_000,
            operatingMargin: 4.8,
          },
        ],
      }),
    );

    expect(screen.getByText("Estimated Yield Opportunity")).toBeInTheDocument();
    expect(screen.getByText("$80K")).toBeInTheDocument();
    expect(screen.getByText("liquid-reserve proxy vs 5%")).toBeInTheDocument();
    expect(screen.queryByText("$400K")).not.toBeInTheDocument();
  });

  it("marks the net-assets fallback as an upper-bound yield opportunity", () => {
    renderCard(
      makeOrganization({
        actionLabel: "Underinvested Asset Base",
        netAssetsEoy: 10_000_000,
        investmentYield: 1,
        historicalFinancials: [],
      }),
    );

    expect(screen.getByText("Upper-Bound Yield Opportunity")).toBeInTheDocument();
    expect(screen.getByText("$400K")).toBeInTheDocument();
    expect(screen.getByText("net assets basis; verify liquidity")).toBeInTheDocument();
  });

  it("does not call a zero-dollar basis at benchmark", () => {
    renderCard(
      makeOrganization({
        actionLabel: "Underinvested Asset Base",
        netAssetsEoy: 0,
        investmentYield: 1,
        historicalFinancials: [],
      }),
    );

    expect(screen.getByText("basis unavailable")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("At benchmark")).not.toBeInTheDocument();
  });

  it("labels concentration as the largest reported revenue category", () => {
    renderCard(
      makeOrganization({
        actionLabel: "Revenue Concentration Risk",
        revenueCompositionHistory: [
          {
            fiscalYear: 2024,
            contributionsPct: 72,
            programPct: 20,
            investmentPct: 5,
            otherPct: 3,
          },
        ],
      }),
    );

    expect(screen.getByText("Largest Revenue Category")).toBeInTheDocument();
    expect(screen.getByText("Contributions")).toBeInTheDocument();
    expect(
      screen.getByLabelText(/largest revenue category: 72%.*reported Form 990 category/i),
    ).toBeInTheDocument();
  });
});
