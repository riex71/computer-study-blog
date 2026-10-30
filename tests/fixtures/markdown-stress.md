# 본문에서 쓴 최상위 제목 {#body-title}

글 제목은 별도 입력란에 있고 본문의 최상위 제목은 절 제목으로 표시합니다.

[깊은 절로 이동](#deep-four) · [한글 주소](#한글-주소) · [맨 위](#)

[다른 글의 절](mamba-selective-ssm.html?v=test#section-03) · [글 목록](/computer-study-blog/archive.html?q=Markdown)

## 제목 단계와 목차 {#headings}

문단을 섞어 가며 제목의 크기와 계층, 주소를 확인합니다.

### 세 번째 단계 {#level-three}

여기에는 `inline_code`와 _기울임_, **굵게 적은 원문**이 있습니다. 굵은 표시는 블로그 설정에 따라 보통 굵기로 표시합니다.

#### 네 번째 단계: 수식 $h_t$와 코드 `x_t` {#deep-four}

목차에서 세 번째 단계 아래에 있어야 합니다. 같은 주소로 이동할 때 상단 메뉴에 가려지지 않아야 합니다.

##### 다섯 번째 단계 {#deep-five}

아래 단계까지 한꺼번에 펼쳐지는 제목 구조입니다.

###### 여섯 번째 단계와 아주 길고 길어서 여러 줄로 나뉘는 한국어 제목의 줄바꿈 검사 {#deep-six}

목차 번호와 제목이 겹치거나 오른쪽 화면 밖으로 나가면 안 됩니다.

### 다시 세 번째 단계 {#back-three}

앞의 여섯 번째 단계 밑으로 들어가면 안 됩니다.

## 중간 단계를 생략한 절 {#skipped}

#### 바로 네 번째 단계 {#skip-four}

빠진 단계를 빈 목차 항목으로 만들지 않고 가장 가까운 상위 절 아래에 둡니다.

## 같은 제목

서로 다른 주소가 필요합니다.

## 같은 제목

중복 제목도 두 번째 주소로 이동할 수 있어야 합니다.

## 한글 주소와 이모지 🙂 {#한글-주소}

한글 주소와 😀 같은 문자가 저장과 다시 불러오기에서 유지되어야 합니다.

###

위의 빈 제목은 목차에 빈 항목을 만들지 않습니다.

## 목록과 문단 {#lists}

- 첫 번째 항목
  - 하위 항목
    - 더 깊은 항목
- 두 번째 항목

3. 셋에서 시작하는 번호
4. 넷
   - 번호 목록 안의 일반 목록

- [x] 완료한 일
- [ ] 아직 하지 않은 일
  - [x] 완료한 하위 작업

이 문장은 공백 두 칸으로 줄을 바꿉니다.  
실제로 다음 줄입니다.

> 인용 안의 첫 문단
>
> 인용 안의 두 번째 문단과 `code`
>
> - 인용 안의 목록

~~취소한 문장~~과 정상 문장이 구분되어야 합니다. 75~80%, 20~25%는 범위로 남깁니다.

---

## 표와 그림 {#tables}

표 설명: 정렬·파이프·수식이 섞인 표입니다.

| 왼쪽 | 가운데 | 오른쪽 |
| :--- | :---: | ---: |
| 설명 | $x_i$ | 123.45 |
| 파이프 \| 문자 | `a\|b` | 678.9 |
| 줄바꿈<br>다음 줄 | 가운데 | 100 |

<table><caption>병합한 셀 유지</caption><thead><tr><th colspan="2">두 열을 합친 머리글</th></tr></thead><tbody><tr><td rowspan="2">두 행</td><td>A</td></tr><tr><td>B</td></tr></tbody></table>

![상태를 갱신하는 그림](../assets/mamba-state.svg)

그림 설명: 그림 설명과 [출처 링크](https://arxiv.org/abs/2312.00752)를 함께 유지합니다.

## 수식과 코드 {#formulas}

문장 안 수식 $x_{t-1}^2 + \alpha$와 괄호 수식 \(a_i+b_i\)입니다.

$$
\begin{aligned}
h_t &= \bar{A}h_{t-1} + \bar{B}x_t \\
y_t &= C h_t
\end{aligned}
$$

\[
\begin{bmatrix}1 & 2 \\ 3 & 4\end{bmatrix}
\]

백틱 안의 `$x_2$`는 수식이 아닙니다. 가격 $5 and $10도 수식이 아닙니다.

```python
def greet(name):
    return "안녕하세요 " + name

formula = "$x_1$"
print(greet("reader"))
```

```javascript
const values = [1, 2, 3];
console.log(values.map(x => x * 2));
```

```json
{"enabled": true, "count": 3, "text": "한글"}
```

```bash
printf '%s\n' "$HOME"
```

````markdown
```python
print("코드 안에 또 있는 코드 펜스")
```
````

```unknown-language
<script>window.injected = true</script>
일반 텍스트로 보여야 합니다.
```

## 접기·아래첨자·설명 도구 {#extras}

원시 HTML의 H<sub>2</sub>O와 x<sup>2</sup>를 유지합니다.

<details><summary>접힌 설명 열기</summary><p>설명 안의 <code>inline_code</code>와 기호를 보존합니다.</p></details>

:::engram-hash-demo
:::

## 긴 줄과 마지막 절 {#last}

긴 한국어 문장은 작은 화면에서 가로로 넘치지 않고 자연스럽게 줄을 바꿔야 합니다. 긴 한국어 문장은 작은 화면에서 가로로 넘치지 않고 자연스럽게 줄을 바꿔야 합니다.

```text
very_long_line_abcdefghijklmnopqrstuvwxyz_abcdefghijklmnopqrstuvwxyz_abcdefghijklmnopqrstuvwxyz_abcdefghijklmnopqrstuvwxyz_abcdefghijklmnopqrstuvwxyz
```

[깊은 절로 다시 이동](#deep-four)

## 참고 자료 {#references}

[GitHub Flavored Markdown](https://github.github.com/gfm/)

## 부록 {#appendix}

참고 자료 뒤에 오는 절도 일반 본문의 글자 크기와 여백으로 표시합니다.
