import { render, screen } from "@testing-library/react";

import data from "../data/priority-pipeline.json";
import { PriorityPipeline } from "./PriorityPipeline";

describe("Priority Pipeline", () => {
  it("fills the available workspace width, keeps only the top summary strip, and uses page-sticky headers", () => {
    const { container } = render(<PriorityPipeline data={data} />);

    expect(screen.getByText(/organizations ready to move/i)).toBeInTheDocument();
    expect(screen.getByText(/top 60 opportunities/i)).toBeInTheDocument();
    expect(screen.getAllByText(/plateaued/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^stable$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^matched$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^showing$/i)).not.toBeInTheDocument();

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("w-full");
    expect(screen.queryByTestId("priority-pipeline-table-scroll")).not.toBeInTheDocument();
    expect(screen.getByTestId("priority-pipeline-sticky-header").className).toContain("sticky");
    expect(screen.getByTestId("priority-pipeline-sticky-header").className).toContain("top-0");
  });
});
