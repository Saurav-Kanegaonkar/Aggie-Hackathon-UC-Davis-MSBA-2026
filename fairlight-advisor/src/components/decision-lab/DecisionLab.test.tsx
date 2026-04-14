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
    expect(dialog.className).toContain("w-[min(92vw,1400px)]");
    expect(screen.getByRole("button", { name: /^close detail$/i })).toBeInTheDocument();
  });

  it("surfaces the consultant brief before the evidence dashboard", () => {
    const organization = dataset.organizations[0] as OrganizationRecord;

    render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    const recommendationLabel = screen.getByText(/recommended move/i);
    const evidenceHeading = screen.getByRole("heading", { name: /how this compares/i });

    expect(screen.getByText(/type of support/i)).toBeInTheDocument();
    expect(screen.getByText(/why it showed up/i)).toBeInTheDocument();
    expect(screen.getByText(/what to check next/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show decision frame/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/fairlight recommendation/i)).not.toBeInTheDocument();
    expect(recommendationLabel.compareDocumentPosition(evidenceHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it("lets mini chart cards flip to layman guidance before opening detail", async () => {
    const user = userEvent.setup();
    const organization = dataset.organizations[0] as OrganizationRecord;

    render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    await user.click(screen.getByRole("button", { name: /how to read revenue/i }));

    expect(screen.getByText(/this card isolates one financial series/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to revenue chart/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /revenue over time/i })).not.toBeInTheDocument();
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

  it("uses independent desktop columns so shorter panels do not leave dead vertical gaps", () => {
    const organization = dataset.organizations[0] as OrganizationRecord;

    const { container } = render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    const columnStack = Array.from(container.querySelectorAll("div")).find(
      (element) =>
        typeof element.className === "string" &&
        element.className.includes("xl:grid-cols-2") &&
        element.className.includes("xl:items-start"),
    );

    expect(columnStack).toBeDefined();
    expect((columnStack as HTMLElement).querySelectorAll("section").length).toBeGreaterThanOrEqual(6);
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
