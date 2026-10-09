// Everything the rose says. Each list is picked from at random, so add,
// remove or rewrite freely.
//
// She changes as she is cared for. Lists written as three lists are her
// three stages, chosen by how tamed she is (see STAGES in rose.js):
//   [0] demanding: vain, imperious, a little ungrateful
//   [1] softening: she starts to notice you, and says please
//   [2] appreciating: grateful and warm, and finding her own strength
// Lists written as one list are the same at every stage.

export const LINES = {
  // the very first time someone lifts her glass
  first: [
    'Oh! It\'s you. Well. Don\'t just stand there, let me look at you.',
    'At last. Do you know how long I\'ve been waiting under here? Not that I was waiting.',
  ],
  // the first visit on a new day
  returning: [
    ['Oh. You again. I suppose you\'ve come to admire me.', 'Back? Well, don\'t dawdle. I have needs.'],
    ['You came back. ...I wasn\'t counting the days.', 'There you are. I\'d started to wonder.'],
    ['You came back! I was hoping you would.', 'There you are. The meadow\'s nicer when you\'re here.'],
  ],

  // what she asks for
  cover: [
    ['It\'s freezing. My glass. Now, before I wilt.', 'Do you want me to catch my death? The glass!', 'The night air is simply terrible for my petals. Cover me.'],
    ['It\'s getting cold. Would you put my glass over me? Please.', 'Brr. My globe, if you don\'t mind. It\'s a long night.'],
    ['It\'s a cold one. Would you mind the glass? Just for tonight.', 'Could I have my glass? I\'m still learning the cold.'],
  ],
  uncover: [
    ['It\'s stifling in here. Lift the glass. Gently! I\'m delicate.', 'I can\'t feel the sun through all this glass. Must I think of everything?'],
    ['Could you lift the glass? It\'s so warm today.', 'Let me breathe a little? You can see me better that way, too.'],
    ['Would you lift the glass? I want to feel the sun on my own.', 'Take the glass off? I\'d like to try standing in the open.'],
  ],
  window: [
    ['Is that window open? I can feel the draft from here. Close it.', 'Shut that window. My petals are not for blowing about.'],
    ['Would you close that window? There\'s a draft.', 'Your window\'s open. ...Not a complaint. Just an observation. A cold one.'],
    ['Your window\'s open. Mind you don\'t catch cold in there, either.', 'Close your window? I worry about you too, you know.'],
  ],
  music: [
    ['It\'s far too quiet. Put on a record. Something worthy of me.', 'Music. Now. A rose deserves to be serenaded.'],
    ['It\'s quiet. Would you play something?', 'Put a record on? I like it when you choose.'],
    ['Will you play something? I\'d like to hear what you love.', 'Play me a song. Any song. I just like the company.'],
  ],

  // when she gets what she asked for
  thanks: [
    ['Took you long enough.', 'Hm. Adequate.', 'Well. That\'s the least you could do.', 'Better. Don\'t expect me to say thank you.'],
    ['...Thank you.', 'Thank you. I don\'t say that often, you know.', 'Mm. You\'re better at this than I thought.'],
    ['Thank you. Truly.', 'You always come. I don\'t take that for granted anymore.', 'Thank you. I\'ll try to be as kind to you.'],
  ],
  musicThanks: [
    ['Hm. It\'ll do. Is that the best you have?', 'Mm. Not bad. For a song that isn\'t about me.'],
    ['Oh, I like this one. Did you pick it for me?', 'Mm. Now that\'s music a rose can sway to.'],
    ['This is lovely. Thank you for sharing it with me.', 'I could listen to this all day. With you, I mean.'],
  ],
  // care she didn't have to ask for
  noticed: [
    ['Oh. Well. I was about to ask anyway.', 'Hm. At least one of us is paying attention to me.'],
    ['Oh. You noticed. ...You\'re sweet, sometimes.', 'Before I even asked? Hm. Maybe you\'re worth keeping.'],
    ['You knew before I asked. Thank you.', 'You know me so well. Thank you, really.'],
  ],
  // when nobody answers her
  sulk: [
    ['Fine! Ignore me. See if I care.', 'Never mind. Nobody listens to a rose.', 'Forget it. I have my thorns. I don\'t need anybody.'],
    ['Never mind. I\'m sure you were busy.', 'It\'s alright. I managed.'],
    ['That\'s alright. I can manage on my own. I\'m finding I can.', 'Never mind. I think I was stronger than I thought.'],
  ],

  // lifting or lowering the glass when she didn't ask
  liftCold: [
    ['Must you? It\'s freezing out here!', 'Ah! The cold! You\'re so careless with me.'],
    ['Oh! That\'s cold. ...Just for a moment, then.'],
    ['Oh, the night air. ...No, it\'s alright. I want to feel it.'],
  ],
  liftWarm: [
    ['Finally, some air. Well? Go on, look at me.', 'There. Now you may admire me.'],
    ['Hello again.', 'The sun\'s lovely today, isn\'t it?'],
    ['The sun! Thank you.', 'Hello, you. Isn\'t it a beautiful day?'],
  ],
  lowerCold: [
    ['Mm. Acceptable.', 'Good. Keep the night off me.'],
    ['Thank you. It\'s cosy in here.'],
    ['Thank you. ...Though I think I could have managed.'],
  ],
  lowerWarm: [
    ['Hiding me away? In this weather? How dull.', 'What, am I too lovely to look at?'],
    ['Oh. Alright. Under the glass I go.'],
    ['Under glass on a day like this? Well, if you insist.'],
  ],

  // now and then, when she has nothing to ask for
  musing: [
    ['Have you ever seen a rose as beautiful as me? No. You haven\'t.', 'The sun and I came up together this morning. It was a close contest.', 'I have four thorns, you know. I\'m very fierce. Be careful with me.'],
    ['You know you\'re the only one who visits me.', 'Do you ever get tired of looking after me?', 'I was unkind to you at first. I\'m... working on it.'],
    ['I used to think I needed the glass to be safe.', 'Every time you come, I feel a little taller.', 'There are other roses, I\'m sure. But they aren\'t yours, are they?', 'My thorns aren\'t for keeping you away anymore. They\'re just mine.'],
  ],
  // only once she is finding her strength: on a cold night, she would rather try it alone
  brave: [
    'It\'s cold tonight. ...No, don\'t cover me. I want to see if I can bear it.',
    'Leave the glass off. I\'d like to try the night on my own.',
  ],

  // turning points, each said once, as her bond reaches that number
  turning: {
    3: '...You keep coming back. Even when I\'m prickly with you. Why?',
    5: 'I\'ve been thinking. I always said the glass kept me safe. Maybe it just kept me small.',
    6: 'Someday I\'d like to stand on my own. Would you still visit me, if I did?',
  },

  // if her glass is off when her moment comes, she asks for it one last time
  lastFavour: [
    'One last favour. Put my glass back over me, just for a moment. You\'ll see why.',
    'My glass, please. One more time. Trust me.',
  ],

  // the moment before the glass breaks, and just after
  breaking: ['...You know, I don\'t think I need this glass anymore.'],
  freed: ['There. Look at me. This is who I was all along.'],
  // afterwards, standing on her own
  free: [
    'I\'m still your rose. I just don\'t need the glass.',
    'Cold? Let it come. I have thorns, and I have you.',
    'You can stop worrying about me. Come visit anyway.',
    'I was never fragile. I was waiting to bloom.',
    'Look how tall I\'ve grown. All that time you spent on me.',
  ],
};
