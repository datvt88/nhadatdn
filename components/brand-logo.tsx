'use client';

import Image from 'next/image';

type LogoVariant = 'primary' | 'text' | 'dark';

const LOGO_MAP: Record<LogoVariant, { src: string; width: number; height: number }> = {
  primary: { src: '/logo-nhadatdn.svg', width: 420, height: 86 },
  text: { src: '/logo-nhadatdn-text.svg', width: 340, height: 72 },
  dark: { src: '/logo-nhadatdn-dark.svg', width: 420, height: 86 },
};

export function BrandLogo({
  variant = 'primary',
  className,
  priority = false,
  alt = 'NhadatDN',
}: {
  variant?: LogoVariant;
  className?: string;
  priority?: boolean;
  alt?: string;
}) {
  const logo = LOGO_MAP[variant];
  return <Image src={logo.src} alt={alt} width={logo.width} height={logo.height} priority={priority} className={className ?? 'h-10 w-auto'} />;
}

