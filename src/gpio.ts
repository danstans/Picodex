export {};

declare global {
  interface Window {
    pico8_gpio: number[];
  }
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz-";

const pokemonCache: Record<number, PokemonData> = {};

interface PokemonData {
  name: string;
  id: number;
  height: number;
  weight: number;
  types: string[];
  stats: number[];
  moves: MoveEntry[];
  spriteData: number[] | null;
}

interface MoveEntry {
  level: number;
  name: string;
}

// --- PICO-8 palette (RGB) ---

const PICO8_PALETTE: [number, number, number][] = [
  [0, 0, 0],        // 0  black (transparent in sprites)
  [29, 43, 83],      // 1  dark blue
  [126, 37, 83],     // 2  dark purple
  [0, 135, 81],      // 3  dark green
  [171, 82, 54],     // 4  brown
  [95, 87, 79],      // 5  dark gray
  [194, 195, 199],   // 6  light gray
  [255, 241, 232],   // 7  white
  [255, 0, 77],      // 8  red
  [255, 163, 0],     // 9  orange
  [255, 236, 39],    // 10 yellow
  [0, 228, 54],      // 11 green
  [41, 173, 255],    // 12 blue
  [131, 118, 156],   // 13 lavender
  [255, 119, 168],   // 14 pink
  [255, 204, 170],   // 15 peach
];

function nearestPico8Color(r: number, g: number, b: number, a: number): number {
  if (a < 128) return 0; // transparent → color 0 (drawn transparent by PICO-8)
  let best = 1;
  let bestDist = Infinity;
  // Skip color 0 so actual black pixels map to dark blue/gray instead of transparent
  for (let i = 1; i < 16; i++) {
    const [pr, pg, pb] = PICO8_PALETTE[i];
    const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

// --- Encoding helpers ---

function nameToBytes(str: string): number[] {
  return Array.from(str, (ch) => ALPHABET.indexOf(ch));
}

function weightToBytes(value: number): number[] {
  const whole = Math.floor(value);
  const decimal = Math.floor((value - whole) * 10);
  return decimal !== 0 ? [whole, decimal] : [whole];
}

function typeToBytes(type: string): number[] {
  return Array.from(type, (ch) => ALPHABET.indexOf(ch));
}

// --- Sprite transfer state ---

const SPRITE_SIZE = 64;
const BYTES_PER_CHUNK = 32; // pins 95-126
const TOTAL_SPRITE_BYTES = (SPRITE_SIZE * SPRITE_SIZE) / 2; // 4bpp = 2048 bytes
const TOTAL_CHUNKS = TOTAL_SPRITE_BYTES / BYTES_PER_CHUNK; // 64

interface SpriteTransfer {
  data: number[];
  chunkIndex: number;
}

let spriteTransfer: SpriteTransfer | null = null;
let handlingAck = false;

// --- Proxy-based GPIO: instant chunk response on Lua ACK ---
//
// The key insight: PICO-8's peek/poke to GPIO addresses read/write the
// pico8_gpio JS array in real-time. By intercepting Lua's ACK (pin 93→0)
// via a Proxy setter, we can write the next chunk BEFORE the next Lua
// receivespritechunk() iteration reads pin 93. This lets multiple chunks
// transfer within a single PICO-8 frame instead of one per frame.

const rawGpio: number[] = new Array(128).fill(0);

window.pico8_gpio = new Proxy(rawGpio, {
  set(target: number[], prop: string | symbol, value: number): boolean {
    (target as any)[prop] = value;
    // When Lua ACKs a sprite chunk (sets pin 93 to 0), immediately queue next
    if (!handlingAck && prop === '93' && value === 0 && spriteTransfer) {
      handlingAck = true;
      spriteTransfer.chunkIndex++;
      if (spriteTransfer.chunkIndex < TOTAL_CHUNKS) {
        writeNextSpriteChunk();
      } else {
        spriteTransfer = null;
      }
      handlingAck = false;
    }
    return true;
  },
  get(target: number[], prop: string | symbol): unknown {
    return (target as any)[prop];
  },
});

// --- GPIO write helpers (write to rawGpio to bypass proxy overhead) ---

function writeNameToGpio(bytes: number[]): void {
  for (let i = 0; i < bytes.length; i++) {
    rawGpio[i + 8] = bytes[i];
  }
  rawGpio[2] = bytes.length - 1;
}

function writeWeightToGpio(bytes: number[]): void {
  for (let i = 0; i < bytes.length; i++) {
    rawGpio[i + 19] = bytes[i];
  }
  rawGpio[3] = bytes.length;
}

function writeHeightToGpio(bytes: number[]): void {
  for (let i = 0; i < bytes.length; i++) {
    rawGpio[i + 21] = bytes[i];
  }
  rawGpio[4] = bytes.length;
}

// PokeAPI stat order: [0]=HP, [1]=ATK, [2]=DEF, [3]=SPA, [4]=SPD_SPECIAL, [5]=SPD
// Lua reads: pin44=attack, pin43=defense, pin42=speed, pin45=hp
function writeStatsToGpio(stats: number[]): void {
  rawGpio[42] = stats[5]; // speed
  rawGpio[43] = stats[2]; // defense
  rawGpio[44] = stats[1]; // attack
  rawGpio[45] = stats[0]; // hp
  rawGpio[5] = 1;
}

function writeTypesToGpio(types: string[]): void {
  const type1 = typeToBytes(types[0]);
  for (let i = 0; i < type1.length; i++) {
    rawGpio[i + 23] = type1[i];
  }
  rawGpio[6] = type1.length - 1;

  if (types.length > 1) {
    const type2 = typeToBytes(types[1]);
    for (let i = 0; i < type2.length; i++) {
      rawGpio[i + 32] = type2[i];
    }
    rawGpio[7] = type2.length - 1;
  }
}

function writeMovesToGpio(moves: MoveEntry[]): void {
  const sorted = moves
    .slice(0, 3)
    .sort((a, b) => a.level - b.level);

  const namePins = [49, 63, 78];
  const levelPins = [61, 76, 92];
  const readyPins = [48, 62, 77];

  sorted.forEach((move, idx) => {
    const bytes = nameToBytes(move.name);
    for (let i = 0; i < bytes.length; i++) {
      rawGpio[i + namePins[idx]] = bytes[i];
    }
    rawGpio[readyPins[idx]] = bytes.length;
    rawGpio[levelPins[idx]] = move.level;
  });
}

// --- Sprite processing ---

function writeNextSpriteChunk(): void {
  if (!spriteTransfer) return;
  const offset = spriteTransfer.chunkIndex * BYTES_PER_CHUNK;
  for (let i = 0; i < BYTES_PER_CHUNK; i++) {
    rawGpio[95 + i] = spriteTransfer.data[offset + i] ?? 0;
  }
  rawGpio[94] = TOTAL_CHUNKS - spriteTransfer.chunkIndex;
  rawGpio[93] = 1; // signal: chunk ready (direct write, no proxy re-trigger)
}

function processSprite(imageData: ImageData): number[] {
  const pixels = imageData.data;
  const packed: number[] = [];

  for (let y = 0; y < SPRITE_SIZE; y++) {
    for (let x = 0; x < SPRITE_SIZE; x += 2) {
      const i1 = (y * SPRITE_SIZE + x) * 4;
      const i2 = (y * SPRITE_SIZE + x + 1) * 4;
      const c1 = nearestPico8Color(pixels[i1], pixels[i1 + 1], pixels[i1 + 2], pixels[i1 + 3]);
      const c2 = nearestPico8Color(pixels[i2], pixels[i2 + 1], pixels[i2 + 2], pixels[i2 + 3]);
      // PICO-8 byte format: low nibble = left pixel, high nibble = right pixel
      packed.push((c2 << 4) | c1);
    }
  }

  return packed;
}

function loadSpriteImage(url: string): Promise<number[] | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = SPRITE_SIZE;
      canvas.height = SPRITE_SIZE;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, SPRITE_SIZE, SPRITE_SIZE);
      const imageData = ctx.getImageData(0, 0, SPRITE_SIZE, SPRITE_SIZE);
      resolve(processSprite(imageData));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function startSpriteTransfer(data: number[]): void {
  rawGpio[93] = 0;
  rawGpio[94] = TOTAL_CHUNKS;
  spriteTransfer = { data, chunkIndex: 0 };
  writeNextSpriteChunk(); // write first chunk immediately
}

// --- PokeAPI ---

async function fetchPokemon(id: number): Promise<PokemonData | null> {
  if (pokemonCache[id]) return pokemonCache[id];

  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
    if (!res.ok) {
      console.error(`PokeAPI error: ${res.status}`);
      return null;
    }
    const data = await res.json();

    const moves: MoveEntry[] = [];
    for (const move of data.moves) {
      for (const detail of move.version_group_details) {
        if (
          detail.version_group.name === "red-blue" &&
          detail.move_learn_method.name === "level-up"
        ) {
          moves.push({ level: detail.level_learned_at, name: move.move.name });
        }
      }
    }

    const pokemon: PokemonData = {
      name: data.name,
      id: data.id,
      height: data.height / 10,
      weight: data.weight / 10,
      types: data.types.map((t: { type: { name: string } }) => t.type.name),
      stats: data.stats.map((s: { base_stat: number }) => s.base_stat),
      moves,
      spriteData: null,
    };

    pokemonCache[id] = pokemon;
    return pokemon;
  } catch (err) {
    console.error("Failed to fetch pokemon:", err);
    return null;
  }
}

// --- Pre-caching ---

function wrapId(id: number): number {
  return ((id - 1 + 151) % 151) + 1; // wrap 1-151
}

async function precachePokemon(id: number): Promise<void> {
  const pokemon = await fetchPokemon(id);
  if (!pokemon || pokemon.spriteData) return;
  const spriteData = await loadSpriteImage(`./sprites/${id}.png`);
  if (spriteData) pokemon.spriteData = spriteData;
}

function precacheNeighbors(id: number): void {
  precachePokemon(wrapId(id - 1));
  precachePokemon(wrapId(id + 1));
}

// --- Render loop ---

let lastPokemon = 0;

function onRender(): void {
  const currentPokemon = rawGpio[1];
  if (lastPokemon !== currentPokemon) {
    lastPokemon = currentPokemon;
    // Cancel any in-progress sprite transfer
    spriteTransfer = null;
    rawGpio[93] = 0;

    fetchPokemon(currentPokemon).then((pokemon) => {
      if (!pokemon) return;
      // Don't send data if user already moved to another pokemon
      if (rawGpio[1] !== currentPokemon) return;

      writeNameToGpio(nameToBytes(pokemon.name));
      writeWeightToGpio(weightToBytes(pokemon.weight));
      writeHeightToGpio(weightToBytes(pokemon.height));
      writeStatsToGpio(pokemon.stats);
      writeMovesToGpio(pokemon.moves);
      writeTypesToGpio(pokemon.types);

      // Start sprite transfer (use cached data if available)
      if (pokemon.spriteData) {
        startSpriteTransfer(pokemon.spriteData);
      } else {
        loadSpriteImage(`./sprites/${currentPokemon}.png`).then((spriteData) => {
          if (!spriteData) return;
          pokemon.spriteData = spriteData;
          if (rawGpio[1] !== currentPokemon) return;
          startSpriteTransfer(spriteData);
        });
      }

      // Pre-cache neighbors in background
      precacheNeighbors(currentPokemon);
    });
  }

  // No manual processSpriteTransfer() needed — the Proxy handles it
  // automatically when Lua ACKs each chunk

  requestAnimationFrame(onRender);
}

requestAnimationFrame(onRender);
