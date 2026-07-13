// Smoke test: serve the built app, load it in Chromium, exercise the main flows.
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'

const server = spawn('npx', ['vite', 'preview', '--port', '4823', '--strictPort'], {
  cwd: process.cwd(),
  stdio: 'ignore',
})
await new Promise((r) => setTimeout(r, 2500))

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

try {
  await page.goto('http://localhost:4823/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  const title = await page.title()
  console.log('title:', title)

  // Landing page first — with the flashcard demo
  const landing = await page.textContent('body')
  console.log('landing ok:', landing.includes('Create your account'))
  await page.click('.demo-wrap .flashcard')
  await page.waitForTimeout(300)
  console.log('demo card flips:', (await page.textContent('.demo-wrap')).includes('grade yourself'))

  // Enter local mode (no Supabase configured in CI)
  await page.click('a:has-text("continue on this device")')
  await page.waitForTimeout(1200)

  // Dismiss the first-run tour
  const skip = await page.$('.tour-tip button:has-text("Skip")')
  if (skip) {
    await skip.click()
    await page.waitForTimeout(300)
  }
  console.log('tour shown:', Boolean(skip))

  const body = await page.textContent('body')
  console.log('has dashboard:', body.includes('Boas-vindas'))
  console.log('word count visible:', /Total words/.test(body))

  // Navigate to Words
  await page.click('nav button:has-text("Words")')
  await page.waitForTimeout(600)
  const wordsText = await page.textContent('main')
  const m = wordsText.match(/Words\s*\((\d+)\)/)
  console.log('words listed:', m && m[1])

  // Flashcards: start a session and flip a card
  await page.click('nav button:has-text("Flashcards")')
  await page.waitForTimeout(400)
  await page.click('button:has-text("Start studying")')
  await page.waitForTimeout(400)
  await page.click('.flashcard')
  await page.waitForTimeout(300)
  const gradeButtons = await page.$$('.grade-row button')
  console.log('grade buttons:', gradeButtons.length)
  await gradeButtons[2].click() // "Good" → recognize
  await page.waitForTimeout(500)

  // Quiz — multiple choice
  await page.click('nav button:has-text("Quiz")')
  await page.waitForTimeout(300)
  await page.click('button:has-text("Start quiz")')
  await page.waitForTimeout(400)
  const opts = await page.$$('.quiz-option')
  console.log('quiz options:', opts.length)
  await opts[0].click()
  await page.waitForTimeout(300)

  // Quiz — typed recall mode
  await page.click('nav button:has-text("Home")')
  await page.waitForTimeout(300)
  await page.click('nav button:has-text("Quiz")')
  await page.waitForTimeout(300)
  await page.selectOption('select', 'typed')
  await page.click('button:has-text("Start quiz")')
  await page.waitForTimeout(400)
  await page.fill('input[placeholder*="Portuguese"]', 'xyzzy')
  await page.click('button:has-text("Check")')
  await page.waitForTimeout(300)
  const typedFeedback = await page.textContent('main')
  console.log('typed quiz ok:', /It.s/.test(typedFeedback))

  // Import: paste list, preview, confirm
  await page.click('nav button:has-text("Import")')
  await page.waitForTimeout(300)
  await page.fill('textarea', 'padoca, bakery (slang), noun, food\nvaler a pena, to be worth it, phrase')
  await page.click('button:has-text("Preview import")')
  await page.waitForTimeout(300)
  await page.click('button:has-text("Import 2 words")')
  await page.waitForTimeout(600)
  const importText = await page.textContent('main')
  console.log('import ok:', importText.includes('Imported 2'))

  // Lessons tab renders
  await page.click('nav button:has-text("Lessons")')
  await page.waitForTimeout(300)
  console.log('lessons ok:', (await page.textContent('main')).includes('Generate a lesson'))

  // Chat widget opens
  await page.click('.chat-fab')
  await page.waitForTimeout(300)
  console.log('chat ok:', (await page.textContent('.chat-panel')).includes('Zé'))
  await page.click('.chat-fab')

  // Notifications bell opens
  await page.click('[data-tour="bell"]')
  await page.waitForTimeout(300)
  console.log('bell ok:', Boolean(await page.$('.notif-panel')))
  await page.click('[data-tour="bell"]')

  // Settings renders
  await page.click('nav button:has-text("Settings")')
  await page.waitForTimeout(300)
  const settingsText = await page.textContent('main')
  console.log('settings ok:', settingsText.includes('Learning limit'))
  console.log('settings how-to ok:', settingsText.includes('Replay the app tour'))
  console.log('settings class ok:', settingsText.includes('My class'))

  // Admin (local mode profile is master)
  await page.click('nav button:has-text("Admin")')
  await page.waitForTimeout(400)
  console.log('admin ok:', (await page.textContent('main')).includes('All profiles'))

  await page.screenshot({ path: '/tmp/admin.png' })
  await page.click('nav button:has-text("Home")')
  await page.waitForTimeout(400)
  await page.screenshot({ path: '/tmp/dashboard.png', fullPage: true })
} finally {
  console.log('errors:', errors.length ? errors : 'none')
  await browser.close()
  server.kill()
}
