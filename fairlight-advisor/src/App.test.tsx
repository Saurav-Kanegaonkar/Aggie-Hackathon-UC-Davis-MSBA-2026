import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "./App";

describe("Fairlight advisor workspace", () => {
  it("opens in the portfolio inbox without revealing deeper stages", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: /northstar/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /cases for review/i })).toBeInTheDocument();
    expect(screen.getAllByText(/cases in review/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /priority pipeline/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /decision lab/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /funding decision/i })).not.toBeInTheDocument();
  });

  it("shows the redesigned inbox controls and compact row metrics", async () => {
    const { container } = render(<App />);

    expect(await screen.findByRole("heading", { name: /cases for review/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /portfolio growth/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /strategic advisory/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /active review/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /revenue bucket/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^sort/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /state/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /filter/i })).not.toBeInTheDocument();

    expect(screen.getByText(/24 cases/i)).toBeInTheDocument();
    expect(screen.getAllByText(/current yield/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/investment track/i).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/^confidence$/i)).toHaveLength(0);
    expect(screen.getAllByText(/northstar score/i).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/stability index/i)).toHaveLength(0);

    const trappedScroller = Array.from(container.querySelectorAll("div")).find((element) =>
      typeof element.className === "string" && element.className.includes("overflow-y-auto"),
    );
    const viewportPinnedInbox = Array.from(container.querySelectorAll("section")).find((element) =>
      typeof element.className === "string" && element.className.includes("lg:min-h-[calc(100dvh-11.5rem)]"),
    );

    expect(trappedScroller).toBeUndefined();
    expect(viewportPinnedInbox).toBeUndefined();
  });
  it("shows the operating margin formula in the inbox metric hover copy", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("heading", { name: /cases for review/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /strategic advisory/i }));
    expect(
      screen.getAllByLabelText(/operating margin: .*operating margin = \(revenue - expenses\) \/ revenue/i).length,
    ).toBeGreaterThan(0);
  });

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
    const nestedScrollableMain = container.querySelector("main.overflow-x-hidden");

    expect(safeAreaContainer).toBeDefined();
    expect(fixedViewportBackground).toBeUndefined();
    expect(nestedScrollableMain).toBeNull();

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
    expect(screen.getAllByText(/through replay window/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/route simulator/i)).not.toBeInTheDocument();
  });
});
