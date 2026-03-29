const fs = require('fs');
const path = require('path');

const url = process.argv[2];

if (!url) {
  console.log('\n❌ Lỗi: Bạn phải nhập link trang Railway của bạn!');
  console.log('Sử dụng: node download_live_data.js <link-trang-cua-ban>');
  console.log('Ví dụ:   node download_live_data.js https://mind-flow-xyz.up.railway.app\n');
  process.exit(1);
}

const outDir = path.join(__dirname, 'live_backup');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir);
}

const uploadsDir = path.join(outDir, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

async function downloadJson(endpoint, filename) {
  try {
    const res = await fetch(`${url}${endpoint}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.text();
    fs.writeFileSync(path.join(outDir, filename), data);
    console.log(`✅ Lấy thành công: ${filename}`);
    return JSON.parse(data);
  } catch (err) {
    console.error(`❌ Cảnh báo - không thể lấy ${filename} từ ${endpoint}:`, err.message);
    return null;
  }
}

async function downloadFile(filePathUrl, destPath) {
  try {
    const res = await fetch(`${url}/${filePathUrl}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(destPath, Buffer.from(buffer));
    console.log(`🖼️ Tải ảnh: ${filePathUrl}`);
  } catch (err) {
    console.error(`❌ Lỗi tải ảnh ${filePathUrl}:`, err.message);
  }
}

async function run() {
  console.log(`\n⏳ Đang kết nối tới ${url} để lấy dữ liệu...\n`);

  const pages = await downloadJson('/api/pages', 'pages.json');
  await downloadJson('/api/folders', 'folders.json');
  const site = await downloadJson('/api/site', 'site.json');

  console.log(`\n⏳ Bắt đầu tải hình ảnh...`);
  
  // Tải avatar
  if (site && site.avatar) {
    await downloadFile(site.avatar, path.join(outDir, site.avatar));
  }

  // Tải ảnh Cover trong từng trang
  if (pages) {
    let imagesDownloaded = 0;
    for (const [id, page] of Object.entries(pages)) {
      if (page.hero && page.hero.startsWith('uploads/')) {
        await downloadFile(page.hero, path.join(outDir, page.hero));
        imagesDownloaded++;
      }
    }
    console.log(`\nĐã tải xong ảnh bìa (hero) của ${imagesDownloaded} trang.`);
  }

  console.log(`\n🎉 HOÀN TẤT. Toàn bộ dữ liệu của bạn đã được tải về thư mục "live_backup" an toàn.`);
}

run();
