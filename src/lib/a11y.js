// Spread onto a clickable non-button element to make it keyboard-operable:
// <div onClick={fn} {...pressable(fn)}>
export function pressable(fn) {
  return {
    role: 'button',
    tabIndex: 0,
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        fn(e)
      }
    },
  }
}
