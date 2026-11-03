// The game ring: one mark per game, and a card with its cover when one is picked.
export const games = [
  {
    title: 'Ruinborne',
    img: 'img/ruinborne.jpg',
    text: 'A pastel roguelite dive. Pick a job, fight through the chambers, and carry boons and relics from one attempt to the next.',
    href: 'https://dylan3737.itch.io/ruinborne',
    link: 'Play on itch.io'
  },
  {
    title: 'Anomaly',
    img: 'img/anomaly.jpg',
    text: 'A hooded gunslinger with a katana against waves of soldiers. Wall-runs, shootdodges, and bullet time.',
    href: 'https://dylan3737.itch.io/anomaly',
    link: 'Play on itch.io'
  },
  {
    title: 'Skyseed',
    img: 'img/skyseed.jpg',
    text: 'A floating-island growth puzzle. Place every piece, one per turn, and find the order that finishes the island.',
    href: 'https://dylan3737.itch.io/skyseed',
    link: 'Play on itch.io'
  },
  {
    title: 'Expelled',
    img: 'img/expelled.jpg',
    text: 'A dark-magician idle game in the Mafia Wars style. Scheme, duel, bind thralls, and rise.',
    href: 'https://dylan3737.github.io/expelled/',
    link: 'Play'
  }
];

export function hideGameCard() {
  const card = document.getElementById('gameCard');
  if (card) card.hidden = true;
  document.querySelectorAll('.game-mark').forEach((mark) => mark.classList.remove('is-on'));
}

// The card sits above the mark that was clicked, so it never hides the other
// marks; when the reaper is dragged onto a game it sits beside him instead.
export function showGameCard(index, anchor) {
  const game = games[index];
  const card = document.getElementById('gameCard');
  if (!game || !card) return;
  document.getElementById('gameCardTitle').textContent = game.title;
  document.getElementById('gameCardText').textContent = game.text;
  const img = document.getElementById('gameCardImg');
  img.src = game.img;
  img.alt = game.title + ' cover art';
  const link = document.getElementById('gameCardLink');
  link.href = game.href;
  link.textContent = game.link;
  card.hidden = false;
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  let left;
  let top;
  if (anchor) {
    const mark = anchor.getBoundingClientRect();
    left = mark.left + mark.width / 2 - w / 2;
    top = mark.top - h - 12;
    if (top < 12) top = mark.bottom + 12;
  } else {
    const body = document.getElementById('ghost-character').getBoundingClientRect();
    left = body.right + 14;
    top = body.top;
    if (left + w + 10 > window.innerWidth) left = body.left - w - 24;
  }
  left = Math.min(left, window.innerWidth - w - 12);
  top = Math.min(top, window.innerHeight - h - 12);
  card.style.left = Math.max(12, left) + 'px';
  card.style.top = Math.max(12, top) + 'px';
  document.querySelectorAll('.game-mark').forEach((mark) => {
    mark.classList.toggle('is-on', Number(mark.dataset.game) === index);
  });
}

document.querySelectorAll('.game-mark').forEach((mark) => {
  mark.addEventListener('click', () => showGameCard(Number(mark.dataset.game), mark));
});
const gameCardClose = document.getElementById('gameCardClose');
if (gameCardClose) gameCardClose.addEventListener('click', hideGameCard);
