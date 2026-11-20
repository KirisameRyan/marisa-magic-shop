const presets = {
  azur: {
    headline: "英伟达董事会调查发现，CEO黄仁勋玩碧蓝航线\n只婚中国舰船",
    quote: "“我们发现了黄仁勋的碧蓝航线账号，让我们震惊的是，他在这款舰船\n拟人的游戏中，坚持只与中国的舰船结婚！”一位明显受惊的英伟达高管说。",
    image: "azur-lane",
    category: [52, 33, 27],
    heading: [50, 100, 56, 69, 1238],
    body: [51, 73, 35, 50, 1250],
    date: [59, 70, 27],
    photoGap: 30,
    portrait: [45, 2, 564, 645],
    illustration: [613, 0, 625, 647]
  },
  warships: {
    headline: "英伟达董事会调查发现，CEO黄仁勋玩战舰世界\n只开射水鱼",
    quote: "“每次遇到黄仁勋他都拿声呐ping我的船尾真是扫码了”一位明显受惊的英伟达\n达高管说。",
    image: "warships",
    category: [53, 40, 27],
    heading: [50, 107, 56, 68, 1247],
    body: [54, 77, 34, 45, 1254],
    date: [60, 62, 27],
    photoGap: 33,
    portrait: [47, 0, 563, 646],
    illustration: [615, 59, 665, 518]
  },
  tarkov: {
    headline: "英伟达董事会调查发现，CEO黄仁勋玩逃离塔科夫只玩\nD2摔炮蹲撤离点",
    quote: "“遇到黄仁勋D2蹲撤离点真是扫码了”，一位明显受惊的英伟达高管如此说道。",
    image: "tarkov",
    category: [54, 44, 25],
    heading: [55, 109, 50, 67, 1265],
    body: [56, 77, 33, 44, 1253],
    date: [62, 106, 28],
    photoGap: 35,
    portrait: [49, 0, 567, 570],
    illustration: [626, 6, 654, 564]
  }
};

const fields = Object.fromEntries(
  ["preset", "category", "headline", "quote", "date", "picture", "restore",
    "preview", "dimensions", "status", "export"].map((id) => [id, document.getElementById(id)])
);
const context = fields.preview.getContext("2d", { alpha: false });
const textFont = 'Arial, "Reference Sans", "Noto Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif';
const graphemes = typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter("zh-CN", { granularity: "grapheme" })
  : null;
const width = 1280;
let portrait;
let illustration;
let imageRequest = 0;
let renderFrame = 0;

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image could not be decoded"));
    image.src = source;
  });
}

function wrap(text, example, maxWidth) {
  if (text === example) return example.split("\n");
  if (!text.trim()) return [];
  return text.trim().split("\n").flatMap((paragraph) => {
    const lines = [];
    const tokens = paragraph.match(/[a-zA-Z0-9]+(?:[.'-][a-zA-Z0-9]+)*|[^\x00-\x7f]+|[\s\S]/gu) ?? [];
    let line = "";
    for (const token of tokens) {
      const pieces = /^[a-zA-Z0-9]/.test(token) && context.measureText(token).width <= maxWidth
        ? [token]
        : graphemes
          ? Array.from(graphemes.segment(token), ({ segment }) => segment)
          : Array.from(token);
      for (const piece of pieces) {
        if (line && context.measureText(line + piece).width > maxWidth) {
          if (/^[，。！？、；：）】》”’]/.test(piece)) {
            const last = Array.from(line).pop();
            if (last && line.length > last.length) {
              lines.push(line.slice(0, -last.length).trimEnd());
              line = last + piece;
              continue;
            }
          }
          lines.push(line.trimEnd());
          line = "";
        }
        line += line ? piece : piece.trimStart();
      }
    }
    lines.push(line);
    return lines;
  });
}

function cover(image, x, y, w, h) {
  const scale = Math.min(image.naturalWidth / w, image.naturalHeight / h);
  const cropWidth = w * scale;
  const cropHeight = h * scale;
  context.drawImage(image, (image.naturalWidth - cropWidth) / 2,
    (image.naturalHeight - cropHeight) / 2, cropWidth, cropHeight, x, y, w, h);
}

function render() {
  const preset = presets[fields.preset.value];
  const [headingX, headingY, headingSize, headingStep, headingRight] = preset.heading;
  const [bodyX, bodyGap, bodySize, bodyStep, bodyRight] = preset.body;
  const [dateX, dateGap, dateSize] = preset.date;
  const headlineFont = `700 ${headingSize}px ${textFont}`;
  const quoteFont = `400 ${bodySize}px ${textFont}`;

  context.font = headlineFont;
  const headline = wrap(fields.headline.value, preset.headline, headingRight - headingX);
  context.font = quoteFont;
  const quote = wrap(fields.quote.value, preset.quote, bodyRight - bodyX);
  const bodyY = headingY + Math.max(0, headline.length - 1) * headingStep + bodyGap;
  const dateY = quote.length ? bodyY + (quote.length - 1) * bodyStep + dateGap : bodyY;
  const mediaY = dateY + preset.photoGap;
  const height = mediaY + Math.max(
    preset.portrait[1] + preset.portrait[3],
    preset.illustration[1] + preset.illustration[3]
  );
  if (fields.preview.height !== height) fields.preview.height = height;
  context.fillStyle = "#fcfcfc";
  context.fillRect(0, 0, width, height);

  const [categoryX, categoryY, categorySize] = preset.category;
  context.fillStyle = "#a62135";
  context.font = `700 ${categorySize}px ${textFont}`;
  context.fillText(fields.category.value, categoryX, categoryY, width - categoryX * 2);

  context.fillStyle = "#08090a";
  context.font = headlineFont;
  headline.forEach((line, index) => {
    context.fillText(line, headingX, headingY + index * headingStep, headingRight - headingX);
  });
  context.font = quoteFont;
  quote.forEach((line, index) => {
    context.fillText(line, bodyX, bodyY + index * bodyStep, bodyRight - bodyX);
  });
  context.font = `700 ${dateSize}px ${textFont}`;
  context.fillText(fields.date.value, dateX, dateY, width - dateX * 2);

  const [left, leftOffset, leftWidth, leftHeight] = preset.portrait;
  const [right, rightOffset, rightWidth, rightHeight] = preset.illustration;
  if (portrait) cover(portrait, left, mediaY + leftOffset, leftWidth, leftHeight);
  if (illustration) cover(illustration, right, mediaY + rightOffset, rightWidth, rightHeight);
  fields.dimensions.textContent = `${width} × ${height} px`;
}

function scheduleRender() {
  cancelAnimationFrame(renderFrame);
  renderFrame = requestAnimationFrame(render);
}

async function setIllustration(source, errorMessage) {
  const request = ++imageRequest;
  fields.status.textContent = "";
  fields.export.disabled = true;
  try {
    const next = await loadImage(source);
    if (request === imageRequest) illustration = next;
  } catch {
    if (request === imageRequest) fields.status.textContent = errorMessage;
  } finally {
    if (request === imageRequest) {
      fields.export.disabled = !portrait || !illustration;
      render();
    }
  }
}

function resetExample() {
  const preset = presets[fields.preset.value];
  fields.category.value = "arknights";
  fields.headline.value = preset.headline;
  fields.quote.value = preset.quote;
  fields.date.value = "November 17, 2026";
  fields.picture.value = "";
  illustration = null;
  render();
  return setIllustration(`assets/${preset.image}.png`, "示例配图加载失败，可以上传一张图片。");
}

["category", "headline", "quote", "date"].forEach((key) => {
  fields[key].addEventListener("input", scheduleRender);
});
fields.preset.addEventListener("change", resetExample);
fields.restore.addEventListener("click", resetExample);

fields.picture.addEventListener("change", async () => {
  const [file] = fields.picture.files;
  if (!file) return;
  const url = URL.createObjectURL(file);
  await setIllustration(url, "这张图片无法读取，请换一张 PNG、JPG 或 WebP。");
  URL.revokeObjectURL(url);
});

fields.export.addEventListener("click", () => {
  render();
  fields.preview.toBlob((blob) => {
    if (!blob) {
      fields.status.textContent = "PNG 导出失败，请重试。";
      return;
    }
    const url = URL.createObjectURL(blob);
    const download = document.createElement("a");
    download.href = url;
    download.download = "新闻梗图.png";
    download.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
});

resetExample();
Promise.all([
  loadImage("assets/portrait.png"),
  Promise.allSettled([
    document.fonts.load('400 36px "Reference Sans"', "新闻"),
    document.fonts.load('700 56px "Reference Sans"', "新闻")
  ])
]).then(([image]) => {
  portrait = image;
  fields.export.disabled = !illustration;
  render();
}).catch(() => {
  fields.status.textContent = "默认肖像加载失败，请确认 assets 文件夹和网页放在一起。";
});
