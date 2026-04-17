export type ActionLabel = "Underinvested Asset Base" | "Needs Data Diligence" | "Revenue Concentration Risk" | "Weak Financial Foundation";
export type DistressTier = "High" | "Medium" | "Low";
export type ConfidenceTier = "High" | "Medium" | "Low";

export interface AdvisorSummary {
  totalOrganizations: number;
  distressBaselineRate: number;
  countsByAction: Record<string, number>;
  countsByDistress: Record<string, number>;
  countsByConfidence: Record<string, number>;
  states: string[];
}

export interface BenchmarkSummary {
  headline: string;
  operatingMarginGap: string;
  operatingRunwayGap: string;
  diversificationGap: string;
  peerCohort: string;
  benchmarkRule: string;
}

export interface StressSummary {
  headline: string;
  largestSource: string;
  largestSourcePct: number;
  severity25: string;
  severity50: string;
  burnMonths25: number | null;
  burnMonths50: number | null;
}

export interface DistressSummary {
  headline: string;
  tier: DistressTier;
  probability: number;
  baseline: number;
}

export interface AnalogRecord {
  orgName: string;
  state: string;
  metricName: string;
  preValue: number;
  postValue: number;
  recoveryWindow: string;
}

export interface ScenarioCard {
  id: string;
  title: string;
  thesis: string;
  effectOnRisk: string;
  effectOnRecommendation: string;
}

export interface RecommendationSummary {
  status: string;
  interventionType: string;
  rationale: string;
  caveats: string[];
  exportSummary: string;
}

export interface HistoricalFinancialPoint {
  fiscalYear: number;
  revenue: number;
  expenses: number;
  netAssets: number;
  liquidReserves: number;
  operatingMargin: number;
}

export interface PeerOperatingMarginPoint {
  fiscalYear: number;
  peerMarginQ25: number;
  peerMarginMedian: number;
  peerMarginQ75: number;
}

export interface RevenueCompositionPoint {
  fiscalYear: number;
  contributionsPct: number;
  programPct: number;
  investmentPct: number;
  otherPct: number;
}

export interface CrisisReplayTrajectoryPoint {
  fiscalYear: number;
  netAssets: number;
  totalRevenue: number;
  totalExpenses: number;
  operatingMargin: number;
  cashRunwayMonths: number;
  largestSourcePct: number;
  distressProbability?: number | null;
  northstarScore?: number | null;
}

export interface CrisisReplaySummary {
  callFiscalYear: number;
  predictedDistressProbability: number;
  predictedDistressProbabilityLogisticV2?: number | null;
  predictedDistressProbabilityXgboost?: number | null;
  riskPercentileTop?: number | null;
  xgboostShapExplanation?: string | null;
  netAssetsAtCall?: number | null;
  revenueAtCall?: number | null;
  marginAtCall?: number | null;
  runwayAtCall?: number | null;
  t1OutcomeSummary?: string;
  t2OutcomeSummary?: string;
  demoStrengthScore?: number | null;
  trajectory: CrisisReplayTrajectoryPoint[];
}

export interface ScoreDrivers {
  distressProtection: number;
  operatingMargin: number;
  revenueMix: number;
  evidenceQuality: number;
}

export interface OrganizationRecord {
  id: string;
  ein: string;
  orgName: string;
  fiscalYear: number;
  filingYearsObserved: number;
  firstFilingYear: number;
  latestFilingYear: number;
  state: string;
  nteeCategory: string;
  sizeBucket: string;
  revenueAmount: number | null;
  revenueDisplay: string;
  netAssetsEoy: number | null;
  investmentYield: number;
  dataCompletenessScore: number;
  consecutiveYearsWithInvestmentIncome: number;
  operatingRunwayMonths: number;
  operatingMargin: number;
  revenueDiversificationIndex: number;
  actionLabel: ActionLabel;
  distressTier: DistressTier;
  distressProbability: number;
  distressBaseline: number;
  distressLabel: string;
  decisionReason: string;
  whySurfaced: string;
  confidenceTier: ConfidenceTier;
  confidenceNote: string;
  trendDirection: string;
  memoText: string;
  historicalFinancials: HistoricalFinancialPoint[];
  peerOperatingMarginHistory: PeerOperatingMarginPoint[];
  revenueCompositionHistory: RevenueCompositionPoint[];
  scoreDrivers: ScoreDrivers;
  benchmark: BenchmarkSummary;
  stress: StressSummary;
  distress: DistressSummary;
  analogs: AnalogRecord[];
  scenarioCards: ScenarioCard[];
  recommendation: RecommendationSummary;
  crisisReplay?: CrisisReplaySummary;
}

export interface AdvisorDataset {
  generatedAt: string;
  summary: AdvisorSummary;
  organizations: OrganizationRecord[];
}

export interface PipelineOrganizationRecord {
  id: string;
  ein: string;
  orgName: string;
  state: string;
  totalRevenue: number;
  revenueDisplay: string;
  rdi: number;
  rdiLabel: string;
  operatingMargin: number;
  marginTrend: string;
  sector: string;
  fiscalYear: number;
  confidenceTier: ConfidenceTier;
  priorityScore: number;
}

export interface PriorityPipelineDataset {
  generatedAt: string;
  totalMatched: number;
  criteria: {
    action: string;
    revenueMin: number;
    revenueMax: number;
    rdiMax: number;
    trend: string;
  };
  organizations: PipelineOrganizationRecord[];
}
