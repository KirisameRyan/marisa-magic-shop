const Matter = globalThis.Matter;

if (!Matter) {
  throw new Error('Matter.js 未加载。请先引入 js/vendor/matter.min.js。');
}

export { Matter };
export default Matter;
