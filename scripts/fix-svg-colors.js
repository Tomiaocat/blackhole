const fs = require('fs');
const path = require('path');

const VECTORS_DIR = path.join(__dirname, '../client/assets/vectors');

// 从 spritesheet 图片中提取的颜色
const MONSTERS = [
  { name: 'red_monster', color: '#e74c3c' },
  { name: 'orange_monster', color: '#e67e22' },
  { name: 'pink_monster', color: '#e91e63' },
  { name: 'purple_monster', color: '#9b59b6' },
  { name: 'blue_monster', color: '#3498db' },
  { name: 'teal_monster', color: '#1abc9c' }
];

function fixSvgColors() {
  for (const monster of MONSTERS) {
    const svgPath = path.join(VECTORS_DIR, `${monster.name}.svg`);
    if (!fs.existsSync(svgPath)) {
      console.log(`⚠️  ${monster.name}.svg 不存在`);
      continue;
    }

    let svgContent = fs.readFileSync(svgPath, 'utf-8');

    // 移除已有的 fill 属性（如果有）
    svgContent = svgContent.replace(/fill="[^"]*"/g, '');

    // 为所有 path 元素添加 fill 属性
    svgContent = svgContent.replace(
      /<path\s+([^>]*)(?:\/?)>/g,
      (match, attrs) => {
        // 如果已经有 fill，跳过
        if (attrs.includes('fill=')) return match;
        return `<path ${attrs} fill="${monster.color}">`;
      }
    );

    // 处理没有属性的 path
    svgContent = svgContent.replace(
      /<path\s*(?:\/)?>/g,
      `<path fill="${monster.color}" />`
    );
    // 处理多行 path 结束标签
    svgContent = svgContent.replace(
      /<\/path>/g,
      `</path>`
    );

    fs.writeFileSync(svgPath, svgContent);
    console.log(`✅ ${monster.name}.svg -> ${monster.color}`);
  }
  console.log('\n完成！SVG 颜色已修复。');
}

fixSvgColors();
