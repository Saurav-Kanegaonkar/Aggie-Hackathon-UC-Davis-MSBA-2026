import type { DecisionLabModel } from "../../lib/decisionLabModel";
import { BandChart, Legend, PanelShell } from "./ChartPrimitives";

export function OperatingQualityPanel({ model }: { model: DecisionLabModel }) {
  const labels = model.peerMarginHistory.map((point) => String(point.fiscalYear));
  const orgSeries = model.financialTrajectory
    .filter((point) => labels.includes(String(point.fiscalYear)))
    .map((point) => point.operatingMargin);

  return (
    <PanelShell
      title="Margin vs peers"
      guideTitle="How to read this panel"
      guideBullets={[
        "The dark teal line is this organization’s operating margin over time.",
        "The soft sage band shows where comparable organizations usually land, with the dashed line marking the peer midpoint.",
        "If the line is above the band, the organization is outperforming peers. If it sits below the band, the case is weaker than peer norms.",
      ]}
    >
      <Legend
        items={[
          { label: "Organization", color: "#375e67" },
          { label: "Peer median", color: "#728f7f" },
          { label: "Peer range", color: "#d6e1d9" },
        ]}
      />
      <BandChart
        labels={labels}
        organization={orgSeries}
        median={model.peerMarginHistory.map((point) => point.peerMarginMedian)}
        lowerBand={model.peerMarginHistory.map((point) => point.peerMarginQ25)}
        upperBand={model.peerMarginHistory.map((point) => point.peerMarginQ75)}
        primaryColor="#375e67"
        secondaryColor="#728f7f"
      />
    </PanelShell>
  );
}
