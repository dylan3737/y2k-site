// Small DOM helpers shared by the abilities and the Speak card.
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function chip(label, onClick, extra) {
  const btn = el('button', 'chip' + (extra ? ' ' + extra : ''), label);
  btn.type = 'button';
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}
