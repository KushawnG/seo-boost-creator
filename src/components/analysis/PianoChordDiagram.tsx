import { pianoKeysFor } from "@/lib/chord-shapes";

// Two octaves, C to B: enough for every root-position major/minor triad
const WHITE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
const BLACK_SEMITONES = [1, 3, 6, 8, 10];
const WHITE_W = 13;
const WHITE_H = 58;
const BLACK_W = 8;
const BLACK_H = 36;
const OCTAVES = 2;

interface PianoChordDiagramProps {
  chord: string;
  className?: string;
}

export const PianoChordDiagram = ({ chord, className }: PianoChordDiagramProps) => {
  const pressed = pianoKeysFor(chord);
  if (!pressed) return null;
  const pressedSet = new Set(pressed);

  const whites: { semitone: number; x: number }[] = [];
  const blacks: { semitone: number; x: number }[] = [];
  for (let octave = 0; octave < OCTAVES; octave++) {
    WHITE_SEMITONES.forEach((semi, i) => {
      whites.push({ semitone: octave * 12 + semi, x: (octave * 7 + i) * WHITE_W });
    });
    BLACK_SEMITONES.forEach((semi) => {
      // black key sits between the white keys around it
      const whiteIndexBefore = WHITE_SEMITONES.filter((w) => w < semi).length - 1;
      const x = (octave * 7 + whiteIndexBefore) * WHITE_W + WHITE_W - BLACK_W / 2;
      blacks.push({ semitone: octave * 12 + semi, x });
    });
  }

  const totalWidth = OCTAVES * 7 * WHITE_W;

  return (
    <svg
      viewBox={`0 0 ${totalWidth} ${WHITE_H}`}
      className={className}
      role="img"
      aria-label={`Piano keys for ${chord}`}
    >
      {whites.map(({ semitone, x }) => (
        <rect
          key={semitone}
          x={x} y={0} width={WHITE_W} height={WHITE_H} rx={2}
          className={pressedSet.has(semitone)
            ? "fill-primary stroke-primary"
            : "fill-background stroke-muted-foreground"}
          strokeWidth="1"
        />
      ))}
      {blacks.map(({ semitone, x }) => (
        <rect
          key={semitone}
          x={x} y={0} width={BLACK_W} height={BLACK_H} rx={1.5}
          className={pressedSet.has(semitone)
            ? "fill-primary stroke-primary"
            : "fill-foreground stroke-foreground"}
          strokeWidth="1"
        />
      ))}
    </svg>
  );
};
