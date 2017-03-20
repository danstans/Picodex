var pico8_gpio = new Array(128);


function onRender() {
    if (pico8_gpio[0] == 0) {

    }
    window.requestAnimationFrame(onRender);
}

var pokemonPromise = getPokemonStats(1);
pokemonPromise.then(console.log);
window.requestAnimationFrame(onRender);
