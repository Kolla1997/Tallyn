import { createContext, useContext } from 'react'

// The bell and the light/dark switch, shown at the right end of each page's heading row on web
// (#267, Dinesh's diagram: Link a bank, Family and sharing, bell, theme on one line). Shell provides them;
// headings read them here, so the calm kit doesn't import the shell.
export const TopActions = createContext(null)
export const useTopActions = () => useContext(TopActions)
