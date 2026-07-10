import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { DecisionLabDetailOverlay } from "./ChartPrimitives";

function DetailOverlayHarness() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div data-testid="background-content">
        <button type="button" onClick={() => setOpen(true)}>
          Open detail
        </button>
        <button type="button">Background action</button>
      </div>

      {open ? (
        <DecisionLabDetailOverlay
          detail={{
            title: "Revenue detail",
            content: (
              <>
                <button type="button">First detail action</button>
                <button type="button">Last detail action</button>
              </>
            ),
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

describe("Decision Lab detail overlay accessibility", () => {
  it("moves initial focus to the modal close control", async () => {
    const user = userEvent.setup();
    render(<DetailOverlayHarness />);

    await user.click(screen.getByRole("button", { name: "Open detail" }));

    expect(screen.getByRole("button", { name: "Close detail" })).toHaveFocus();
  });

  it("closes on Escape and restores focus to the invoking control", async () => {
    const user = userEvent.setup();
    render(<DetailOverlayHarness />);
    const opener = screen.getByRole("button", { name: "Open detail" });

    await user.click(opener);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Revenue detail" })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("wraps keyboard focus within the modal", async () => {
    const user = userEvent.setup();
    render(<DetailOverlayHarness />);

    await user.click(screen.getByRole("button", { name: "Open detail" }));
    const closeButton = screen.getByRole("button", { name: "Close detail" });
    const lastAction = screen.getByRole("button", { name: "Last detail action" });

    await user.tab({ shift: true });
    expect(lastAction).toHaveFocus();

    await user.tab();
    expect(closeButton).toHaveFocus();
  });

  it("makes background content inert only while the modal is open", async () => {
    const user = userEvent.setup();
    render(<DetailOverlayHarness />);
    const background = screen.getByTestId("background-content");

    await user.click(screen.getByRole("button", { name: "Open detail" }));

    expect(background).toHaveAttribute("inert");
    expect(background).toHaveAttribute("aria-hidden", "true");

    await user.click(screen.getByRole("button", { name: "Close detail" }));

    expect(background).not.toHaveAttribute("inert");
    expect(background).not.toHaveAttribute("aria-hidden");
  });
});
