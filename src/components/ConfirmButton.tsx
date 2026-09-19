"use client";

import type { ButtonHTMLAttributes } from "react";

/** Submit button that asks for confirmation before its form is submitted. */
export default function ConfirmButton({
  confirmMessage,
  ...props
}: { confirmMessage: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) e.preventDefault();
      }}
    />
  );
}
