# 研途题库 · 本地增强版

一个本地优先的考研题库 Web 应用。题库、错题和掌握状态默认保存在当前浏览器的 `localStorage`，无需登录或后端服务。

## 启动

```bash
pnpm install
pnpm dev
```

生产构建：

```bash
pnpm build
pnpm preview
```

## 已实现

- 多题库、章节、小节无缝切换
- 选择题、填空题、解答题展示
- 熟练、模糊、错题标记及自动持久化
- 当前小节全文搜索与状态筛选
- 题号导航、上一题/下一题、答案解析折叠
- JSON 题库导入与完整数据备份
- 当前小节打印或另存为 PDF（含题目、答案和解析）
- 桌面端与移动端响应式布局

## 导入格式

可以导入单纯的题库数组，或含 `banks` 字段的备份文件。最小格式：

```json
{
  "banks": [{
    "id": "my-bank",
    "name": "我的强化题库",
    "source": "local",
    "chapters": [{
      "id": "chapter-1",
      "name": "第一章",
      "sections": [{
        "id": "section-1",
        "name": "选择题",
        "questions": [{
          "id": "question-1",
          "number": 1,
          "type": "选择题",
          "text": "题目正文",
          "options": ["A. 选项一", "B. 选项二"],
          "answer": "A",
          "analysis": "解析正文"
        }]
      }]
    }]
  }]
}
```

题目还支持 `imageUrl`、`answerImageUrl` 和 `videoUrl`。导入同 ID 题库时，新数据会替换旧数据；学习状态会继续保留。

## 数据说明

- 题库键：`npee:banks:v1`
- 状态键：`npee:status:v1`
- 点击顶部“备份”可导出题库和学习状态。
- 清除浏览器站点数据会删除本地内容，请定期备份。
