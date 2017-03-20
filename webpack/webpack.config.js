// webpack.config.js
module.exports = {
    entry: './index.js',
    output: {
        path: '../bin/',
        filename: 'pokemon.bundle.js',
    },
    node: {
        fs: "empty",
        net: "empty",
        tls: "empty"
    }
};
