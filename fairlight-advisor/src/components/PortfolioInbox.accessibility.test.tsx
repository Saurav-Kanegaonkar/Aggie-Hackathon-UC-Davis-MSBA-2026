import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import dataset from "../data/fairlight-advisor.json";
import type { OrganizationRecord } from "../types";
import { PortfolioInbox } from "./PortfolioInbox";

const organizations = dataset.organizations as OrganizationRecord[];

function PortfolioInboxHarness() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sizeBucketFilter, setSizeBucketFilter] = useState("All");
  const [sortOption, setSortOption] = useState<"northstar-desc" | "northstar-asc" | "name-asc">(
    "northstar-desc",
  );
  const [stateFilter, setStateFilter] = useState("All");

  return (
    <PortfolioInbox
      layoutMode="gallery"
      onSearchQueryChange={setSearchQuery}
      onSelectOrganization={() => {}}
      onSizeBucketFilterChange={setSizeBucketFilter}
      onSortOptionChange={setSortOption}
      onStateFilterChange={setStateFilter}
      organizations={organizations}
      searchQuery={searchQuery}
      selectedId={null}
      sizeBucketFilter={sizeBucketFilter}
      sizeBucketOptions={["<500K", "500K-2M", "2M-10M", ">10M"]}
      sortOption={sortOption}
      stateFilter={stateFilter}
      stateOptions={["CA", "NY"]}
    />
  );
}

describe("Portfolio Inbox control accessibility", () => {
  it("exposes the selected and current lane tab", async () => {
    const user = userEvent.setup();
    render(<PortfolioInboxHarness />);
    const growthTab = screen.getByRole("tab", { name: /Portfolio Growth/i });
    const advisoryTab = screen.getByRole("tab", { name: /Strategic Advisory/i });

    expect(growthTab).toHaveAttribute("aria-selected", "true");
    expect(growthTab).toHaveAttribute("aria-current", "true");
    expect(growthTab).toHaveAttribute("tabindex", "0");
    expect(advisoryTab).toHaveAttribute("aria-selected", "false");
    expect(advisoryTab).not.toHaveAttribute("aria-current");
    expect(advisoryTab).toHaveAttribute("tabindex", "-1");

    await user.click(advisoryTab);

    expect(growthTab).toHaveAttribute("aria-selected", "false");
    expect(growthTab).not.toHaveAttribute("aria-current");
    expect(advisoryTab).toHaveAttribute("aria-selected", "true");
    expect(advisoryTab).toHaveAttribute("aria-current", "true");
  });

  it("supports arrow-key navigation between lane tabs", async () => {
    const user = userEvent.setup();
    render(<PortfolioInboxHarness />);
    const growthTab = screen.getByRole("tab", { name: /Portfolio Growth/i });
    const advisoryTab = screen.getByRole("tab", { name: /Strategic Advisory/i });

    growthTab.focus();
    await user.keyboard("{ArrowRight}");

    expect(advisoryTab).toHaveFocus();
    expect(advisoryTab).toHaveAttribute("aria-selected", "true");
  });

  it("exposes dropdown expansion and the current selected option", async () => {
    const user = userEvent.setup();
    render(<PortfolioInboxHarness />);
    const trigger = screen.getByRole("button", { name: "Revenue Bucket: All ranges" });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const listbox = screen.getByRole("listbox", { name: "Revenue Bucket options" });
    expect(within(listbox).getByRole("option", { name: "All ranges" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.click(within(listbox).getByRole("option", { name: /500K.*2M/i }));

    const updatedTrigger = screen.getByRole("button", { name: /Revenue Bucket:.*500K.*2M/i });
    expect(updatedTrigger).toHaveAttribute("aria-expanded", "false");

    await user.click(updatedTrigger);
    expect(screen.getByRole("option", { name: /500K.*2M/i })).toHaveAttribute("aria-selected", "true");
  });

  it("supports listbox arrow navigation, selection, and Escape focus restoration", async () => {
    const user = userEvent.setup();
    render(<PortfolioInboxHarness />);
    const trigger = screen.getByRole("button", { name: "State: All" });

    trigger.focus();
    await user.keyboard("{ArrowDown}");

    const allOption = screen.getByRole("option", { name: "All" });
    const californiaOption = screen.getByRole("option", { name: "CA" });
    expect(allOption).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(californiaOption).toHaveFocus();
    await user.keyboard("{Enter}");

    const updatedTrigger = screen.getByRole("button", { name: "State: CA" });
    expect(updatedTrigger).toHaveFocus();
    expect(updatedTrigger).toHaveAttribute("aria-expanded", "false");

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: "CA" })).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(updatedTrigger).toHaveFocus();
    expect(screen.queryByRole("listbox", { name: "State options" })).not.toBeInTheDocument();
  });
});
