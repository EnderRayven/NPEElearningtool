import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import DraftBook from './DraftBookPanel'
import PenScrollController from './PenScrollController'
import './styles.css'
import './scrollbars.css'
import './compact-header.css'
import './learning-dashboard.css'
import './question-notes.css'
import './notes.css'
import './timer.css'
import './draftbook.css'
import './text-selection.css'
import './english-typography.css'
import 'katex/dist/katex.min.css'

const root = ReactDOM.createRoot(document.getElementById('root')!)

function renderPage(content: React.ReactNode) {
  root.render(<React.StrictMode><><PenScrollController/>{content}<DraftBook/></></React.StrictMode>)
}

// 首次启动自动载入默认题库；用户仍可从设置中切换到自己的数据目录。
renderPage(<App/>)
