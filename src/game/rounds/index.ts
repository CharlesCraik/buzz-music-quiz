import type { RoundHandler } from '../ctx';
import type { RoundType } from '../types';
import { fastestFinger, multipleChoice } from './answerRounds';
import { nameThatTune, stealPoints } from './buzzRounds';
import { musicBingo } from './musicBingo';
import { passTheBomb } from './passTheBomb';

export const HANDLERS: Record<RoundType, RoundHandler> = {
  multipleChoice: multipleChoice as RoundHandler,
  fastestFinger: fastestFinger as RoundHandler,
  nameThatTune: nameThatTune as RoundHandler,
  stealPoints: stealPoints as RoundHandler,
  passTheBomb: passTheBomb as RoundHandler,
  musicBingo: musicBingo as RoundHandler,
};

export interface RoundInfo {
  title: string;
  tagline: string;
  rules: string;
  /** What kind of source material the round consumes. */
  needs: 'questions' | 'tracks';
  audio: boolean;
}

export const ROUND_INFO: Record<RoundType, RoundInfo> = {
  multipleChoice: {
    title: 'Quick Quiz',
    tagline: 'Four options. One right answer.',
    rules: 'Pick an answer on your phone before the timer runs out. Every correct answer scores.',
    needs: 'questions',
    audio: false,
  },
  fastestFinger: {
    title: 'Fastest Finger',
    tagline: 'Speed pays.',
    rules: 'Everyone answers. The faster you are right, the more you score: 300, 200, 150, 100.',
    needs: 'questions',
    audio: false,
  },
  nameThatTune: {
    title: 'Name That Tune',
    tagline: 'Hit the buzzer when you know it!',
    rules:
      'A song plays. First to buzz gets to answer. Earlier buzzes score more; wrong answers lose points and lock you out.',
    needs: 'tracks',
    audio: true,
  },
  stealPoints: {
    title: 'Point Thief',
    tagline: 'Buzz in, get it right, steal from a rival.',
    rules:
      'Buzz in to answer. Get it right and pick a player to steal points from. Get it wrong and you are locked out.',
    needs: 'questions',
    audio: false,
  },
  passTheBomb: {
    title: 'Hot Potato Bomb',
    tagline: "Don't be holding it when it blows!",
    rules:
      'Answer correctly to pass the bomb to someone else. Wrong answers mean another question. The fuse is secret.',
    needs: 'questions',
    audio: false,
  },
  musicBingo: {
    title: 'Music Bingo',
    tagline: 'Spot the songs on your card.',
    rules:
      'Songs play one after another. Tap a song on your card when you hear it. Wrong taps cost points. Lines and full houses win bonuses!',
    needs: 'tracks',
    audio: true,
  },
};
