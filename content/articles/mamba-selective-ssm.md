<span id="section-01"></span>

문장을 왼쪽에서 오른쪽으로 읽으면서 중요한 내용만 메모한다고 생각해 보자. 메모의 크기가 정해져 있다면, 새 단어를 볼 때마다 무엇을 남기고 무엇을 지울지 골라야 한다. Mamba는 이런 선택을 시퀀스 모델의 상태 갱신 안에 넣는다.

이 글은 세 질문을 따라간다. 과거를 고정 크기 상태에 어떻게 남기는가. 현재 입력에 따라 무엇을 다르게 기억하는가. 순서대로 보이는 갱신을 학습에서는 어떻게 빠르게 계산하는가. 벡터와 행렬 곱을 알고 있다면 첫 갱신식부터 시작할 수 있다.

읽은 논문은 Gu와 Dao의 [Mamba: Linear-Time Sequence Modeling with Selective State Spaces, v2](https://arxiv.org/html/2312.00752v2)다. 2023년 12월 처음 공개됐으며 여기서는 2024년 5월 31일 개정본을 기준으로 설명한다. 뒤의 작은 수치 예제는 원리를 살펴보기 위해 만든 것으로, 학습된 Mamba 모델의 실험 결과가 아니다.

## 무엇을 상태에 기억하는가 {#section-02}

Transformer의 표준 self-attention은 토큰 쌍의 관계를 계산한다. 길이 $L$의 시퀀스에 대해 attention의 계산량은 대체로 $O(L^2)$로 커지고, 자기회귀 생성에서는 이전 토큰의 key와 value를 보관하는 KV cache도 문맥 길이와 함께 늘어난다.

상태 공간 모델, 즉 SSM은 이전 입력 전체를 그대로 들고 있는 대신 상태 $h_t$에 과거 정보를 요약한다. 다음 입력이 들어오면 상태를 갱신하고, 그 상태에서 출력 $y_t$를 읽는다. 모델의 크기와 설정이 같다면 recurrent state의 크기는 문맥 길이가 늘어도 일정하다. 대신 유한한 상태에 무엇을 압축해 둘지가 중요해진다.

### 상태 갱신식을 한 단계씩 읽기 {#section-03}

연속시간 SSM을 이산화한 기본 recurrence는 다음과 같이 쓸 수 있다. 식에서 위의 막대는 이산화된 계수라는 표시다.

$$
\begin{aligned}
h_t &= \bar{A}h_{t-1} + \bar{B}x_t \\
y_t &= Ch_t
\end{aligned}
$$

$h_{t-1}$은 이전까지 남긴 상태, $x_t$는 현재 입력이다. $\bar{A}$는 이전 상태를 다음 단계로 옮기는 방법이고, $\bar{B}$는 새 입력을 상태에 쓰는 방법이다. $C$는 상태에서 출력을 읽는다. 실제 모델에서는 벡터·행렬의 모양과 채널별 구조도 함께 봐야 한다.

아주 작은 스칼라 예제로 $\bar{A}=0.5$, $\bar{B}=1$, $C=1$, $h_0=0$을 정해 보자. 입력이 차례로 $2, 0, 0$이면 상태는 $2, 1, 0.5$가 된다. 처음 입력의 영향이 남지만, 뒤의 입력을 읽을수록 같은 규칙으로 줄어든다. 이는 설명용 계수이지 Mamba가 언제나 반씩 잊는다는 뜻은 아니다.

| 단계 $t$ | 입력 $x_t$ | 이전 상태 $h_{t-1}$ | 새 상태 $h_t$ |
| --- | --- | --- | --- |
| 1 | 2 | 0 | 2 |
| 2 | 0 | 2 | 1 |
| 3 | 0 | 1 | 0.5 |

선형 시불변, 즉 LTI SSM에서는 이런 전이·입력·출력 규칙이 위치마다 동일하다. 효율적으로 계산할 수 있지만, 내용에 따라 중요하지 않은 입력은 건너뛰고 중요한 입력은 오래 남기도록 조절하는 데 제약이 있다. [논문 §2](https://arxiv.org/html/2312.00752v2#S2)

## 입력에 따라 무엇을 선택하는가 {#section-04}

Mamba에서는 $B_t$, $C_t$, $\Delta_t$를 현재 입력 $x_t$에서 만든다. $\Delta_t$는 연속시간 시스템을 얼마나 진행시킬지 정하는 간격이며, 이산화 후의 $\bar{A}_t$와 $\bar{B}_t$에도 영향을 준다. 학습되는 기저 행렬 $A$ 자체를 토큰마다 새로 생성한다는 설명과는 구분해야 한다.

그 결과 상태를 옮기고, 새 정보를 쓰고, 출력을 읽는 방식이 입력에 따라 달라진다. 중요한 토큰 사이에 무관한 토큰이 여러 개 끼어 있어도 그 내용에 맞춰 상태를 조절할 길이 생기는 것이다. 논문의 selective copying 과제는 이런 선택의 필요성을 보여주는 예다. [논문 §3.1–3.2](https://arxiv.org/html/2312.00752v2#S3.SS1)

예를 들어 앞의 스칼라 식에서 관련 없는 입력일 때만 $a_t=1$, $b_t=0$으로 바꾸면 이전 상태를 유지하고 새 입력은 쓰지 않는다. 중요한 입력일 때 $b_t=1$로 두면 상태에 기록한다. 이는 입력별 계수의 역할을 분리해 보기 위한 것이다. 실제 Mamba의 선택 파라미터는 이런 수동 분기 대신 학습된 투영과 이산화로 만들어진다.

### 선택을 모델 블록에 넣기 {#section-05}

<img src="https://arxiv.org/html/2312.00752v2/architecture.svg" width="1144" height="448" alt="Mamba 원 논문 Figure 3. H3와 Mamba, Transformer 계열 블록의 구성 비교">

그림 설명: Gu & Dao, Figure 3, [원 논문](https://arxiv.org/html/2312.00752v2#S3.F3), CC BY 4.0. 원본 그대로 수록.

그림에서 Mamba 경로를 따라가면 입력이 두 갈래로 투영된다. 주 경로는 짧은 지역 패턴을 보는 Conv1D와 SiLU를 거쳐 selective SSM으로 상태를 갱신한다. 다른 경로는 SSM의 결과를 조절하는 게이트로 쓰인다. 둘을 원소별로 곱한 뒤 출력 투영을 거친다.

논문 설계에서는 attention 블록과 MLP 블록을 번갈아 쌓는 대신 이 Mamba 블록을 반복한다. 여기서 ‘선택’은 별도 검색 엔진이 토큰을 찾아주는 과정이 아니라 블록 안의 입력 의존적인 연산이다.

### 상태 안의 선택과 바깥의 게이트 {#section-07}

<img src="https://assets.ibm.com/is/image/ibm/mamba-block-1?dpr=off&amp;ts=1763387611245" width="3840" height="2160" alt="IBM Think의 Mamba 블록 해설. Conv1D와 selective SSM 경로 옆에 출력 게이트 경로가 놓여 있다">

그림 설명: IBM Think, [What is the Mamba model?](https://www.ibm.com/think/topics/mamba-model). 블록 구성의 보조 해설 도해.

이 도해는 두 갈래를 더 단순하게 보여준다. 앞에서 설명한 $B_t$, $C_t$, $\Delta_t$의 선택과, 오른쪽 경로가 SSM 출력에 곱해지는 게이트는 구분해서 읽는 편이 좋다. 하나는 상태를 쓰고 읽는 계산을 조절하고, 다른 하나는 그 결과를 블록 출력에 얼마나 통과시킬지 조절한다. ‘게이트가 있다’는 말 하나로 합치면 어떤 연산이 입력에 의존하는지 놓치기 쉽다.

## 순차 갱신을 어떻게 빠르게 계산하는가 {#section-06}

한 토큰씩 상태를 갱신하는 식만 보면 학습도 처음부터 끝까지 기다려야 할 것 같다. 하지만 이미 입력 시퀀스를 알고 있는 학습에서는 각 위치의 계수를 먼저 구할 수 있다. 그다음 상태에 대한 아핀 변환을 합성하는 성질을 이용한다.

두 갱신을 $T_1(h)=a_1h+b_1$, $T_2(h)=a_2h+b_2$라고 쓰면, 연속 적용한 결과는 다음과 같다.

$$
T_2(T_1(h))=(a_2a_1)h+(a_2b_1+b_2)
$$

변환의 합성은 결합법칙을 만족하므로 묶어서 계산하는 parallel scan을 구성할 수 있다. 이 식은 핵심 성질을 스칼라로 보여준 것이며, 실제 selective scan의 텐서 배치나 GPU 커널 전체를 표현한 것은 아니다.

Mamba의 hardware-aware 구현은 계산 순서뿐 아니라 메모리 이동도 다룬다. 큰 중간 상태를 HBM에 모두 펼쳐 저장하는 대신, fusion과 recomputation 등을 활용한다. 반면 자기회귀 추론에서는 새 토큰이 생길 때마다 recurrence를 한 단계 진행한다. 학습의 병렬화와 추론의 상태 갱신을 구분해서 읽어야 한다. [논문 §3.3](https://arxiv.org/html/2312.00752v2#S3.SS3)

### Transformer와 비교할 때 볼 것 {#section-08}

| 비교 항목 | 표준 attention 기반 Transformer | Mamba의 recurrent 계산 |
| --- | --- | --- |
| 과거를 보관하는 방식 | 토큰별 key/value cache | 정해진 크기의 상태 |
| 문맥 길이 증가의 영향 | cache가 늘어남 | 상태 크기는 고정 |
| 과거 정보 접근 | 이전 위치의 표현에 직접 attention | 상태에 남은 정보로 출력 계산 |
| 살펴볼 대가 | 긴 문맥의 계산·메모리 비용 | 제한된 상태에 정보를 압축하는 선택 |

이 표만으로 어느 모델이 항상 우월하다고 정할 수는 없다. 실제 처리량에는 모델 크기, 커널, 배치 크기, 하드웨어가 영향을 준다. 과거의 특정 내용을 정확하게 꺼내야 하는 과제와 스트림을 효율적으로 처리하는 과제도 구분해야 한다. attention과 SSM을 결합하는 hybrid 설계 역시 이런 차이를 함께 다루려는 방향이다.

### 성능 수치는 어떤 조건에서 나왔는가 {#section-09}

원 논문은 동일 규모 Transformer 대비 높은 생성 처리량과 문맥 길이에 대한 선형 확장을 보고한다. [§4.5와 Figure 8](https://arxiv.org/html/2312.00752v2#S4.SS5)은 속도와 메모리 비교를 볼 위치이고, [Appendix E.5](https://arxiv.org/html/2312.00752v2#A5.SS5)는 구현과 측정 설정을 확인할 위치다. 처음 소개된 ‘약 5배’라는 처리량도 해당 비교 조건의 결과로 읽어야 한다.

모델 성능 비교는 [§4.2](https://arxiv.org/html/2312.00752v2#S4.SS2)의 학습 설정과 downstream 평가를 함께 봐야 한다. 논문의 Mamba-3B가 더 큰 Transformer와 경쟁한다는 설명을 모든 모델·데이터·과제에 대한 보장으로 옮기지는 않겠다. 이 글의 작은 recurrence 예제는 그 결과를 재현하는 실험이 아니다.

### 작은 상태 갱신을 직접 확인하기 {#section-10}

아래 코드는 Python 표준 기능만 사용한다. 입력이 `[2, 9, 0, 3]`일 때 매번 같은 계수로 갱신하는 경우와, 두 번째 입력을 쓰지 않고 이전 상태를 유지하는 경우를 비교한다. 선택 규칙은 사람이 정했다. 학습이나 실제 Mamba 구현은 포함하지 않는다.

```python
def trace(inputs, coefficients):
    state = 0.0
    states = []
    for x, (a, b) in zip(inputs, coefficients):
        state = a * state + b * x
        states.append(state)
    return states

inputs = [2, 9, 0, 3]
fixed = [(0.5, 1.0)] * 4
selected = [(0.5, 1.0), (1.0, 0.0), (0.5, 1.0), (0.5, 1.0)]
print(trace(inputs, fixed))
print(trace(inputs, selected))
```

출력은 각각 `[2.0, 10.0, 5.0, 5.5]`, `[2.0, 2.0, 1.0, 3.5]`다. 두 번째 입력 9를 상태에 기록하지 않았을 때 뒤의 상태까지 달라지는 것을 볼 수 있다. 선택 모델이 더 좋은 답을 냈다는 실험이 아니라, 어느 값을 기록할지 바꾸는 것만으로 이후 계산이 달라진다는 확인이다.

[검증을 포함한 전체 Python 예제 내려받기](../examples/state_recurrence.py). 실행 명령은 `python3 state_recurrence.py`다. 학습 모델, GPU, 외부 패키지는 필요 없다. 예제는 순차 갱신과 아핀 변환 합성의 결과가 같은지도 확인한다.

여기서 더 공부한다면 선택 규칙을 학습하는 일, scan을 병렬화하는 일, 실제 GPU 메모리 이동을 줄이는 일을 나눠 살펴보고 싶다. [Engram 글](engram-conditional-memory.html)과 이어 읽을 때는 ‘상태를 갱신해 남긴 기억’과 ‘토큰으로 주소를 정해 읽는 기억’이 어떻게 다른지 비교하면 좋겠다.

## 참고 자료 {#sources-heading}

- Gu & Dao, [Mamba 원 논문 v2](https://arxiv.org/html/2312.00752v2), 2024-05-31 개정.
- [공식 구현 — state-spaces/mamba](https://github.com/state-spaces/mamba).
- IBM Think, [What is the Mamba model?](https://www.ibm.com/think/topics/mamba-model).
- IBM Think, [What are state space models?](https://www.ibm.com/think/topics/state-space-model).
