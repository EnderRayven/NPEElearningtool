import type { QuestionBank } from './types'

export const sampleBanks: QuestionBank[] = [
  {
    id: 'local-calculus', name: '高等数学 · 基础篇', description: '本地示例题库', source: 'local',
    chapters: [
      { id: 'limit', name: '第一章 函数、极限、连续', sections: [
        { id: 'limit-choice', name: '选择题', questions: [
          { id: 'q-limit-1', number: 1, type: '选择题', text: '设 f(x)=x²，则当 x→2 时，f(x) 的极限是（ ）', options: ['A. 2', 'B. 4', 'C. 6', 'D. 不存在'], answer: 'B. 4', analysis: '多项式函数在定义域内连续，因此可直接代入：lim f(x)=f(2)=4。' },
          { id: 'q-limit-2', number: 2, type: '选择题', text: '下列函数中，在 x=0 处连续的是（ ）', options: ['A. 1/x', 'B. sin x', 'C. ln x', 'D. sign(x)'], answer: 'B. sin x', analysis: 'sin x 在实数范围内处处连续。' }
        ]},
        { id: 'limit-fill', name: '填空题', questions: [
          { id: 'q-limit-3', number: 1, type: '填空题', text: '计算 lim(x→0) sin x / x = ______。', answer: '1', analysis: '这是第一个重要极限。' }
        ]}
      ]},
      { id: 'derivative', name: '第二章 导数与微分', sections: [
        { id: 'derivative-solve', name: '解答题', questions: [
          { id: 'q-derivative-1', number: 1, type: '解答题', text: '求函数 y=x³−3x²+2 在区间 [0,3] 上的最大值与最小值。', answer: '最大值 2，最小值 −2。', analysis: "y'=3x(x−2)，驻点为 0、2。比较 y(0)=2、y(2)=−2、y(3)=2，得到结论。" }
        ]}
      ]}
    ]
  },
  {
    id: 'local-linear', name: '线性代数 · 强化篇', description: '可与其他题库无缝切换', source: 'local', chapters: [
      { id: 'matrix', name: '第一章 行列式与矩阵', sections: [
        { id: 'matrix-choice', name: '选择题', questions: [
          { id: 'q-matrix-1', number: 1, type: '选择题', text: '若 A 为 n 阶可逆矩阵，则下列结论错误的是（ ）', options: ['A. |A|≠0', 'B. A⁻¹存在', 'C. r(A)=n', 'D. Ax=0 有非零解'], answer: 'D', analysis: '可逆矩阵对应的齐次方程只有零解。' }
        ]}
      ]}
    ]
  }
]
