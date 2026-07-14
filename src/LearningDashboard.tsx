import type { QuestionBank, QuestionStatus } from './types'
import { sortBanksForDisplay } from './bankSorting'
import { calculateLearningStats, formatRate } from './learningStats'

interface LearningDashboardProps {
  banks: QuestionBank[]
  statuses: Record<string, QuestionStatus>
}

const bankSubject = (bank: QuestionBank) => bank.id.startsWith('english-') || /英语/i.test(bank.name) ? '英语' : '数学'

export default function LearningDashboard({ banks, statuses }: LearningDashboardProps) {
  const overall = calculateLearningStats(banks, statuses)
  const details = [...sortBanksForDisplay(banks.filter(bank => bankSubject(bank) === '数学')), ...sortBanksForDisplay(banks.filter(bank => bankSubject(bank) === '英语'))]
    .map(bank => ({ bank, stats: calculateLearningStats([bank], statuses) }))

  return <section className="learning-dashboard">
    <div className="learning-heading"><span>MY LEARNING</span><h1>我的学习数据</h1><p>正确率仅按已标记题目计算，未标记题目不会影响结果。</p></div>
    <div className="learning-metrics">
      <article><span>当前正确率</span><strong>{formatRate(overall.accuracy)}</strong><small>{overall.marked ? `${overall.proficient} / ${overall.marked} 道已标记题` : '完成标记后开始统计'}</small></article>
      <article><span>学习进度</span><strong>{formatRate(overall.completion)}</strong><small>{overall.marked} / {overall.total} 道题已标记</small></article>
      <article><span>已掌握 / 正确</span><strong>{overall.proficient}</strong><small>计入正确率分子</small></article>
      <article><span>错题 / 错误</span><strong>{overall.wrong}</strong><small>建议优先复习</small></article>
    </div>
    <div className="learning-status-summary">
      <div><i/><span>未标记</span><strong>{overall.unmarked}</strong></div>
      <div><i className="green"/><span>熟练 / 正确</span><strong>{overall.proficient}</strong></div>
      <div><i className="yellow"/><span>模糊</span><strong>{overall.vague}</strong></div>
      <div><i className="red"/><span>错题 / 错误</span><strong>{overall.wrong}</strong></div>
    </div>
    <section className="bank-progress-panel">
      <div className="bank-progress-heading"><div><span>QUESTION BANKS</span><h2>题库学习详情</h2></div><small>共 {banks.length} 个题库</small></div>
      <div className="bank-progress-list">
        {details.map(({ bank, stats }) => <article key={bank.id} className="bank-progress-row">
          <div className="bank-progress-name"><span>{bankSubject(bank)}</span><strong>{bank.name}</strong><small>{stats.marked} / {stats.total} 道已标记</small></div>
          <div className="bank-progress-bar" aria-label={`${bank.name} 学习进度 ${formatRate(stats.completion)}`}><i style={{ width: formatRate(stats.completion) }}/></div>
          <div className="bank-progress-state"><span>正确率</span><strong>{formatRate(stats.accuracy)}</strong></div>
          <div className="bank-progress-counts"><span className="green-text">{stats.proficient} 正确</span><span className="yellow-text">{stats.vague} 模糊</span><span className="red-text">{stats.wrong} 错误</span></div>
        </article>)}
      </div>
    </section>
  </section>
}
