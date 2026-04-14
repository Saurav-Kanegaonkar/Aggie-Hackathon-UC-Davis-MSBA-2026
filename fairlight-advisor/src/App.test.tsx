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
  });

  it("reveals the decision lab inline after selecting an organization", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click((await screen.findAllByRole("button", { name: /open x-ray/i }))[0]);

    expect(await screen.findByRole("heading", { name: /decision lab/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /financial trajectory/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /how this compares/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /margin vs peers/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /revenue mix over time/i })).toBeInTheDocument();
    expect(await screen.findByText(/recommended move/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("heading", { name: /cases for review/i })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /priority pipeline/i })).not.toBeInTheDocument();
  });

  it("surfaces the consultant-style summary instead of the old decision frame", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click((await screen.findAllByRole("button", { name: /open x-ray/i }))[0]);

    expect(await screen.findByText(/type of support/i)).toBeInTheDocument();
    expect(screen.getByText(/why it showed up/i)).toBeInTheDocument();
    expect(screen.getByText(/what to check next/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show decision frame/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /funding decision/i })).not.toBeInTheDocument();
  });
});
