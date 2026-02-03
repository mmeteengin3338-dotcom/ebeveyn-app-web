"use client"

import React from "react"

type ButtonProps = {
  children: React.ReactNode
  className?: string
  variant?: "primary" | "ghost"
  type?: "button" | "submit"
  onClick?: () => void
  disabled?: boolean
}

export default function Button({
  children,
  className = "",
  variant = "primary",
  type = "button",
  onClick,
  disabled = false,
}: ButtonProps) {
  const baseClass = variant === "primary" ? "btn-primary" : "btn-ghost"

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseClass} ${className} ${
        disabled ? "opacity-60 cursor-not-allowed" : ""
      }`}
    >
      {children}
    </button>
  )
}
