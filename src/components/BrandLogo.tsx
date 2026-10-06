import React from 'react';

const LOGO_VARIANTS = [
  { src: '/assets/regularLogo.svg', visibility: 'max-w-none block dark:hidden' },
  { src: '/assets/whiteLogo.svg', visibility: 'max-w-none hidden dark:block' },
];

const SQUARE_LOGO_VARIANTS = [
  { src: '/assets/regularLogoSquare.svg', visibility: 'max-w-none block dark:hidden' },
  { src: '/assets/whiteLogoSquare.svg', visibility: 'max-w-none hidden dark:block' },
];

const SQUARE_VIEW_WIDTH = 289.5;
const SVG_VIEW_HEIGHT = 289.5;

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

const sizeConfig: Record<NonNullable<BrandLogoProps['size']>, { full: string; px: number }> = {
  sm: { full: 'h-6 w-auto', px: 24 },
  md: { full: 'h-8 w-auto', px: 32 },
  lg: { full: 'h-10 w-auto', px: 40 },
  xl: { full: 'h-12 w-auto', px: 48 },
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  showText = true,
  className = '',
}) => {
  const { full, px: height } = sizeConfig[size];

  if (!showText) {
    // Icon-only mode: use the dedicated square logo asset
    const squareWidth = (SQUARE_VIEW_WIDTH / SVG_VIEW_HEIGHT) * height;
    return (
      <span
        role="img"
        aria-label="Twext Mark"
        className={`${className} inline-flex shrink-0 select-none`}
        style={{ width: squareWidth, height }}
      >
        {SQUARE_LOGO_VARIANTS.map((variant) => (
          <img
            key={variant.src}
            src={variant.src}
            alt=""
            className={`${variant.visibility} shrink-0`}
            style={{ width: squareWidth, height }}
          />
        ))}
      </span>
    );
  }

  return (
    <>
      {LOGO_VARIANTS.map((variant) => (
        <img
          key={variant.src}
          src={variant.src}
          alt="Twext"
          loading="eager"
          className={`${full} ${variant.visibility} ${className} shrink-0 select-none`}
        />
      ))}
    </>
  );
};
