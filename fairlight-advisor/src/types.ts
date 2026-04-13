export type ActionLabel = "Amplify" | "Deep Review" | "Diversify" | "Stabilize";
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

export interface OrganizationRecord {
  id: string;
  ein: string;
  orgName: string;
  fiscalYear: number;
  state: string;
  nteeCategory: string;
  sizeBucket: string;
  revenueDisplay: string;
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
  benchmark: BenchmarkSummary;
  stress: StressSummary;
  distress: DistressSummary;
  analogs: AnalogRecord[];
  scenarioCards: ScenarioCard[];
  recommendation: RecommendationSummary;
}

export interface AdvisorDataset {
  generatedAt: string;
  summary: AdvisorSummary;
  organizations: OrganizationRecord[];
}
