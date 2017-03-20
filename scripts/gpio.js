var pico8_gpio = new Array(128);
var lastPokemon = 0
var currentPokemon = pico8_gpio[1];

function nameToByteArray(pokeString) {
    var alpha = 'abcdefghijklmnopqrstuvwxyz'
    var byteArray = []
    for (pokeChar in pokeString) {
        byteArray.push(alpha.indexOf(pokeString[pokeChar]));
    }
    return byteArray;
}

function weightToByteArray(weight) {
    var whole = Math.floor(weight);
    var decimal = Math.floor(((weight - Math.floor(weight)) * 10));
    if (decimal != 0) return [whole, decimal];
    else return [whole]
}

function typesToByteArray(types) {
    var alpha = 'abcdefghijklmnopqrstuvwxyz'
    var byteArray = []
    types.forEach(type => {
        var typeArray = []
        for (char in type) {
            typeArray.push(alpha.indexOf(type[char]));
        }
        byteArray.push(typeArray)
    });
    return byteArray
}

function sendNameToLua(ByteArray) {
    for (var i = 0; i < ByteArray.length; i++) {
        pico8_gpio[i + 8] = ByteArray[i];
    }
    pico8_gpio[2] = ByteArray.length - 1;
}

function sendWeightToLua(ByteArray) {
    for (var i = 0; i < ByteArray.length; i++) {
        pico8_gpio[i + 19] = ByteArray[i]
    }
    pico8_gpio[3] = ByteArray.length
}

function sendHeightToLua(ByteArray) {
    for (var i = 0; i < ByteArray.length; i++) {
        pico8_gpio[i + 21] = ByteArray[i]
    }
    pico8_gpio[4] = ByteArray.length
}

function sendStatsToLua(ByteArray) {
    pico8_gpio[42] = ByteArray[0];
    pico8_gpio[43] = ByteArray[3];
    pico8_gpio[44] = ByteArray[4];
    pico8_gpio[45] = ByteArray[5];
    pico8_gpio[5] = 1
}

function sendTypesToLua(ByteArray) {
    if (ByteArray.length > 1) {
        for (var i = 0; i < ByteArray[0].length; i++) {
            pico8_gpio[i + 23] = ByteArray[0][i];
        }
        pico8_gpio[6] = ByteArray[0].length - 1;

        for (var i = 0; i < ByteArray[1].length; i++) {
            pico8_gpio[i + 32] = ByteArray[1][i];
        }
        pico8_gpio[7] = ByteArray[1].length - 1;
    } else {
        for (var i = 0; i < ByteArray[0].length; i++) {
            pico8_gpio[i + 23] = ByteArray[0][i];
        }
        pico8_gpio[6] = ByteArray[0].length - 1;
    }
}

function onRender() {
    currentPokemon = pico8_gpio[1];
    if (lastPokemon != currentPokemon) {
        lastPokemon = currentPokemon
        // console.log(`The current pokemon value is ${currentPokemon}`);
        var pokemonPromise = getPokemonStats(currentPokemon);
        pokemonPromise.then(pokemon => {
            // console.log(pokemon)
            var nameByteArray = nameToByteArray(pokemon.Name);
            var weightByteArray = weightToByteArray(pokemon.Weight);
            var heightByteArray = weightToByteArray(pokemon.Height);
            var typesByteArray = typesToByteArray(pokemon.Types);
            var moves = pokemon.Moves
            sendNameToLua(nameByteArray);
            sendWeightToLua(weightByteArray);
            sendHeightToLua(heightByteArray);
            sendStatsToLua(pokemon.Stats)
            sendTypesToLua(typesByteArray);
        });

    }
    window.requestAnimationFrame(onRender);
}

window.requestAnimationFrame(onRender);
