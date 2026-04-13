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

  it("reveals the decision lab inline after selecting an organization", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click((await screen.findAllByRole("button", { name: /open x-ray/i }))[0]);

    expect(await screen.findByRole("heading", { name: /decision lab/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /what fairlight sees/i })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /prepare recommendation/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryAllByRole("heading", { name: /portfolio inbox/i })).toHaveLength(0));
    expect(screen.queryByText(/ntee_major_category/i)).not.toBeInTheDocument();
  });

  it("reveals funding decision only after preparing a recommendation", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click((await screen.findAllByRole("button", { name: /open x-ray/i }))[0]);
    await user.click(await screen.findByRole("button", { name: /prepare recommendation/i }));

    expect(await screen.findByRole("heading", { name: /funding decision/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /recommended next move/i })).toBeInTheDocument();
  });
});
