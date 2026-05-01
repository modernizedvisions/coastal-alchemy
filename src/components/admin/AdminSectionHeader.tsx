import React from 'react';

interface AdminSectionHeaderProps {
  title: string;
  subtitle?: string;
  className?: string;
}

export function AdminSectionHeader({ title, subtitle, className = '' }: AdminSectionHeaderProps) {
  return (
    <div className={`mb-6 text-center ${className}`}>
      <h2 className="ca-admin-heading text-3xl md:text-4xl leading-tight">
        {title}
      </h2>
      {subtitle && (
        <p className="ca-admin-subheading mx-auto mt-2 max-w-3xl text-[11px] md:text-xs uppercase tracking-[0.24em]">
          {subtitle}
        </p>
      )}
    </div>
  );
}
