import type { Difficulty, Question, Track } from '../game/types';

/**
 * Built-in fallback content so the game works with no API keys.
 * Facts are widely known but still marked `unverified` per the spec.
 * Tracks are fictional and play synthetic tones via the mock music provider.
 */

function q(
  id: string,
  category: string,
  difficulty: Difficulty,
  prompt: string,
  correct: string,
  wrong: [string, string, string],
  explanation: string,
  extra: { artist?: string; trackTitle?: string; releaseYear?: number } = {},
): Question {
  const options = [correct, ...wrong].map((text, i) => ({ id: 'abcd'[i], text }));
  return {
    id: `sample-${id}`,
    category,
    difficulty,
    questionType: 'multipleChoice',
    prompt,
    options,
    correctOptionId: 'a',
    acceptedAnswers: [correct.toLowerCase()],
    explanation,
    trackTitle: extra.trackTitle ?? null,
    artist: extra.artist ?? null,
    releaseYear: extra.releaseYear ?? null,
    spotifyUri: null,
    sourceNotes: 'Built-in sample question',
    verificationStatus: 'unverified',
  };
}

export const SAMPLE_QUESTIONS: Question[] = [
  q('1', 'Classic rock', 'easy', 'Which band released "Bohemian Rhapsody"?', 'Queen', ['The Beatles', 'Led Zeppelin', 'ABBA'], 'Queen released it in 1975.', { artist: 'Queen', trackTitle: 'Bohemian Rhapsody', releaseYear: 1975 }),
  q('2', '80s pop', 'easy', 'Who released the album "Thriller"?', 'Michael Jackson', ['Prince', 'Stevie Wonder', 'Lionel Richie'], 'Thriller came out in 1982.', { artist: 'Michael Jackson', releaseYear: 1982 }),
  q('3', 'Pop', 'easy', 'Which country were ABBA from?', 'Sweden', ['Norway', 'Denmark', 'Finland'], 'ABBA formed in Stockholm.'),
  q('4', 'Instruments', 'easy', 'How many keys does a standard modern piano have?', '88', ['76', '92', '64'], 'A full-size piano has 88 keys.'),
  q('5', '80s pop', 'easy', 'Who sang "Like a Prayer"?', 'Madonna', ['Cyndi Lauper', 'Whitney Houston', 'Kylie Minogue'], 'Madonna released it in 1989.', { artist: 'Madonna', trackTitle: 'Like a Prayer', releaseYear: 1989 }),
  q('6', '60s', 'easy', 'Which Beatle was the drummer?', 'Ringo Starr', ['George Harrison', 'Paul McCartney', 'John Lennon'], 'Ringo joined in 1962.'),
  q('7', '80s pop', 'medium', 'Who released "Purple Rain"?', 'Prince', ['David Bowie', 'George Michael', 'Rick James'], 'Purple Rain was a 1984 album and film.', { artist: 'Prince', releaseYear: 1984 }),
  q('8', '60s', 'easy', 'Which city did The Beatles come from?', 'Liverpool', ['Manchester', 'London', 'Birmingham'], 'The Beatles formed in Liverpool.'),
  q('9', 'Pop', 'medium', "What was the title of Adele's debut album?", '19', ['21', '25', '30'], 'Adele named her albums after her age; "19" came first in 2008.', { artist: 'Adele', releaseYear: 2008 }),
  q('10', 'Pop', 'easy', 'Who sang "Rolling in the Deep"?', 'Adele', ['Duffy', 'Amy Winehouse', 'Florence Welch'], 'It was the lead single from "21".', { artist: 'Adele', trackTitle: 'Rolling in the Deep' }),
  q('11', 'Rock and roll', 'easy', 'Which nickname belongs to Elvis Presley?', 'The King of Rock and Roll', ['The Boss', 'The Piano Man', 'The Godfather of Soul'], 'Elvis is widely known as "The King".'),
  q('12', 'Rock', 'medium', 'Which singer is nicknamed "The Boss"?', 'Bruce Springsteen', ['Bon Jovi', 'Tom Petty', 'Bob Seger'], 'Springsteen picked up the nickname early in his career.'),
  q('13', 'Pop', 'easy', 'Who sang "Shape of You"?', 'Ed Sheeran', ['Sam Smith', 'Lewis Capaldi', 'Shawn Mendes'], 'It was released in 2017.', { artist: 'Ed Sheeran', trackTitle: 'Shape of You', releaseYear: 2017 }),
  q('14', 'Pop', 'medium', '"Uptown Funk" was a hit for Bruno Mars and which producer?', 'Mark Ronson', ['Calvin Harris', 'David Guetta', 'Pharrell Williams'], 'It was credited to Mark Ronson featuring Bruno Mars.'),
  q('15', '90s pop', 'easy', 'Which group was made up of Ginger, Scary, Baby, Sporty and Posh?', 'Spice Girls', ['All Saints', 'Sugababes', 'Girls Aloud'], 'The Spice Girls broke through in 1996.'),
  q('16', 'Soul', 'easy', 'Who had the classic 1967 hit "Respect"?', 'Aretha Franklin', ['Diana Ross', 'Tina Turner', 'Etta James'], 'Aretha Franklin made it her signature song.'),
  q('17', 'Instruments', 'easy', 'How many strings does a standard guitar have?', '6', ['4', '5', '7'], 'A standard guitar has six strings.'),
  q('18', 'Film', 'medium', "Who wrote the songs for Disney's 1994 film The Lion King with Tim Rice?", 'Elton John', ['Phil Collins', 'Billy Joel', 'Sting'], 'Elton John and Tim Rice wrote the songs.'),
  q('19', '90s rock', 'easy', 'Which band released "Smells Like Teen Spirit"?', 'Nirvana', ['Pearl Jam', 'Soundgarden', 'Foo Fighters'], 'It opened the 1991 album "Nevermind".', { artist: 'Nirvana', releaseYear: 1991 }),
  q('20', 'Genres', 'easy', 'Bob Marley is most famous for which genre?', 'Reggae', ['Ska', 'Calypso', 'Soca'], 'Bob Marley is reggae\'s best-known star.'),
  q('21', '90s rock', 'easy', 'Which band were the Gallagher brothers in?', 'Oasis', ['Blur', 'Pulp', 'The Verve'], 'Liam and Noel Gallagher fronted Oasis.'),
  q('22', 'R&B', 'easy', 'Which group was Beyoncé in before going solo?', "Destiny's Child", ['TLC', 'En Vogue', 'Sugababes'], "Destiny's Child formed in Houston."),
  q('23', 'Hip-hop', 'easy', 'Which rapper uses the alter ego "Slim Shady"?', 'Eminem', ['Dr. Dre', 'Snoop Dogg', '50 Cent'], 'Eminem introduced Slim Shady in the late 90s.'),
  q('24', 'Film', 'easy', 'Which Disney film features the song "Let It Go"?', 'Frozen', ['Moana', 'Tangled', 'Encanto'], 'Frozen was released in 2013.'),
  q('25', 'Indie', 'medium', 'Which band sang "Mr. Brightside"?', 'The Killers', ['Kings of Leon', 'Arctic Monkeys', 'The Strokes'], 'It was on their 2004 debut album.', { artist: 'The Killers', trackTitle: 'Mr. Brightside' }),
  q('26', '60s', 'easy', 'How many members were in The Beatles?', '4', ['3', '5', '6'], 'John, Paul, George and Ringo.'),
  q('27', '70s', 'easy', 'Who sang "Rocket Man"?', 'Elton John', ['David Bowie', 'Rod Stewart', 'Billy Joel'], 'It was released in 1972.', { artist: 'Elton John', trackTitle: 'Rocket Man', releaseYear: 1972 }),
  q('28', '70s', 'medium', "What was the name of David Bowie's famous alter ego?", 'Ziggy Stardust', ['Sasha Fierce', 'Slim Shady', 'Chris Gaines'], 'Ziggy Stardust appeared in 1972.'),
  q('29', '60s', 'easy', 'Which band released "Hey Jude"?', 'The Beatles', ['The Rolling Stones', 'The Who', 'The Kinks'], 'Hey Jude came out in 1968.', { artist: 'The Beatles', trackTitle: 'Hey Jude', releaseYear: 1968 }),
  q('30', 'Classical', 'medium', 'Which composer wrote the opera "The Magic Flute"?', 'Mozart', ['Beethoven', 'Bach', 'Handel'], 'Mozart wrote it in 1791.'),
];

const MOCK_SONGS: [string, string][] = [
  ['Neon Lullaby', 'The Static Hearts'],
  ['Disco Kettle', 'Marmalade Sky'],
  ['Moonbeam Motorway', 'Velvet Otters'],
  ['Hot Toast Boogie', 'DJ Crumpet'],
  ['Paper Plane Romance', 'Lola Lark'],
  ['Thunder in My Socks', 'The Loud Neighbours'],
  ['Banana Galaxy', 'Cosmic Fruit Bowl'],
  ['Midnight Bus Stop', 'Northern Lights Club'],
  ['Glitter Rain', 'Sparkle Riot'],
  ['Funky Fridge', 'The Leftovers'],
  ['Pocket Full of Stars', 'Juniper June'],
  ['Robot Heartbeat', 'Circuit Kids'],
  ['Seaside Jam', 'The Deckchairs'],
  ['Tiger Tango', 'Stripey & The Paws'],
  ['Saturday Spaghetti', 'Nonna Groove'],
];

export const MOCK_TRACKS: Track[] = MOCK_SONGS.map(([title, artist], i) => ({
  id: `mock-${i}`,
  uri: `mock:track:${i}`,
  title,
  artists: [artist],
  album: 'Sample Sounds',
  year: 2000 + i,
  durationMs: 60_000,
}));
