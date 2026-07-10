import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import dataset from "../../data/fairlight-advisor.json";
import { buildDecisionLabModel } from "../../lib/decisionLabModel";
import type { OrganizationRecord } from "../../types";
import { buildFlightView, buildPathView, DecisionLab, findBestReplaySetup } from "../DecisionLab";
import { FinancialTrajectoryPanel } from "./FinancialTrajectoryPanel";
import { OperatingQualityPanel } from "./OperatingQualityPanel";
import { RecoveryAnalogsPanel } from "./RecoveryAnalogsPanel";
import { RevenueCompositionPanel } from "./RevenueCompositionPanel";
import { ScoreDriversPanel } from "./ScoreDriversPanel";

const organizations = dataset.organizations as OrganizationRecord[];

function getOrganization(
  predicate: (organization: OrganizationRecord) => boolean,
  description: string,
): OrganizationRecord {
  const organization = organizations.find(predicate);
  if (!organization) {
    throw new Error(`Expected ${description} in the shipped dataset`);
  }
  return organization;
}

function getOrganizationByAction(actionLabel: OrganizationRecord["actionLabel"]): OrganizationRecord {
  return getOrganization(
    (organization) => organization.actionLabel === actionLabel,
    `a ${actionLabel} case`,
  );
}

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
    expect(dialog.className).toContain("w-[min(92vw,1220px)]");
    expect(dialog.className).toContain("h-[min(84dvh,760px)]");
    expect(screen.getByRole("button", { name: /^close detail$/i })).toBeInTheDocument();
  });

  it("locks document scroll while a detail overlay is open so the page does not fight the modal", async () => {
    const user = userEvent.setup();
    const organization = dataset.organizations[0] as OrganizationRecord;

    render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    await user.click(screen.getByRole("button", { name: /open revenue detail/i }));

    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");
    const appRoot = document.getElementById("root");
    if (appRoot) {
      expect(appRoot.style.overflow).toBe("hidden");
    }

    await user.click(screen.getByRole("button", { name: /^close detail$/i }));

    expect(document.documentElement.style.overflow).toBe("");
    expect(document.body.style.overflow).toBe("");
    if (appRoot) {
      expect(appRoot.style.overflow).toBe("");
    }
  });

  it("shows Decision Lab tabs only when they are available for the case bucket", () => {
    const optimizeOrganization = getOrganizationByAction("Underinvested Asset Base");
    const diversifyOrganization = getOrganizationByAction("Revenue Concentration Risk");
    const strengthenOrganization = getOrganizationByAction("Weak Financial Foundation");
    const diligenceOrganization = getOrganizationByAction("Needs Data Diligence");

    const { rerender } = render(
      <DecisionLab organization={optimizeOrganization} onReturnToPortfolio={() => {}} />,
    );

    expect(screen.getByRole("heading", { name: /case snapshot/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /case snapshot/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /recovery flight/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /crisis replay/i })).not.toBeInTheDocument();
    expect(screen.getByText(/score breakdown/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /recovery flight console/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /crisis replay console/i })).not.toBeInTheDocument();

    rerender(<DecisionLab organization={diversifyOrganization} onReturnToPortfolio={() => {}} />);
    expect(screen.getByRole("button", { name: /case snapshot/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /recovery flight/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /crisis replay/i })).not.toBeInTheDocument();

    rerender(<DecisionLab organization={strengthenOrganization} onReturnToPortfolio={() => {}} />);
    expect(screen.getByRole("button", { name: /case snapshot/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /recovery flight/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /crisis replay/i })).toBeInTheDocument();

    rerender(<DecisionLab organization={diligenceOrganization} onReturnToPortfolio={() => {}} />);
    expect(screen.getByRole("heading", { name: /case snapshot/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /case snapshot/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /recovery flight/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /crisis replay/i })).not.toBeInTheDocument();
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

  it("packs the snapshot pitch and key metrics into one top summary shell", () => {
    const organization = dataset.organizations[0] as OrganizationRecord;
    const { container } = render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    const summaryShell = Array.from(container.querySelectorAll("section")).find((element) =>
      typeof element.className === "string" &&
      element.className.includes("min-[1120px]:grid-cols-[1.05fr_0.95fr]"),
    );

    expect(summaryShell).toBeDefined();
    expect(within(summaryShell as HTMLElement).getAllByText(organization.actionLabel).length).toBeGreaterThan(0);
    expect(within(summaryShell as HTMLElement).getAllByText(organization.whySurfaced).length).toBeGreaterThan(0);
  });

  it("sizes the snapshot yield opportunity from the liquid-reserve proxy instead of all net assets", () => {
    const organization = dataset.organizations[0] as OrganizationRecord;

    render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    expect(screen.getAllByText(/estimated (annual )?yield opportunity/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("$702K").length).toBeGreaterThan(0);
    expect(screen.queryByText(/leaving on the table/i)).not.toBeInTheDocument();
  });

  it("stacks long sidebar action labels so they do not overlap the metric row", () => {
    const organization = dataset.organizations.find(
      (candidate) => candidate.actionLabel === "Underinvested Asset Base",
    ) as OrganizationRecord;

    render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    const actionLabel = screen.getAllByText(/^Action$/i).find((element) =>
      element.closest("div")?.textContent?.includes("Underinvested Asset Base"),
    );

    expect(actionLabel).toBeTruthy();
    expect(actionLabel?.closest("div")?.className.includes("grid-cols-1")).toBe(true);
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

    expect(screen.getAllByText(/recovered from operating losses/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/moved from losing money on operations to running a healthier surplus/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/operations were under pressure/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/operations improved materially/i).length).toBeGreaterThan(0);
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
        element.className.includes("min-[1080px]:grid-cols-[280px_minmax(0,1fr)]"),
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

  it("gives the Current Position card extra width instead of using three equal snapshot columns", () => {
    const organization = dataset.organizations[0] as OrganizationRecord;
    const { container } = render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    const snapshotTopGrid = Array.from(container.querySelectorAll("div")).find(
      (element) =>
        typeof element.className === "string" &&
        element.className.includes("min-[960px]:grid-cols-[0.95fr_1.15fr_0.9fr]"),
    );

    expect(snapshotTopGrid).toBeDefined();
  });

  it("uses finance-standard replay plan labels instead of placeholder strategy names", async () => {
    const user = userEvent.setup();
    const organization = getOrganizationByAction("Weak Financial Foundation");

    render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    await user.click(screen.getByRole("button", { name: /crisis replay/i }));

    expect(screen.getByRole("button", { name: /portfolio optimization/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reserve policy design/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /revenue diversification advisory/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^shock$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^reserve$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^diversify$/i })).not.toBeInTheDocument();
  });

  it("lets long replay plan labels wrap instead of forcing them onto one line", async () => {
    const user = userEvent.setup();
    const organization = getOrganizationByAction("Weak Financial Foundation");

    render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    await user.click(screen.getByRole("button", { name: /crisis replay/i }));

    const replayPlanButton = screen.getByRole("button", { name: /revenue diversification advisory/i });

    expect(replayPlanButton.className.includes("whitespace-nowrap")).toBe(false);
    expect(replayPlanButton.className.includes("text-left")).toBe(true);
  });

  it("renders Crisis Replay as a multi-year trajectory around the intervention year instead of a 3-point split", async () => {
    const user = userEvent.setup();
    const organization = getOrganizationByAction("Weak Financial Foundation");
    const setup = findBestReplaySetup(organization);
    const expectedStartYear = Math.max(organization.firstFilingYear, setup.interventionYear - 2);
    const expectedEndYear = Math.min(organization.latestFilingYear, setup.interventionYear + 2);

    render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    await user.click(screen.getByRole("button", { name: /crisis replay/i }));

    expect(screen.getAllByText(new RegExp(`FY${expectedStartYear}`, "i")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp(`FY${setup.interventionYear}`, "i")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp(`FY${expectedEndYear}`, "i")).length).toBeGreaterThan(0);
    expect(screen.queryByText(new RegExp(`Actual FY${setup.interventionYear + 1}`, "i"))).not.toBeInTheDocument();
    expect(screen.queryByText(/^With Northstar$/i)).not.toBeInTheDocument();
  });

  it("formats long reserve-cushion targets in years in Recovery Flight", async () => {
    const user = userEvent.setup();
    const organization = getOrganization(
      (candidate) =>
        candidate.actionLabel === "Weak Financial Foundation" &&
        candidate.analogs.some((analog) => analog.metricName.includes("runway")),
      "a Weak Financial Foundation case with runway analogs",
    );
    const longTarget = organization.analogs.find((analog) => Math.abs(analog.postValue) >= 12);
    if (!longTarget) {
      throw new Error("Expected a multi-year reserve-cushion target in the shipped dataset");
    }

    render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    await user.click(screen.getByRole("button", { name: /recovery flight/i }));

    expect(screen.getAllByText(`${(longTarget.postValue / 12).toFixed(1)} yrs`).length).toBeGreaterThan(0);
  });

  it("snaps the recovery flight slider to the three route states", async () => {
    const user = userEvent.setup();
    const organization = getOrganizationByAction("Revenue Concentration Risk");

    render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    await user.click(screen.getByRole("button", { name: /recovery flight/i }));

    const slider = screen.getByRole("slider", { name: /scrub through recovery route/i });

    expect(slider).toHaveAttribute("step", "50");
  });

  it("selects an informative concentration route for a diversification case", () => {
    const organization = getOrganizationByAction("Revenue Concentration Risk");

    const flightView = buildFlightView(organization, "concentration", "closest", 50, null);

    expect(Math.abs(flightView.selectedRoute.totalChange)).toBeGreaterThan(0.035);
    expect(flightView.selectedRoute.safetyIndex).not.toBe(0);
  });

  it("turns Recovery Flight into a compare surface with route evidence instead of vague peer-move copy", async () => {
    const user = userEvent.setup();
    const organization = getOrganizationByAction("Revenue Concentration Risk");

    render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    await user.click(screen.getByRole("button", { name: /recovery flight/i }));

    expect(screen.getAllByText(/matched start/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/peer start/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/time to safety/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/safety line/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/you @ fy/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/peer @ fy/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/peer move/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/current read/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/other recoveries/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/matched peers/i)).not.toBeInTheDocument();
  });

  it("removes the extra y-axis signal title from the Recovery Flight chart", async () => {
    const user = userEvent.setup();
    const organization = getOrganizationByAction("Revenue Concentration Risk");

    render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    await user.click(screen.getByRole("button", { name: /recovery flight/i }));

    const chartSection = screen.getByText(/from matched start/i).closest("section");

    expect(chartSection).toBeTruthy();
    expect(within(chartSection as HTMLElement).queryByText(/^Revenue mix score$/i)).not.toBeInTheDocument();
    expect(within(chartSection as HTMLElement).queryByText(/^Reserve cushion$/i)).not.toBeInTheDocument();
    expect(within(chartSection as HTMLElement).queryByText(/^Operating margin$/i)).not.toBeInTheDocument();
  });

  it("drives Recovery Flight from the selected route window instead of the org's full filing history", async () => {
    const user = userEvent.setup();
    const organization = getOrganizationByAction("Revenue Concentration Risk");
    const flightView = buildFlightView(organization, "concentration", "closest", 55, null);

    render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    await user.click(screen.getByRole("button", { name: /recovery flight/i }));

    expect(
      screen.getAllByText(new RegExp(flightView.selectedRoute.recoveryWindow, "i")).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/match start/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/finish/i).length).toBeGreaterThan(0);
    expect(
      screen.queryByText(new RegExp(`^FY${organization.firstFilingYear}$`, "i")),
    ).not.toBeInTheDocument();
  });

  it("shows comparative route metrics that explain how the selected peer recovered", async () => {
    const user = userEvent.setup();
    const organization = getOrganizationByAction("Revenue Concentration Risk");

    render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    await user.click(screen.getByRole("button", { name: /recovery flight/i }));

    expect(screen.getAllByText(/end read/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/safety reached/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/matched start/i).length).toBeGreaterThan(0);
  });

  it("changes the Snapshot focus card by bucket instead of using one generic case view", () => {
    const uabOrganization = dataset.organizations.find(
      (candidate) => candidate.actionLabel === "Underinvested Asset Base",
    ) as OrganizationRecord;
    const rcrOrganization = dataset.organizations.find(
      (candidate) => candidate.actionLabel === "Revenue Concentration Risk",
    ) as OrganizationRecord;
    const wffOrganization = dataset.organizations.find(
      (candidate) => candidate.actionLabel === "Weak Financial Foundation",
    ) as OrganizationRecord;
    const nddOrganization = dataset.organizations.find(
      (candidate) => candidate.actionLabel === "Needs Data Diligence",
    ) as OrganizationRecord;

    const { rerender } = render(<DecisionLab organization={uabOrganization} onReturnToPortfolio={() => {}} />);
    expect(screen.getAllByText(/yield opportunity/i).length).toBeGreaterThan(0);

    rerender(<DecisionLab organization={rcrOrganization} onReturnToPortfolio={() => {}} />);
    expect(screen.getByText(/concentration profile/i)).toBeInTheDocument();

    rerender(<DecisionLab organization={wffOrganization} onReturnToPortfolio={() => {}} />);
    expect(screen.getByText(/foundation read/i)).toBeInTheDocument();

    rerender(<DecisionLab organization={nddOrganization} onReturnToPortfolio={() => {}} />);
    expect(screen.getAllByText(/data completeness/i).length).toBeGreaterThan(0);
  });

  it("simplifies the Snapshot current position card to advisor action essentials", () => {
    const organization = dataset.organizations.find(
      (candidate) => candidate.actionLabel === "Weak Financial Foundation",
    ) as OrganizationRecord;

    render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    const currentPosition = screen.getByText(/current position/i).closest("section");

    expect(currentPosition).toBeTruthy();
    expect(within(currentPosition as HTMLElement).getByText(organization.actionLabel)).toBeInTheDocument();
    expect(within(currentPosition as HTMLElement).getByText(organization.recommendation.interventionType)).toBeInTheDocument();
    expect(within(currentPosition as HTMLElement).queryByText(/next move/i)).not.toBeInTheDocument();
    expect(within(currentPosition as HTMLElement).queryByText(/confidence/i)).not.toBeInTheDocument();
  });

  it("selects a replay setup whose projected path improves all tracked metrics", () => {
    const organization = getOrganizationByAction("Weak Financial Foundation");

    const setup = findBestReplaySetup(organization);
    const view = buildPathView(organization, setup.interventionYear, setup.scenarioId);

    expect(view.deltaRisk).toBeGreaterThan(0);
    expect(view.deltaMargin).toBeGreaterThan(0);
    expect(view.deltaCushion).toBeGreaterThan(0);
    expect(view.deltaDiversity).toBeGreaterThan(0);
  });

  it("uses curated D5 replay metadata when a case includes a fixed call year and historical validation trajectory", () => {
    const base = dataset.organizations.find(
      (candidate) => candidate.actionLabel === "Revenue Concentration Risk",
    ) as OrganizationRecord;

    const curatedReplayOrganization = {
      ...base,
      crisisReplay: {
        callFiscalYear: 2021,
        predictedDistressProbability: 68.3,
        predictedDistressProbabilityLogisticV2: 31.8,
        predictedDistressProbabilityXgboost: 68.3,
        riskPercentileTop: 8,
        xgboostShapExplanation:
          "The model's top drivers: declining year-over-year margin trend, rising revenue concentration, and expense growth outpacing revenue.",
        t1OutcomeSummary: "margin had crashed to -43% with expenses jumping 84% against flat revenue",
        t2OutcomeSummary: "distress remained visible a second year later",
        trajectory: [
          {
            fiscalYear: 2019,
            netAssets: 10_800_000,
            totalRevenue: 7_200_000,
            totalExpenses: 6_100_000,
            operatingMargin: 0.17,
            cashRunwayMonths: 6.4,
            largestSourcePct: 82,
            distressProbability: 42.1,
            northstarScore: 74,
          },
          {
            fiscalYear: 2020,
            netAssets: 11_500_000,
            totalRevenue: 7_100_000,
            totalExpenses: 6_000_000,
            operatingMargin: 0.15,
            cashRunwayMonths: 6.1,
            largestSourcePct: 81,
            distressProbability: 49.6,
            northstarScore: 72,
          },
          {
            fiscalYear: 2021,
            netAssets: 12_500_000,
            totalRevenue: 7_000_000,
            totalExpenses: 5_800_000,
            operatingMargin: 0.17,
            cashRunwayMonths: 6.4,
            largestSourcePct: 83,
            distressProbability: 68.3,
            northstarScore: 70,
          },
          {
            fiscalYear: 2022,
            netAssets: 9_400_000,
            totalRevenue: 7_000_000,
            totalExpenses: 10_000_000,
            operatingMargin: -0.43,
            cashRunwayMonths: 2.2,
            largestSourcePct: 84,
            distressProbability: 81.1,
            northstarScore: 46,
          },
          {
            fiscalYear: 2023,
            netAssets: 8_900_000,
            totalRevenue: 6_900_000,
            totalExpenses: 9_700_000,
            operatingMargin: -0.41,
            cashRunwayMonths: 1.9,
            largestSourcePct: 82,
            distressProbability: 78.4,
            northstarScore: 44,
          },
        ],
      },
    } as OrganizationRecord;

    const setup = findBestReplaySetup(curatedReplayOrganization);
    const view = buildPathView(curatedReplayOrganization, setup.interventionYear, setup.scenarioId);

    expect(setup.interventionYear).toBe(2021);
    expect(view.interventionYear).toBe(2021);
    expect(view.windowLabel).toBe("FY2019-2023");
    expect(view.baseline.risk).toBeCloseTo(68.3, 1);
    expect(view.actual.margin).toBeCloseTo(-43, 1);
    expect(view.narrative).toMatch(/top 8% of distress risk/i);
    expect(view.narrative).toMatch(/margin had crashed to -43%/i);
    expect(view.driversExplanation).toMatch(/declining year-over-year margin trend/i);
    expect(view.narrative).not.toMatch(/31\.8/i);
  });

  it("keeps historical fallback replay margins in percentage points", () => {
    const base = getOrganizationByAction("Weak Financial Foundation");
    const withoutCuratedReplay = { ...base, crisisReplay: undefined } as OrganizationRecord;
    const setup = findBestReplaySetup(withoutCuratedReplay);
    const view = buildPathView(withoutCuratedReplay, setup.interventionYear, setup.scenarioId);
    const observedFinancial =
      withoutCuratedReplay.historicalFinancials.find((point) => point.fiscalYear === view.observedYear) ??
      withoutCuratedReplay.historicalFinancials.at(-1);

    expect(view.actual.margin).toBeCloseTo(observedFinancial?.operatingMargin ?? base.operatingMargin, 5);

    const withoutHistory = {
      ...withoutCuratedReplay,
      historicalFinancials: [],
      revenueCompositionHistory: [],
    } as OrganizationRecord;
    const emptyView = buildPathView(
      withoutHistory,
      withoutHistory.latestFilingYear,
      withoutHistory.scenarioCards[0].id,
    );

    expect(emptyView.actual.margin).toBe(withoutHistory.operatingMargin);
  });

  it("keeps the recommendation control near the case context instead of pinning it to the rail bottom", () => {
    const organization = dataset.organizations[0] as OrganizationRecord;
    const { container } = render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    const pinnedRecommendation = Array.from(container.querySelectorAll("div")).find((element) =>
      typeof element.className === "string" &&
      element.className.includes("mt-auto") &&
      element.textContent?.match(/recommendation/i),
    );

    expect(pinnedRecommendation).toBeUndefined();
  });

  it("collapses the full-call control into a slim top utility row instead of a padded band", () => {
    const organization = dataset.organizations[0] as OrganizationRecord;

    render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    const button = screen.getByRole("button", { name: /show full call/i });
    const dock = button.closest("section");

    expect(dock).toBeTruthy();
    expect(dock?.className).toContain("px-3");
    expect(dock?.className).not.toContain("p-3");
  });

  it("locks Crisis Replay to the best intervention year instead of exposing a year scrubber", async () => {
    const user = userEvent.setup();
    const organization = getOrganizationByAction("Weak Financial Foundation");

    render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    await user.click(screen.getByRole("button", { name: /crisis replay/i }));

    expect(screen.getByText(/intervention point/i)).toBeInTheDocument();
    expect(screen.getByText(/observed next filing/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/replay intervention year/i)).not.toBeInTheDocument();
  });

  it("keeps Recovery Flight margins in percentage points and parses FY-prefixed peer windows", () => {
    const organization = getOrganization(
      (candidate) =>
        candidate.actionLabel === "Weak Financial Foundation" &&
        candidate.analogs.some((analog) => analog.metricName.includes("margin")),
      "a Weak Financial Foundation case with margin analogs",
    );

    const view = buildFlightView(organization, "margin", "closest", 50, null);

    expect(Math.max(...view.orgComparisonSeries.map((value) => Math.abs(value)))).toBeLessThan(100);
    expect(view.chartYears.every((year) => year >= 2000 && year <= 2100)).toBe(true);
    expect(view.selectedRoute.windowYears).toEqual(view.chartYears);
  });

  it("labels Crisis Replay as an illustrative scenario rather than causal validation", async () => {
    const user = userEvent.setup();
    const organization = getOrganizationByAction("Weak Financial Foundation");

    render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);
    await user.click(screen.getByRole("button", { name: /crisis replay/i }));

    expect(screen.getByText(/not a causal forecast/i)).toBeInTheDocument();
    expect(screen.getAllByText(/illustrative scenario/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^improved path$/i)).not.toBeInTheDocument();
  });

  it("distinguishes current liquidity runway from no-deficit stress scenarios", () => {
    const organization = getOrganizationByAction("Underinvested Asset Base");

    render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    expect(screen.getByText(/current liquidity runway/i)).toBeInTheDocument();
    expect(screen.getAllByText(/no modeled burn/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/liquidity runway is cash divided by expenses/i)).toBeInTheDocument();
  });

  it("shows an explicit fallback when peer margin history is unavailable", () => {
    const sparsePeerOrganization = getOrganization(
      (organization) => organization.peerOperatingMarginHistory.length === 0,
      "a case without peer operating-margin history",
    );
    const model = buildDecisionLabModel(sparsePeerOrganization);

    render(<OperatingQualityPanel model={model} />);

    expect(screen.getByText(/margin read from filing history/i)).toBeInTheDocument();
    expect(screen.getByText(/peer band unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/latest reported margin/i).parentElement?.textContent).toMatch(/[+-]?\d{1,3}\.\d%/);
    expect(screen.queryByText(/\+9650\.0%/)).not.toBeInTheDocument();
  });

  it("does not emit duplicate react key warnings for short-history charts", () => {
    const shortHistoryOrganization = organizations.reduce((shortest, organization) =>
      organization.historicalFinancials.length < shortest.historicalFinancials.length
        ? organization
        : shortest,
    );
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
