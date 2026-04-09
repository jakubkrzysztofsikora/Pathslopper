"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface TagInputProps {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  placeholder?: string;
  className?: string;
  chipClassName?: string;
}

export function TagInput({
  tags,
  onAdd,
  onRemove,
  placeholder = "Add tag...",
  className,
  chipClassName,
}: TagInputProps) {
  const [inputValue, setInputValue] = React.useState("");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && inputValue.trim()) {
      e.preventDefault();
      const tag = inputValue.trim().replace(/,$/, "");
      if (tag) {
        onAdd(tag);
        setInputValue("");
      }
    }
    if (e.key === "Backspace" && !inputValue && tags.length > 0) {
      onRemove(tags[tags.length - 1]);
    }
  };

  const handleBlur = () => {
    if (inputValue.trim()) {
      onAdd(inputValue.trim());
      setInputValue("");
    }
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
              "bg-zinc-700 text-zinc-200 border border-zinc-600",
              chipClassName
            )}
          >
            {tag}
            <button
              type="button"
              onClick={() => onRemove(tag)}
              className="text-zinc-400 hover:text-zinc-100 focus-visible:outline-none"
              aria-label={`Remove ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-md bg-zinc-800 border border-zinc-700 px-3 py-1.5",
          "text-sm text-zinc-200 placeholder:text-zinc-500",
          "focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
        )}
      />
    </div>
  );
}
