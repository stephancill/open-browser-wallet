import { twMerge } from "tailwind-merge";
import { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
}

export function Button({
  children,
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={twMerge(
        props.className,
        "flex items-center justify-center gap-2 w-full p-4 rounded-full disabled:opacity-50",
        variant === "primary" ? "bg-black text-white" : "bg-gray-200 text-black"
      )}
      {...props}
    >
      {children}
    </button>
  );
}
