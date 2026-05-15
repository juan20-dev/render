import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  variant?: 'primary' | 'secondary' | 'destructive' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  size = 'md',
  icon,
  disabled = false,
  className = ''
}: ButtonProps) {
  const baseClasses = "inline-flex items-center justify-center gap-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-2";
  
  const variantClasses = {
    primary: 'border-primary bg-primary text-primary-foreground ring-2 ring-transparent hover:bg-primary/90 hover:ring-primary/35',
    secondary: 'border-secondary bg-secondary text-secondary-foreground ring-2 ring-transparent hover:bg-secondary/80 hover:ring-ring/35',
    destructive: 'border-destructive bg-destructive text-destructive-foreground ring-2 ring-transparent hover:bg-destructive/90 hover:ring-destructive/40',
    outline: 'border border-border bg-white ring-2 ring-transparent hover:bg-accent hover:border-primary/40 hover:ring-primary/20',
    ghost: 'border-2 border-transparent ring-2 ring-transparent hover:bg-accent hover:ring-ring/25 hover:border-ring/25',
  };
  
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3'
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {icon && <span>{icon}</span>}
      {children}
    </button>
  );
}
