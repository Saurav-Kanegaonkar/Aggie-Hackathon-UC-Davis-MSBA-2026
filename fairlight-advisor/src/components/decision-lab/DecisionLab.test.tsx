import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import dataset from "../../data/fairlight-advisor.json";
import { buildDecisionLabModel } from "../../lib/decisionLabModel";
import type { OrganizationRecord } from "../../types";
import { DecisionLab } from "../DecisionLab";
import { FinancialTrajectoryPanel } from "./FinancialTrajectoryPanel";
import { OperatingQualityPanel } from "./OperatingQualityPanel";
import { RecoveryAnalogsPanel } from "./RecoveryAnalogsPanel";
import { RevenueCompositionPanel } from "./RevenueCompositionPanel";
import { ScoreDriversPanel } from "./ScoreDriversPanel";

describe("Decision Lab visual panels", () => {
  it("renders real chart headings and axes labels", () => {
    const model = buildDecisionLabModel(dataset.organizations[0] as OrganizationRecord);

    render(
      <>
        <FinancialTrajectoryPanel model={model} onOpenDetail={() => {}} />
        <RevenueCompositionPanel model={model} onOpenDetail={() => {}} />
      </>,
    );

    expect(screen.getByRole("heading", { name: /financial trajectory/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /revenue mix over time/i })).toBeInTheDocument();
    expect(screen.getAllByText(/revenue/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/program/i).length).toBeGreaterThan(0);
  });

  it("opens chart detail in the decision lab overlay instead of inside a mini-tile", async () => {
    const user = userEvent.setup();
    const organization = dataset.organizations[0] as OrganizationRecord;

    render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    await user.click(screen.getByRole("button", { name: /open revenue detail/i }));

    const overlay = screen.getByTestId("decision-lab-detail-overlay");
    const dialog = screen.getByRole("dialog", { name: /revenue over time/i });

    expect(overlay).toBeInTheDocument();
    expect(overlay.className).toContain("fixed");
    expect(dialog.className).toContain("w-[min(94vw,1500px)]");
    expect(screen.getByRole("button", { name: /^close detail$/i })).toBeInTheDocument();
  });

  it("defaults to Case Snapshot mode and hides other mode panels until selected", () => {
    const organization = dataset.organizations[0] as OrganizationRecord;

    render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    expect(screen.getByRole("button", { name: /case snapshot/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /recovery flight/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /crisis replay/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /case snapshot/i })).toBeInTheDocument();
    expect(screen.getByText(/score breakdown/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /recovery flight console/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /crisis replay console/i })).not.toBeInTheDocument();
  });

  it("uses readable axis typography in the expanded financial chart", async () => {
    const user = userEvent.setup();
    const organization = dataset.organizations[0] as OrganizationRecord;

    render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    await user.click(screen.getByRole("button", { name: /open revenue detail/i }));

    const chart = screen.getByTestId("expanded-series-chart");
    const zeroAxisLabel = within(chart).getByText("$0");
    const fiscalYearLabels = within(chart).getAllByText(/FY20\d{2}/);
    const firstGridline = chart.querySelector("line");

    expect(zeroAxisLabel.getAttribute("font-size")).toBe("28");
    expect(fiscalYearLabels.some((label) => label.getAttribute("font-size") === "22")).toBe(true);
    expect(firstGridline?.getAttribute("stroke")).toBe("rgba(67, 82, 97, 0.22)");
    expect(firstGridline?.getAttribute("stroke-width")).toBe("1.6");
  });

  it("surfaces compact evidence actions directly from the snapshot console", async () => {
    const user = userEvent.setup();
    const organization = dataset.organizations[0] as OrganizationRecord;

    render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    await user.click(screen.getByRole("button", { name: /open contributions detail/i }));

    expect(screen.getByRole("dialog", { name: /contributions share over time/i })).toBeInTheDocument();
    expect(screen.getByText(/each bar shows the share of total revenue/i)).toBeInTheDocument();
  });

  it("allows score breakdown and recovery analogs panels to grow with their content", () => {
    const organization = dataset.organizations[0] as OrganizationRecord;
    const model = buildDecisionLabModel(organization);

    render(
      <>
        <ScoreDriversPanel model={model} />
        <RecoveryAnalogsPanel organization={organization} />
      </>,
    );

    const scorePanel = screen.getByRole("heading", { name: /score breakdown/i }).closest("section");
    const analogsPanel = screen.getByRole("heading", { name: /recovery analogs/i }).closest("section");

    expect(scorePanel).not.toBeNull();
    expect(analogsPanel).not.toBeNull();

    const scorePanelHasFixedBody = Array.from((scorePanel as HTMLElement).querySelectorAll("div")).some((element) =>
      typeof element.className === "string" && element.className.includes("min-h-[23rem]"),
    );
    const analogsPanelHasFixedBody = Array.from((analogsPanel as HTMLElement).querySelectorAll("div")).some((element) =>
      typeof element.className === "string" && element.className.includes("min-h-[23rem]"),
    );

    expect(scorePanelHasFixedBody).toBe(false);
    expect(analogsPanelHasFixedBody).toBe(false);
  });

  it("explains recovery analogs using the matched recovery signal instead of raw metric jargon", () => {
    const organization = dataset.organizations[0] as OrganizationRecord;

    render(<RecoveryAnalogsPanel organization={organization} />);

    expect(screen.getAllByText(/recovered from funding concentration/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/became less dependent on a single source of money over time/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/mix score/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/highly dependent on one source/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("-0.01")).not.toBeInTheDocument();
  });

  it("renders revenue mix cards in a two-column grid on wide layouts to avoid crowding", () => {
    const model = buildDecisionLabModel(dataset.organizations[0] as OrganizationRecord);

    render(<RevenueCompositionPanel model={model} onOpenDetail={() => {}} />);

    const revenueMixPanel = screen.getByRole("heading", { name: /revenue mix over time/i }).closest("section");
    const mixGrid = Array.from((revenueMixPanel as HTMLElement).querySelectorAll("div")).find((element) =>
      typeof element.className === "string" && element.className.includes("md:grid-cols-2"),
    );

    expect(mixGrid).toBeDefined();
    expect((mixGrid as HTMLElement).className).toContain("xl:grid-cols-2");
  });

  it("gives revenue mix mini charts more room than the default spark size", () => {
    const model = buildDecisionLabModel(dataset.organizations[0] as OrganizationRecord);

    render(<RevenueCompositionPanel model={model} onOpenDetail={() => {}} />);

    const firstMixSvg = screen.getByTestId("revenue-mix-spark-program");

    expect(firstMixSvg.getAttribute("viewBox")).toBe("0 0 248 96");
    expect(firstMixSvg.getAttribute("class")).toContain("h-20");
  });

  it("lets financial and revenue-mix panels grow to fit taller card grids", () => {
    const model = buildDecisionLabModel(dataset.organizations[0] as OrganizationRecord);

    render(
      <>
        <FinancialTrajectoryPanel model={model} onOpenDetail={() => {}} />
        <RevenueCompositionPanel model={model} onOpenDetail={() => {}} />
      </>,
    );

    const financialPanel = screen.getByRole("heading", { name: /financial trajectory/i }).closest("section");
    const revenueMixPanel = screen.getByRole("heading", { name: /revenue mix over time/i }).closest("section");

    const financialHasFixedBody = Array.from((financialPanel as HTMLElement).querySelectorAll("div")).some((element) =>
      typeof element.className === "string" && element.className.includes("min-h-[23rem]"),
    );
    const revenueMixHasFixedBody = Array.from((revenueMixPanel as HTMLElement).querySelectorAll("div")).some((element) =>
      typeof element.className === "string" && element.className.includes("min-h-[23rem]"),
    );

    expect(financialHasFixedBody).toBe(false);
    expect(revenueMixHasFixedBody).toBe(false);
  });

  it("uses the rebuilt sidebar-plus-workspace shell instead of stacking equal cards", () => {
    const organization = dataset.organizations[0] as OrganizationRecord;

    const { container } = render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    const shell = Array.from(container.querySelectorAll("div")).find(
      (element) =>
        typeof element.className === "string" &&
        element.className.includes("min-[960px]:grid-cols-[202px_minmax(0,1fr)]"),
    );

    expect(shell).toBeDefined();
    expect((shell as HTMLElement).querySelectorAll("aside").length).toBe(1);
    expect((shell as HTMLElement).querySelectorAll("section").length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText(/case strip/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/recommendation mechanics/i)).not.toBeInTheDocument();
    expect((shell as HTMLElement).querySelector("aside")?.className.includes("sticky")).toBe(false);

    const oldPeerCompareLayout = Array.from(container.querySelectorAll("div")).find((element) =>
      typeof element.className === "string" && element.className.includes("grid-cols-[1fr_auto_auto]"),
    );
    const wrappingValueCells = Array.from(container.querySelectorAll("p,strong,span")).filter((element) =>
      typeof element.className === "string" && element.className.includes("break-words"),
    );

    expect(oldPeerCompareLayout).toBeUndefined();
    expect(wrappingValueCells.length).toBeGreaterThan(8);
  });

  it("shows an explicit fallback when peer margin history is unavailable", () => {
    const sparsePeerOrganization = dataset.organizations.find(
      (organization) => organization.id === "946171311-2024",
    ) as OrganizationRecord;
    const model = buildDecisionLabModel(sparsePeerOrganization);

    render(<OperatingQualityPanel model={model} />);

    expect(screen.getByText(/margin read from filing history/i)).toBeInTheDocument();
    expect(screen.getByText(/peer band unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/latest reported margin/i).parentElement?.textContent).toMatch(/[+-]?\d{1,3}\.\d%/);
    expect(screen.queryByText(/\+9650\.0%/)).not.toBeInTheDocument();
  });

  it("does not emit duplicate react key warnings for short-history charts", () => {
    const shortHistoryOrganization = dataset.organizations.find(
      (organization) => organization.id === "993105642-2024",
    ) as OrganizationRecord;
    const model = buildDecisionLabModel(shortHistoryOrganization);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <>
        <FinancialTrajectoryPanel model={model} onOpenDetail={() => {}} />
        <RevenueCompositionPanel model={model} onOpenDetail={() => {}} />
      </>,
    );

    expect(consoleError.mock.calls.some((call) => String(call[0]).includes("same key"))).toBe(false);
    consoleError.mockRestore();
  });
});
