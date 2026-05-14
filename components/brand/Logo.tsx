import Image from 'next/image';

interface LogoProps {
  height?: number;
  className?: string;
}

export function Logo({ height = 17, className }: LogoProps) {
  return (
    <Image
      src="/logo/scala-logo.svg"
      alt="SCALA"
      width={Math.round(height * 5.7)}
      height={height}
      priority
      className={className}
      style={{ filter: 'brightness(0) invert(1)' }}
    />
  );
}
