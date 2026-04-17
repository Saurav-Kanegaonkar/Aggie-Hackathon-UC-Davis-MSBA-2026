import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import dataset from "../../data/fairlight-advisor.json";
import { buildDecisionLabModel } from "../../lib/decisionLabModel";
import type { OrganizationRecord } from "../../types";
import { buildPathView, DecisionLab, findBestReplaySetup } from "../DecisionLab";
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
        element.className.includes("min-[960px]:grid-cols-[220px_minmax(0,1fr)]"),
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
    const organization = dataset.organizations.find(
      (candidate) => candidate.id === "800143565-2024",
    ) as OrganizationRecord;

    render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    await user.click(screen.getByRole("button", { name: /crisis replay/i }));

    expect(screen.getByRole("button", { name: /financial resilience x-ray/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reserve policy design/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /revenue diversification advisory/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^shock$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^reserve$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^diversify$/i })).not.toBeInTheDocument();
  });

  it("renders Crisis Replay as a multi-year trajectory around the intervention year instead of a 3-point split", async () => {
    const user = userEvent.setup();
    const organization = dataset.organizations.find(
      (candidate) => candidate.id === "800143565-2024",
    ) as OrganizationRecord;
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
    const organization = dataset.organizations.find(
      (candidate) => candidate.id === "800143565-2024",
    ) as OrganizationRecord;

    render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    await user.click(screen.getByRole("button", { name: /recovery flight/i }));

    expect(screen.getAllByText(/5\.8 yrs/i).length).toBeGreaterThan(0);
  });

  it("turns Recovery Flight into a compare surface with route evidence instead of vague peer-move copy", async () => {
    const user = userEvent.setup();
    const organization = dataset.organizations.find(
      (candidate) => candidate.id === "800143565-2024",
    ) as OrganizationRecord;

    render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    await user.click(screen.getByRole("button", { name: /recovery flight/i }));

    expect(screen.getAllByText(/start gap/i).length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText(/time to safety/i).length).toBeGreaterThanOrEqual(3);
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
    const organization = dataset.organizations.find(
      (candidate) => candidate.id === "800143565-2024",
    ) as OrganizationRecord;

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
    const organization = dataset.organizations.find(
      (candidate) => candidate.id === "800143565-2024",
    ) as OrganizationRecord;

    render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    await user.click(screen.getByRole("button", { name: /recovery flight/i }));

    expect(screen.getAllByText(/fy2017-2020/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/match start/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/finish/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^FY2014$/i)).not.toBeInTheDocument();
  });

  it("shows comparative route metrics that explain how the selected peer recovered", async () => {
    const user = userEvent.setup();
    const organization = dataset.organizations.find(
      (candidate) => candidate.id === "800143565-2024",
    ) as OrganizationRecord;

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
    expect(screen.getByText(/yield opportunity/i)).toBeInTheDocument();

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
    const organization = dataset.organizations.find(
      (candidate) => candidate.id === "800143565-2024",
    ) as OrganizationRecord;

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
    const organization = dataset.organizations.find(
      (candidate) => candidate.id === "800143565-2024",
    ) as OrganizationRecord;

    render(<DecisionLab organization={organization} onReturnToPortfolio={() => {}} />);

    await user.click(screen.getByRole("button", { name: /crisis replay/i }));

    expect(screen.getByText(/intervention point/i)).toBeInTheDocument();
    expect(screen.getByText(/observed next filing/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/replay intervention year/i)).not.toBeInTheDocument();
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
