// Fault injection for the actual bundled entry: route selected embedded images
// through URLs so each test can deliberately abort the images it covers.
module.exports = (page, names = ['sky-castle.png', 'mage-snowman.png']) => page.addInitScript(names => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  let imageIndex = 0;
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    ...descriptor,
    set(value) {
      if (value.startsWith('data:image/png;base64,')) {
        const name = ['sky-castle.png', 'mage-snowman.png'][imageIndex++];
        if (names.includes(name)) value = `https://image-failure.test/assets/${name}`;
      }
      descriptor.set.call(this, value);
    },
  });
}, names);
