export {};

declare global {
  interface Window {
    nextSong: () => void;
  }
}

let currentSong = 0;

window.nextSong = function () {
  currentSong = (currentSong + 1) % 3;
  window.pico8_gpio[0] = currentSong;
};
