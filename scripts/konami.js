const pressed = []
const secretLength = 11
const secretCode = 'ArrowUpArrowUpArrowDownArrowDownArrowLeftArrowRightArrowLeftArrowRightbaz'
var currentSong = 0

window.addEventListener('keyup', e => {
  pressed.push(e.key);
  pressed.splice(-secretLength-1, pressed.length - secretLength);
  if (pressed.join('').includes(secretCode)) {
    currentSong = (currentSong + 1) % 3
    pico8_gpio[0] = currentSong
  }
})
