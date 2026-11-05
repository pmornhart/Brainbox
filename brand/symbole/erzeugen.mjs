#!/usr/bin/env node
// Baut brand/overrides/app/components/Icons/BrainboxIconSet.tsx – die Brainbox-Symbole,
// die im Wiki das Paket „outline-icons“ ersetzen (Alias in vite.config.mts, gesetzt von brand/apply.mjs).
//
//   npm pack @phosphor-icons/core@2.1.1 && tar xzf phosphor-icons-core-2.1.1.tgz
//   node brand/symbole/erzeugen.mjs package/assets
//
// Verfasst mit Claude 🤖
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zuordnung, extras, PHOSPHOR_VERSION } from "./zuordnung.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = process.argv[2];
if (!assets || !fs.existsSync(path.join(assets, "regular"))) {
  console.error("Aufruf: node brand/symbole/erzeugen.mjs <phosphor>/assets");
  process.exit(1);
}
const ziel = path.join(here, "../overrides/app/components/Icons/BrainboxIconSet.tsx");

// "fill/star" → assets/fill/star-fill.svg, "star" → assets/regular/star.svg
function pfad(name) {
  const [stil, basis] = name.includes("/") ? name.split("/") : ["regular", name];
  const datei = path.join(assets, stil, stil === "regular" ? `${basis}.svg` : `${basis}-${stil}.svg`);
  const svg = fs.readFileSync(datei, "utf8");
  const teile = [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
  if (!teile.length || /<(circle|rect|line|polyline|polygon|ellipse)\b/.test(svg)) {
    throw new Error(`${datei}: unerwarteter Aufbau`);
  }
  return teile.join(" ");
}

const formen = new Map();
const form = (name) => {
  if (!formen.has(name)) formen.set(name, pfad(name));
  return JSON.stringify(name);
};

const exporte = Object.entries({ ...zuordnung, ...extras }).map(([symbol, wert]) => {
  const auswahl =
    typeof wert === "string"
      ? `fixed(${form(wert)})`
      : `when(${JSON.stringify(wert.prop)}, ${form(wert.an)}, ${form(wert.aus)})`;
  return `export const ${symbol} = glyph(${JSON.stringify(symbol)}, ${auswahl});`;
});

const tabelle = [...formen].map(([name, d]) => `  ${JSON.stringify(name)}: ${JSON.stringify(d)},`);

const tsx = `// Brainbox-Symbole: ersetzen im Wiki das Paket „outline-icons“ (Alias in vite.config.mts, gesetzt von brand/apply.mjs).
// Formen aus Phosphor Icons ${PHOSPHOR_VERSION} (MIT-Lizenz, © Phosphor Icons, https://phosphoricons.com),
// siehe brand/symbole/PHOSPHOR-LICENSE.txt. Zuordnung in brand/symbole/zuordnung.mjs.
// Erzeugt mit brand/symbole/erzeugen.mjs – bitte nicht von Hand ändern.
// Verfasst mit Claude 🤖
import * as React from "react";

export type Props = {
  className?: string;
  color?: string;
  size?: number;
  onClick?: (ev: React.MouseEvent<SVGElement>) => void;
  theme?: Record<string, unknown>;
};

type Variants = {
  expanded?: boolean;
  open?: boolean;
  checked?: boolean;
  outline?: boolean;
};

type GlyphProps = Props &
  Variants &
  Omit<React.SVGProps<SVGSVGElement>, keyof Props | keyof Variants | "ref">;

const DEFAULT_SIZE = 24;
/** Phosphor zeichnet auf 256 × 256 – mit dem Rand sind die Formen so groß wie die bisherigen Symbole. */
const GLYPH_VIEWBOX = "-16 -16 288 288";
const BASE_VIEWBOX = "0 0 24 24";
const SVG_NS = "http://www.w3.org/2000/svg";

const shapes = {
${tabelle.join("\n")}
} as const;

type Shape = keyof typeof shapes;
type Pick = (variants: Variants) => Shape;

const fixed =
  (shape: Shape): Pick =>
  () =>
    shape;

const when =
  (key: keyof Variants, on: Shape, off: Shape): Pick =>
  (variants) =>
    variants[key] ? on : off;

const toPx = (size?: number): string => \`\${size ?? DEFAULT_SIZE}px\`;

/** Grundform wie im alten Paket: eigene Pfade im 24er-Raster als Kinder. */
export const Icon = React.forwardRef<SVGSVGElement, Props & { children?: React.ReactNode }>(
  function Icon({ children, theme: _theme, color = "currentColor", size, ...rest }, ref) {
    return (
      <svg fill={color} width={toPx(size)} height={toPx(size)} viewBox={BASE_VIEWBOX} xmlns={SVG_NS} ref={ref} {...rest}>
        {children}
      </svg>
    );
  }
);

function glyph(name: string, pick: Pick) {
  const Component = React.forwardRef<SVGSVGElement, GlyphProps>(function BrainboxIcon(
    { theme: _theme, color = "currentColor", size, expanded, open, checked, outline, ...rest },
    ref
  ) {
    return (
      <svg
        fill={color}
        width={toPx(size)}
        height={toPx(size)}
        viewBox={GLYPH_VIEWBOX}
        xmlns={SVG_NS}
        data-brainbox-icon={name}
        ref={ref}
        {...rest}
      >
        <path d={shapes[pick({ expanded, open, checked, outline })]} />
      </svg>
    );
  });
  Component.displayName = name;
  return Component;
}

${exporte.join("\n")}
`;

fs.mkdirSync(path.dirname(ziel), { recursive: true });
fs.writeFileSync(ziel, tsx);
console.log(`${Object.keys(zuordnung).length} Symbole + ${Object.keys(extras).length} eigene, ${formen.size} Formen → ${path.relative(process.cwd(), ziel)} (${Math.round(tsx.length / 1024)} KB)`);
