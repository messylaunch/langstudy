// Tiny shared context so the AI chat knows what the user is looking at.
let currentWord = null

export function setCurrentWord(word) {
  currentWord = word
}

export function getCurrentWord() {
  return currentWord
}
