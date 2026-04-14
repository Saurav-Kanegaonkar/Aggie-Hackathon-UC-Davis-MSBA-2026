import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "./App";

describe("Fairlight advisor workspace", () => {
  it("opens in the portfolio inbox without revealing deeper stages", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: /northstar/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /portfolio inbox/i })).toBeInTheDocument();
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

  it("reveals the decision lab inline after selecting an organization", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click((await screen.findAllByRole("button", { name: /open x-ray/i }))[0]);

    expect(await screen.findByRole("heading", { name: /decision lab/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /financial trajectory/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /how this compares/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /margin vs peers/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /revenue mix over time/i })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /show decision frame/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryAllByRole("heading", { name: /portfolio inbox/i })).toHaveLength(0));
    expect(screen.queryByRole("heading", { name: /what fairlight sees/i })).not.toBeInTheDocument();
  });

  it("reveals the decision frame inline without opening a separate recommendation overlay", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click((await screen.findAllByRole("button", { name: /open x-ray/i }))[0]);
    await user.click(await screen.findByRole("button", { name: /show decision frame/i }));

    expect(await screen.findByText(/current recommendation/i)).toBeInTheDocument();
    expect(screen.getByText(/why this call holds/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /funding decision/i })).not.toBeInTheDocument();
  });
});
