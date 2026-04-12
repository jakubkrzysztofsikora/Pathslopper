import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ChoicePane } from "@/components/play/choice-pane";
import type { DirectorOutput } from "@/lib/orchestration/director/director";

afterEach(cleanup);

describe("ChoicePane", () => {
  it("renders choice buttons for each choice", () => {
    const choices: DirectorOutput["choices"] = [
      { index: 0, label: "Attack the goblin" },
      { index: 1, label: "Flee to safety" },
    ];
    render(
      <ChoicePane
        choices={choices}
        phase="awaiting-choice"
        onChoice={vi.fn()}
        onFreeText={vi.fn()}
      />
    );
    expect(screen.getByText("Attack the goblin")).toBeDefined();
    expect(screen.getByText("Flee to safety")).toBeDefined();
  });

  it("clicking a choice button calls onChoice with correct index", async () => {
    const onChoice = vi.fn().mockResolvedValue(undefined);
    const choices: DirectorOutput["choices"] = [
      { index: 0, label: "Option A" },
      { index: 1, label: "Option B" },
    ];
    render(
      <ChoicePane
        choices={choices}
        phase="awaiting-choice"
        onChoice={onChoice}
        onFreeText={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("Option B"));
    await waitFor(() => expect(onChoice).toHaveBeenCalledWith(1));
  });

  it("renders free-text textarea", () => {
    render(
      <ChoicePane
        choices={[]}
        phase="narrating"
        onChoice={vi.fn()}
        onFreeText={vi.fn()}
      />
    );
    const textarea = screen.getByRole("textbox");
    expect(textarea).toBeDefined();
  });

  it("submitting free-text calls onFreeText with input value", async () => {
    const onFreeText = vi.fn().mockResolvedValue(undefined);
    render(
      <ChoicePane
        choices={[]}
        phase="narrating"
        onChoice={vi.fn()}
        onFreeText={onFreeText}
      />
    );
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "I look around carefully" } });

    // t("play.choiceSubmit") = "Wyślij akcję"
    const submitBtn = screen.getByRole("button", { name: /Wyślij akcję/i });
    fireEvent.click(submitBtn);

    await waitFor(() =>
      expect(onFreeText).toHaveBeenCalledWith("I look around carefully")
    );
  });

  it("does not submit free-text when textarea is empty", async () => {
    const onFreeText = vi.fn().mockResolvedValue(undefined);
    render(
      <ChoicePane
        choices={[]}
        phase="narrating"
        onChoice={vi.fn()}
        onFreeText={onFreeText}
      />
    );
    const submitBtn = screen.getByRole("button");
    fireEvent.click(submitBtn);
    // Should not have been called with empty text
    expect(onFreeText).not.toHaveBeenCalled();
  });

  it("clears textarea after successful free-text submission", async () => {
    const onFreeText = vi.fn().mockResolvedValue(undefined);
    render(
      <ChoicePane
        choices={[]}
        phase="narrating"
        onChoice={vi.fn()}
        onFreeText={onFreeText}
      />
    );
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "My action" } });
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(textarea.value).toBe(""));
  });

  it("renders no choice buttons when choices array is empty", () => {
    render(
      <ChoicePane
        choices={[]}
        phase="narrating"
        onChoice={vi.fn()}
        onFreeText={vi.fn()}
      />
    );
    // Only the submit button should exist (no choice buttons)
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
  });
});
