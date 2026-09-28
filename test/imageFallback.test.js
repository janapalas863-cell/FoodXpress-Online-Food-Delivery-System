const assert = require('node:assert/strict');
const { buildFallbackImageDataUri } = require('../public/imageUtils.js');

assert.match(buildFallbackImageDataUri('Fresh Lemon Cooler'), /^data:image\/svg\+xml/);
assert.match(buildFallbackImageDataUri('Chocolate Lava Cake'), /FoodXpress/);
console.log('image fallback test passed');
