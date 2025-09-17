const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: "/usr/bin/google-chrome",
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  const page = await browser.newPage();
  await page.goto('https://example.com');
  console.log(await page.title());  // 기대: "Example Domain"
  await browser.close();
})();