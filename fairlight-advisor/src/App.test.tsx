import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "./App";
import dataset from "./data/fairlight-advisor-public.json";

const portfolioGrowthCaseCount = dataset.organizations.filter(
  (organization) => organization.actionLabel === "Underinvested Asset Base",
).length;

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("Fairlight advisor workspace", () => {
  it("opens in the portfolio inbox without revealing deeper stages", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: /northstar/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /cases for review/i })).toBeInTheDocument();
    expect(screen.getByText(`${portfolioGrowthCaseCount} cases`)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /priority pipeline/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /decision lab/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /funding decision/i })).not.toBeInTheDocument();
  });

  it("shows the redesigned inbox controls and compact row metrics", async () => {
    const { container } = render(<App />);

    expect(await screen.findByRole("heading", { name: /cases for review/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /portfolio growth/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /strategic advisory/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /active review/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /revenue bucket/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^sort/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /state/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /filter/i })).not.toBeInTheDocument();

    expect(screen.getByText(`${portfolioGrowthCaseCount} cases`)).toBeInTheDocument();
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
    await user.click(screen.getByRole("tab", { name: /strategic advisory/i }));
    expect(
      screen.getAllByLabelText(/operating margin: .*operating margin = \(revenue - expenses\) \/ revenue/i).length,
    ).toBeGreaterThan(0);
  });

  it("reveals the decision lab inline after selecting an organization", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click((await screen.findAllByRole("button", { name: /open case/i }))[0]);

    expect(await screen.findByRole("heading", { name: /decision lab/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /case snapshot/i })).toBeInTheDocument();
    expect(screen.getByText(/score breakdown/i)).toBeInTheDocument();
    expect(screen.getByText(/peer compare/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /case snapshot/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /recovery flight/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /crisis replay/i })).not.toBeInTheDocument();
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
    const nestedScrollableMain = container.querySelector("main.overflow-y-auto, main.overflow-auto");

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

    const strengthenOrganization = dataset.organizations.find(
      (organization) => organization.actionLabel === "Weak Financial Foundation",
    );
    if (!strengthenOrganization) {
      throw new Error("Expected a Weak Financial Foundation case in the shipped dataset");
    }

    await user.click(await screen.findByRole("tab", { name: /active review/i }));
    await user.click(
      await screen.findByRole("button", {
        name: `Open case for ${strengthenOrganization.orgName}`,
      }),
    );

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

  it("preserves a shared initial URL and removes only org when returning to the portfolio", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/?source=recruiter&org=first#case");
    render(<App />);

    expect(await screen.findByRole("heading", { name: /decision lab/i })).toBeInTheDocument();
    expect(window.location.search).toBe("?source=recruiter&org=first");
    expect(window.location.hash).toBe("#case");

    await user.click(screen.getByRole("button", { name: /inbox/i }));
    expect(await screen.findByRole("heading", { name: /cases for review/i })).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("source")).toBe("recruiter");
    expect(new URLSearchParams(window.location.search).has("org")).toBe(false);
    expect(window.location.hash).toBe("#case");
  });

  it("syncs organization selection with browser back and forward history", async () => {
    const user = userEvent.setup();
    const organization = dataset.organizations.find(
      (candidate) => candidate.actionLabel === "Underinvested Asset Base",
    );
    if (!organization) throw new Error("Expected a Portfolio Growth case in the public dataset");
    window.history.replaceState(null, "", "/?source=recruiter#portfolio");
    render(<App />);

    await user.click(
      await screen.findByRole("button", {
        name: `Open case for ${organization.orgName}`,
      }),
    );
    expect(new URLSearchParams(window.location.search).get("org")).toBe(organization.id);
    expect(new URLSearchParams(window.location.search).get("source")).toBe("recruiter");
    expect(window.location.hash).toBe("#portfolio");

    window.history.back();
    await waitFor(() => expect(new URLSearchParams(window.location.search).has("org")).toBe(false));
    expect(await screen.findByRole("heading", { name: /cases for review/i })).toBeInTheDocument();

    window.history.forward();
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("org")).toBe(organization.id));
    expect(await screen.findByRole("heading", { name: /decision lab/i })).toBeInTheDocument();
  });

  it("keeps recruiter-facing project context compact until requested", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("heading", { name: /cases for review/i })).toBeInTheDocument();
    const summary = screen.getByText(/about the project/i).closest("summary");
    const disclosure = summary?.closest("details");

    expect(summary).not.toBeNull();
    expect(disclosure).not.toHaveAttribute("open");
    await user.click(summary as HTMLElement);

    expect(disclosure).toHaveAttribute("open");
    expect(screen.getByRole("heading", { name: /builder and team/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /irs form 990 scope/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /methodology/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /limitations/i })).toBeInTheDocument();
    expect(screen.getByText(/names, EINs, exact amounts, and record ordering are transformed/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /project repository/i })).not.toBeInTheDocument();
  });
});
