const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const VECTORS_DIR = path.join(__dirname, '../client/assets/vectors');
const SPRITESHEET_PATH = path.join(__dirname, '../client/assets/vectors/Gemini_Generated_Image_78u40578u40578u4.png');

// 每个怪物的区域 (2816 / 6 = 469.33)
const MONSTERS = [
  { name: 'red_monster', startX: 0, width: 469 },
  { name: 'orange_monster', startX: 469, width: 469 },
  { name: 'pink_monster', startX: 469 * 2, width: 469 },
  { name: 'purple_monster', startX: 469 * 3, width: 469 },
  { name: 'blue_monster', startX: 469 * 4, width: 469 },
  { name: 'teal_monster', startX: 469 * 5, width: 469 }
];

async function extractSprites() {
  console.log('读取 Spritesheet 图片...');
  const spritesheet = sharp(SPRITESHEET_PATH);
  const metadata = await spritesheet.metadata();
  console.log(`图片尺寸: ${metadata.width} x ${metadata.height}`);

  for (const monster of MONSTERS) {
    const outputPath = path.join(VECTORS_DIR, `${monster.name}.png`);

    await sharp(SPRITESHEET_PATH)
      .extract({
        left: monster.startX,
        top: 0,
        width: monster.width,
        height: metadata.height
      })
      .toFile(outputPath);

    console.log(`✅ ${monster.name}.png`);
  }
  console.log('\n完成！已提取 6 张 PNG 图片。');
}

extractSprites();
