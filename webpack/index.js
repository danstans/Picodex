var Pokedex = require('pokedex-promise-v2');
var P = new Pokedex();

window.getPokemonStats = async function(i) {
  var name, numberID, height, weight, sprite;
    var types = [];
    var stats = [];
    var moves = [];
    var abilities = [];
    await P.getPokemonByName(i)
        .then(function(response) {
            name = response.name;
            numberID = response.id;
            height = response.height / 10;
            weight = response.weight / 10;
            response.abilities.forEach(ability => {
              abilities.push(ability.ability.name);
            });

            response.types.forEach(type => {
                types.push(type.type.name)
            });

            response.stats.forEach(stat => {
                stats.push(stat.base_stat);
            });

            response.moves.forEach(move => {
              move.version_group_details.forEach(details => {
                if (details.version_group.name == "red-blue" && details.move_learn_method.name == "level-up"){
                  details_ojbect = {
                    'move_level': details.level_learned_at,
                    'move_name': move.move.name,
                  }
                  moves.push(details_ojbect);
                }
              })
            });
        })
        .catch(function(error) {
            console.log('There was an ERROR: ', error);
        });

    return ({
      'Name': name,
      'PokemonID': numberID,
      'Height': height,
      'Weight': weight,
      'Sprites': hexVals[numberID],
      'Abilities': abilities,
      'Types': types,
      'Stats': stats,
      'Moves': moves
    });
};
