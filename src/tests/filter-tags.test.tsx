import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FilterTags } from "@/components/story-dna/filter-tags";

function setup(overrides: Partial<React.ComponentProps<typeof FilterTags>> = {}) {
  const onAddInclude = vi.fn();
  const onRemoveInclude = vi.fn();
  const onAddExclude = vi.fn();
  const onRemoveExclude = vi.fn();
  const utils = render(
    <FilterTags
      includeTags={["Dark Fantasy"]}
      excludeTags={["moreover"]}
      onAddInclude={onAddInclude}
      onRemoveInclude={onRemoveInclude}
      onAddExclude={onAddExclude}
      onRemoveExclude={onRemoveExclude}
      {...overrides}
    />
  );
  return { ...utils, onAddInclude, onRemoveInclude, onAddExclude, onRemoveExclude };
}

describe("FilterTags", () => {
  afterEach(cleanup);

  it("renders both section headings and initial chips", () => {
    setup();
    expect(screen.getByText("Include Themes")).toBeDefined();
    expect(screen.getByText(/Slop Filter/i)).toBeDefined();
    expect(screen.getByText("Dark Fantasy")).toBeDefined();
    expect(screen.getByText("moreover")).toBeDefined();
  });

  it("typing and pressing Enter in the include input calls onAddInclude", () => {
    const { onAddInclude } = setup();
    const input = screen.getByPlaceholderText(/Add include theme/i);
    fireEvent.change(input, { target: { value: "Political Intrigue" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAddInclude).toHaveBeenCalledWith("Political Intrigue");
  });

  it("typing and pressing Enter in the exclude input calls onAddExclude", () => {
    const { onAddExclude } = setup();
    const input = screen.getByPlaceholderText(/Add banned phrase/i);
    fireEvent.change(input, { target: { value: "delve" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAddExclude).toHaveBeenCalledWith("delve");
  });

  it("clicking the remove button on an include chip calls onRemoveInclude", () => {
    const { onRemoveInclude } = setup();
    fireEvent.click(screen.getByLabelText("Remove Dark Fantasy"));
    expect(onRemoveInclude).toHaveBeenCalledWith("Dark Fantasy");
  });

  it("clicking the remove button on an exclude chip calls onRemoveExclude", () => {
    const { onRemoveExclude } = setup();
    fireEvent.click(screen.getByLabelText("Remove moreover"));
    expect(onRemoveExclude).toHaveBeenCalledWith("moreover");
  });

  it("tag inputs are accessibly associated with their section headings via aria-labelledby", () => {
    setup();
    const includeInput = screen.getByPlaceholderText(/Add include theme/i);
    const excludeInput = screen.getByPlaceholderText(/Add banned phrase/i);
    // The inputs carry aria-labelledby pointing to the h4 IDs set in FilterTags.
    expect(includeInput.getAttribute("aria-labelledby")).toBe(
      "filter-tags-include-heading"
    );
    expect(excludeInput.getAttribute("aria-labelledby")).toBe(
      "filter-tags-exclude-heading"
    );
  });
});
