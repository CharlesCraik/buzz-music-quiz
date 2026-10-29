import type { ColourId } from '../game/types';

export const COLOUR_HEX: Record<ColourId, string> = {
  tomato: '#ff5a4e',
  tangerine: '#ff9f1c',
  sunflower: '#ffd23f',
  lime: '#8bd346',
  teal: '#1ec8a5',
  sky: '#3fa7ff',
  grape: '#8f5bff',
  bubblegum: '#ff6fb5',
};

/** Shape glyph per player colour so colour is never the only cue. */
export const COLOUR_SHAPE: Record<ColourId, string> = {
  tomato: '●',
  tangerine: '▲',
  sunflower: '■',
  lime: '★',
  teal: '◆',
  sky: '♥',
  grape: '✚',
  bubblegum: '⬟',
};

export const COLOUR_LABEL: Record<ColourId, string> = {
  tomato: 'Tomato',
  tangerine: 'Tangerine',
  sunflower: 'Sunflower',
  lime: 'Lime',
  teal: 'Teal',
  sky: 'Sky',
  grape: 'Grape',
  bubblegum: 'Bubblegum',
};

export const INK = '#1b1f3b';
export const CREAM = '#fff6e9';

/** Answer buttons: fixed colour + letter + shape by position. */
export const ANSWER_STYLES = [
  { letter: 'A', shape: '●', bg: '#3fa7ff', fg: INK },
  { letter: 'B', shape: '▲', bg: '#ffd23f', fg: INK },
  { letter: 'C', shape: '■', bg: '#8bd346', fg: INK },
  { letter: 'D', shape: '★', bg: '#ff6fb5', fg: INK },
];
