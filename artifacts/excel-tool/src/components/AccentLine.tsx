/** Signature element of the hotel design: gold line along the bottom edge, up the right edge. Sits behind the content. */
export function AccentLine() {
  return (
    <svg className="accent-line" preserveAspectRatio="none" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="lineFade" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" style={{ stopColor: "var(--accent)", stopOpacity: 0.9 }} />
          <stop offset="35%" style={{ stopColor: "var(--accent)", stopOpacity: 0.55 }} />
          <stop offset="100%" style={{ stopColor: "var(--accent)", stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d="M 25,100 L 100,100 L 100,34" fill="none" stroke="url(#lineFade)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      <path d="M 70,100 L 100,100 L 100,60" fill="none" style={{ stroke: "var(--accent)", strokeOpacity: 0.65 }} strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
