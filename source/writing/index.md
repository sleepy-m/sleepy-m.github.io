---
title: Markdown 与数学公式写作示例
date: 2026-10-13
---

在在线编辑器中，点击正文右上角 **Source** 可以直接输入 Markdown 和 LaTeX 数学公式。保存发布后，博客负责渲染。编辑器的可视化模式不保证即时显示数学公式。

## Markdown

支持标题、**加粗**、*斜体*、列表、链接、图片、表格、引用和代码块。

| 内容 | 写法 |
| --- | --- |
| 标题 | `## 二级标题` |
| 加粗 | `**重要内容**` |
| 链接 | `[链接文字](https://example.com)` |
| 图片 | `![图片说明](/uploads/图片文件名.png)` |

```python
def square(x):
    return x ** 2
```

## 行内公式

输入 `$E=mc^2$`，显示为 $E=mc^2$。

下标和希腊字母也可以使用，例如 $x_i^2 + \alpha = \beta$。

## 独立公式

在独立的两行 `$$` 之间写公式：

```latex
$$
\frac{-b\pm\sqrt{b^2-4ac}}{2a}
$$
```

$$
\frac{-b\pm\sqrt{b^2-4ac}}{2a}
$$

## 矩阵与多行公式

```latex
$$
R=\begin{bmatrix}
\cos\theta & -\sin\theta \\
\sin\theta & \cos\theta
\end{bmatrix}
$$
```

$$
R=\begin{bmatrix}
\cos\theta & -\sin\theta \\
\sin\theta & \cos\theta
\end{bmatrix}
$$

$$
\begin{aligned}
f(x) &= x^2 + 2x + 1 \\
     &= (x+1)^2
\end{aligned}
$$

这里支持 LaTeX 数学语法，不提供完整 `.tex` 文件、宏包或文档排版编译。
