import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "./App";

describe("Fairlight advisor workspace", () => {
  it("opens in the portfolio inbox without revealing deeper stages", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: /northstar/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /cases for review/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /portfolio inbox/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /priority pipeline/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /decision lab/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /funding decision/i })).not.toBeInTheDocument();
  });

  it("shows the redesigned inbox controls and compact row metrics", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: /cases for review/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /revenue bucket/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /filter/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^sort/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /state/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /refine/i })).not.toBeInTheDocument();

    expect(screen.getByText(/120 cases/i)).toBeInTheDocument();
    expect(screen.getAllByText(/operating margin/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/revenue mix/i).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/^confidence$/i)).toHaveLength(0);
    expect(screen.getAllByText(/northstar score/i).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/stability index/i)).toHaveLength(0);
  });

  it("shows the operating margin formula in the inbox metric hover copy", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: /cases for review/i })).toBeInTheDocument();
    expect(
      screen.getAllByLabelText(/operating margin: .*operating margin = \(revenue - expenses\) \/ revenue/i).length,
    ).toBeGreaterThan(0);
  });

  it("switches into the priority pipeline workspace", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /priority pipeline/i }));

    expect(await screen.findByRole("heading", { name: /organizations ready to move/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /priority pipeline/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/filters applied:/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /top 60 opportunities/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /matched: 257/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /revenue range: \$10m-\$75m/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /showing: top 60/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /revenue range: \$10m-\$75m/i }));
    expect(screen.getByText(/focused on the size range where fairlight can move fast/i)).toBeInTheDocument();
  }, 12000);

  it("reveals the decision lab inline after selecting an organization", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click((await screen.findAllByRole("button", { name: /open x-ray/i }))[0]);

    expect(await screen.findByRole("heading", { name: /decision lab/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /case snapshot/i })).toBeInTheDocument();
    expect(screen.getByText(/score breakdown/i)).toBeInTheDocument();
    expect(screen.getByText(/peer compare/i)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /case snapshot/i })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /recovery flight/i })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /crisis replay/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("heading", { name: /cases for review/i })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /priority pipeline/i })).not.toBeInTheDocument();

    const trappedScroller = Array.from(container.querySelectorAll("div")).find((element) =>
      typeof element.className === "string" && element.className.includes("overflow-y-auto"),
    );
    const cappedWorkspace = Array.from(container.querySelectorAll("section")).find((element) =>
      typeof element.className === "string" && element.className.includes("lg:min-h-[calc(100dvh-10.5rem)]"),
    );

    expect(trappedScroller).toBeUndefined();
    expect(cappedWorkspace).toBeUndefined();

    const safeAreaContainer = Array.from(container.querySelectorAll("div")).find((element) =>
      typeof element.className === "string" &&
      element.className.includes("pb-[max(6rem,env(safe-area-inset-bottom))]"),
    );
    const fixedViewportBackground = Array.from(container.querySelectorAll("div")).find((element) =>
      typeof element.className === "string" && element.className.includes("fixed inset-0"),
    );

    expect(safeAreaContainer).toBeDefined();
    expect(fixedViewportBackground).toBeUndefined();

    const topHalftone = container.querySelector(".northstar-halftone--top");
    const bottomHalftone = container.querySelector(".northstar-halftone--bottom");

    expect(topHalftone).not.toBeNull();
    expect(bottomHalftone).not.toBeNull();
    expect(window.getComputedStyle(topHalftone as Element).position).not.toBe("fixed");
    expect(window.getComputedStyle(bottomHalftone as Element).position).not.toBe("fixed");
  }, 12000);

  it("switches among case snapshot, recovery flight, and crisis replay modes", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click((await screen.findAllByRole("button", { name: /open x-ray/i }))[0]);

    expect(await screen.findByRole("heading", { name: /case snapshot/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /recovery flight console/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /recovery flight/i }));
    expect(await screen.findByRole("heading", { name: /recovery flight console/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /crisis replay console/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /crisis replay/i }));
    expect(await screen.findByRole("heading", { name: /crisis replay console/i })).toBeInTheDocument();
    expect(screen.getAllByText(/one filing later/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/route simulator/i)).not.toBeInTheDocument();
  });
});
