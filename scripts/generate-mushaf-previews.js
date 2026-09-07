const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
  });
}

async function run() {
  const dir = path.join(__dirname, '..', 'assets', 'images', 'mushaf-previews');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  console.log('Downloading QCF V1 & V2 fonts...');
  const [v1Font, v2Font] = await Promise.all([
    download('https://verses.quran.foundation/fonts/quran/hafs/v1/woff2/p50.woff2'),
    download('https://verses.quran.foundation/fonts/quran/hafs/v2/woff2/p50.woff2'),
  ]);

  const hafsFont = fs.readFileSync(path.join(__dirname, '..', 'assets', 'fonts', 'UthmanicHafs1Ver18.ttf'));
  const indopakFont = fs.readFileSync(path.join(__dirname, '..', 'assets', 'fonts', 'indopak-nastaleeq-waqf-lazim-v4.2.1.ttf'));

  const v1Base64 = v1Font.toString('base64');
  const v2Base64 = v2Font.toString('base64');
  const hafsBase64 = hafsFont.toString('base64');
  const indopakBase64 = indopakFont.toString('base64');

  const monochromePacks = [
    {
      name: 'qcf-madani-v1',
      fontFamily: 'QCF1',
      fontFormat: 'woff2',
      fontData: v1Base64,
      fontSize: '32px',
      lineHeight: '45px',
      lines: [
        'ﭑﭒﭓﭔﭕﭖﭗﭘﭙﭚﭛﭜﭝ',
        'ﭞﭟﭠﭡﭢﭣﭤﭥﭦﭧ',
        'ﭨﭩﭪﭫﭬﭭﭮﭯﭰﭱﭲ',
      ],
    },
    {
      name: 'qcf-madani-v2',
      fontFamily: 'QCF2',
      fontFormat: 'woff2',
      fontData: v2Base64,
      fontSize: '31px',
      lineHeight: '45px',
      lines: [
        'ﱁﱂﱃﱄﱅﱆﱇﱈﱉﱊﱋﱌﱍ',
        'ﱎﱏﱐﱑﱒﱓﱔﱕﱖﱗ',
        'ﱘﱙﱚﱛﱜﱝﱞﱟﱠﱡﱢ',
      ],
    },
    {
      name: 'qpc-uthmani-hafs',
      fontFamily: 'QPC_Hafs',
      fontFormat: 'truetype',
      fontData: hafsBase64,
      fontSize: '29px',
      lineHeight: '45px',
      lines: [
        'الٓمٓ ﴿١﴾ ٱللَّهُ لَآ إِلَـٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ ﴿٢﴾',
        'نَزَّلَ عَلَيْكَ ٱلْكِتَـٰبَ بِٱلْحَقِّ مُصَدِّقًا لِّمَا بَيْنَ يَدَيْهِ',
        'وَأَنزَلَ ٱلتَّوْرَىٰةَ وَٱلْإِنجِيلَ ﴿٣﴾ مِن قَبْلُ هُدًى لِّلنَّاسِ',
      ],
    },
    {
      name: 'unicode-indopak-15',
      fontFamily: 'IndoPak',
      fontFormat: 'truetype',
      fontData: indopakBase64,
      fontSize: '26px',
      lineHeight: '45px',
      lines: [
        'الٓمّٓ ﴿۱﴾ اَللّٰهُ لَاۤ اِلٰهَ اِلَّا هُوَ الۡحَىُّ الۡقَيُّوۡمُ ﴿۲﴾',
        'نَزَّلَ عَلَيۡكَ الۡكِتٰبَ بِالۡحَقِّ مُصَدِّقًا لِّمَا بَيۡنَ يَدَيۡهِ',
        'وَاَنۡزَلَ التَّوۡرٰٮةَ وَالۡاِنۡجِيۡلَ ﴿۳﴾ مِنۡ قَبۡلُ هُدًى لِّلنَّاسِ',
      ],
    },
    {
      name: 'unicode-indopak-16',
      fontFamily: 'IndoPak',
      fontFormat: 'truetype',
      fontData: indopakBase64,
      fontSize: '25px',
      lineHeight: '45px',
      lines: [
        'الٓمّٓ ۚ﴿۱﴾ ذٰلِكَ الۡكِتٰبُ لَا رَيۡبَ فِيۡهِ هُدًى لِّلۡمُتَّقِيۡنَ ۙ﴿۲﴾',
        'الَّذِيۡنَ يُؤۡمِنُوۡنَ بِالۡغَيۡبِ وَيُقِيۡمُوۡنَ الصَّلٰوةَ',
        'وَمِمَّا رَزَقۡنٰهُمۡ يُنۡفِقُوۡنَ ۙ﴿۳﴾',
      ],
    },
  ];

  for (const p of monochromePacks) {
    const html = `<!doctype html>
<html dir="rtl">
<head>
<meta charset="utf-8"/>
<style>
  @font-face {
    font-family: "${p.fontFamily}";
    src: url("data:font/${p.fontFormat};base64,${p.fontData}") format("${p.fontFormat}");
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: transparent;
    width: 660px;
    height: 140px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    overflow: hidden;
    padding: 0 8px;
  }
  .line {
    font-family: "${p.fontFamily}", serif;
    font-size: ${p.fontSize};
    line-height: ${p.lineHeight};
    color: #FFFFFF;
    text-align: center;
    white-space: nowrap;
    width: 100%;
  }
</style>
</head>
<body>
  ${p.lines.map((l) => `<div class="line">${l}</div>`).join('\n  ')}
</body>
</html>`;

    const htmlPath = path.join(dir, `${p.name}.html`);
    const outPath = path.join(dir, `${p.name}.png`);
    fs.writeFileSync(htmlPath, html);
    execSync(
      `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --default-background-color=00000000 --window-size=660,140 --screenshot="${outPath}" "file://${htmlPath}"`
    );
    fs.unlinkSync(htmlPath);
    console.log(`Generated ${p.name}.png`);
  }

  // Tajweed Colors (Light & Dark)
  const tajweedRules = {
    light: { madd: '#DC2626', ghunnah: '#15803D', qalqalah: '#1D4ED8', base: '#374151' },
    dark: { madd: '#F87171', ghunnah: '#34D399', qalqalah: '#60A5FA', base: '#FFFFFF' },
  };

  for (const theme of ['light', 'dark']) {
    const pal = tajweedRules[theme];
    const line1 = `<span style="color:${pal.madd}">ﱁ</span><span>ﱂ</span><span>ﱃ</span><span style="color:${pal.madd}">ﱄ</span><span>ﱅﱆﱇﱈﱉ</span><span>ﱊ</span>`;
    const line2 = `<span>ﱎﱏﱐﱑﱒﱓﱔﱕ</span>`;
    const line3 = `<span style="color:${pal.ghunnah}">ﱘ</span><span>ﱙ</span><span style="color:${pal.ghunnah}">ﱚ</span><span>ﱛ</span><span>ﱜ</span><span style="color:${pal.qalqalah}">ﱝ</span><span>ﱞ</span><span style="color:${pal.ghunnah}">ﱟ</span><span style="color:${pal.ghunnah}">ﱠ</span><span>ﱡ</span><span style="color:${pal.ghunnah}">ﱢ</span>`;

    const html = `<!doctype html>
<html dir="rtl">
<head>
<meta charset="utf-8"/>
<style>
  @font-face {
    font-family: "QCF2";
    src: url("data:font/woff2;base64,${v2Base64}") format("woff2");
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: transparent;
    width: 660px;
    height: 140px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    overflow: hidden;
    padding: 0 8px;
  }
  .line {
    font-family: "QCF2", serif;
    font-size: 31px;
    line-height: 45px;
    color: ${pal.base};
    text-align: center;
    white-space: nowrap;
    width: 100%;
  }
</style>
</head>
<body>
  <div class="line">${line1}</div>
  <div class="line">${line2}</div>
  <div class="line">${line3}</div>
</body>
</html>`;

    const htmlPath = path.join(dir, `qcf-tajweed-v4-${theme}.html`);
    const outPath = path.join(dir, `qcf-tajweed-v4-${theme}.png`);
    fs.writeFileSync(htmlPath, html);
    execSync(
      `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --default-background-color=00000000 --window-size=660,140 --screenshot="${outPath}" "file://${htmlPath}"`
    );
    fs.unlinkSync(htmlPath);
    console.log(`Generated qcf-tajweed-v4-${theme}.png`);
  }
}

run().catch(console.error);
