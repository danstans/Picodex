var pico8_gpio = new Array(128);
var lastPokemon = 0
var currentPokemon = pico8_gpio[1];

function convertStringToByteArray(pokeString) {
  var alpha = 'abcdefghijklmnopqrstuvwxyz'
  var byteArray = []
  for (pokeChar in pokeString) {
    byteArray.push(alpha.indexOf(pokeString[pokeChar]));
  }
  return byteArray;
}

function sendNameToLua(ByteArray) {

}

function onRender() {
    currentPokemon = pico8_gpio[1];
    if (lastPokemon != currentPokemon) {
      lastPokemon = currentPokemon
      // console.log(`The current pokemon value is ${currentPokemon}`);
      var pokemonPromise = getPokemonStats(currentPokemon);
      pokemonPromise.then(pokemon => {
        var nameByteArray = convertStringToByteArray(pokemon.Name);
        sendNameToLua(nameByteArray);
        // console.log(pokemon.Name);
        // console.log(pokemon.Weight);
        // console.log(pokemon.Height);
      });

    }
    window.requestAnimationFrame(onRender);
}

window.requestAnimationFrame(onRender);
