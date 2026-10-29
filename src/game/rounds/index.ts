import type { RoundHandler } from '../ctx';
import type { RoundType } from '../types';
import { decadeDash, fastestFinger, introSprint, multipleChoice, whoSings } from './answerRounds';
import { nameThatTune, stealPoints } from './buzzRounds';
import { musicBingo } from './musicBingo';
import { beatMash, lastStanding, musicalChairs } from './miniGames';
import { passTheBomb } from './passTheBomb';

export const HANDLERS: Record<RoundType, RoundHandler> = {
  multipleChoice: multipleChoice as RoundHandler,
  fastestFinger: fastestFinger as RoundHandler,
  nameThatTune: nameThatTune as RoundHandler,
  introSprint: introSprint as RoundHandler,
  whoSings: whoSings as RoundHandler,
  decadeDash: decadeDash as RoundHandler,
  stealPoints: stealPoints as RoundHandler,
  passTheBomb: passTheBomb as RoundHandler,
  musicalChairs: musicalChairs as RoundHandler,
  beatMash: beatMash as RoundHandler,
  lastStanding: lastStanding as RoundHandler,
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
  introSprint: {
    title: 'Intro Sprint',
    tagline: 'Name the song from its very first notes.',
    rules:
      'Songs play from the start. Everyone picks the title on their phone. Fastest correct answers score most: 300, 200, 150, 100.',
    needs: 'tracks',
    audio: true,
  },
  whoSings: {
    title: 'Who Sings It?',
    tagline: 'Listen, then name the artist.',
    rules: 'A song plays. Everyone picks the artist on their phone. +100 for every correct answer.',
    needs: 'tracks',
    audio: true,
  },
  decadeDash: {
    title: 'Decade Dash',
    tagline: 'When was this a hit?',
    rules: 'A song plays. Pick the decade it was released in. +100 for every correct answer.',
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
  musicalChairs: {
    title: 'Musical Chairs',
    tagline: 'When the music stops… SIT!',
    rules:
      'Dance while the music plays. When it stops, tap SIT as fast as you can. One chair fewer than players: the slowest is out. Tap before the music stops and you are out too!',
    needs: 'tracks',
    audio: true,
  },
  beatMash: {
    title: 'Beat Mash',
    tagline: 'Tap like your life depends on it!',
    rules: 'When the music starts, tap the big button as fast as you can for 10 seconds. Most taps wins: 200, 150, 100, 50.',
    needs: 'tracks',
    audio: true,
  },
  lastStanding: {
    title: 'Last One Standing',
    tagline: 'Two lives. One winner.',
    rules:
      'Everyone answers every question. Wrong or too slow loses a life. Lose both and you are out. Last player standing wins 300!',
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
