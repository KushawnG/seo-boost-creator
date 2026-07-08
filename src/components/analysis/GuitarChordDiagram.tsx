import { GUITAR_SHAPES } from "@/lib/chord-shapes";

const STRINGS = 6;
const FRETS_SHOWN = 4;
const GRID_LEFT = 22;
const GRID_TOP = 18;
const STRING_GAP = 13;
const FRET_GAP = 22;
const GRID_WIDTH = STRING_GAP * (STRINGS - 1);

interface GuitarChordDiagramProps {
  chord: string;
  className?: string;
}

export const GuitarChordDiagram = ({ chord, className }: GuitarChordDiagramProps) => {
  const shape = GUITAR_SHAPES[chord];
  if (!shape) return null;

  const fretted = shape.frets.filter((f) => f > 0);
  const maxFret = Math.max(...fretted);
  // Open-position chords render from the nut; higher chords shift the window
  const baseFret = maxFret <= FRETS_SHOWN ? 1 : Math.min(...fretted);

  const stringX = (s: number) => GRID_LEFT + s * STRING_GAP;
  const fretY = (f: number) => GRID_TOP + ((f - baseFret) + 0.5) * FRET_GAP;
  const gridBottom = GRID_TOP + FRETS_SHOWN * FRET_GAP;

  return (
    <svg
      viewBox="0 0 108 116"
      className={className}
      role="img"
      aria-label={`Guitar fingering for ${chord}`}
    >
      {/* strings */}
      {Array.from({ length: STRINGS }, (_, s) => (
        <line
          key={`s${s}`}
          x1={stringX(s)} y1={GRID_TOP} x2={stringX(s)} y2={gridBottom}
          className="stroke-muted-foreground" strokeWidth="1"
        />
      ))}
      {/* frets */}
      {Array.from({ length: FRETS_SHOWN + 1 }, (_, f) => (
        <line
          key={`f${f}`}
          x1={GRID_LEFT} y1={GRID_TOP + f * FRET_GAP} x2={GRID_LEFT + GRID_WIDTH} y2={GRID_TOP + f * FRET_GAP}
          className="stroke-muted-foreground" strokeWidth="1"
        />
      ))}
      {/* nut (thick top line) when in open position */}
      {baseFret === 1 && (
        <rect x={GRID_LEFT - 1} y={GRID_TOP - 3} width={GRID_WIDTH + 2} height={3.5} rx={1} className="fill-foreground" />
      )}
      {/* position label for higher chords */}
      {baseFret > 1 && (
        <text x={GRID_LEFT - 6} y={fretY(baseFret) + 3.5} textAnchor="end" fontSize="9" className="fill-muted-foreground">
          {baseFret}fr
        </text>
      )}
      {/* barre */}
      {shape.barre && (
        <rect
          x={stringX(shape.barre[1]) - 4.5}
          y={fretY(shape.barre[0]) - 4.5}
          width={(shape.barre[2] - shape.barre[1]) * STRING_GAP + 9}
          height={9}
          rx={4.5}
          className="fill-primary"
        />
      )}
      {/* dots, and open/mute markers above the nut */}
      {shape.frets.map((fret, s) => {
        if (fret === -1) {
          return (
            <text key={s} x={stringX(s)} y={GRID_TOP - 7} textAnchor="middle" fontSize="9" className="fill-muted-foreground">
              ×
            </text>
          );
        }
        if (fret === 0) {
          return (
            <circle key={s} cx={stringX(s)} cy={GRID_TOP - 10} r={3}
              className="stroke-muted-foreground" fill="none" strokeWidth="1.2" />
          );
        }
        // skip the dot when the barre already covers this string at this fret
        if (shape.barre && fret === shape.barre[0] && s >= shape.barre[1] && s <= shape.barre[2]) {
          return null;
        }
        return <circle key={s} cx={stringX(s)} cy={fretY(fret)} r={4.5} className="fill-primary" />;
      })}
    </svg>
  );
};
